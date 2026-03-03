import hashlib
import hmac
import logging
import secrets
import smtplib
import uuid
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any

try:
    import bcrypt as bcrypt_lib  # type: ignore
except Exception:  # pragma: no cover
    bcrypt_lib = None
from fastapi import UploadFile  # type: ignore
import jwt  # type: ignore
from jwt import InvalidTokenError  # type: ignore
from passlib.context import CryptContext  # type: ignore

from backend.core.settings import settings
from backend.infra.database import SessionLocal
from backend.models.auth_otp import AuthOTPChallenge
from backend.models.user_profile import UserProfile
from backend.models.user import User

logger = logging.getLogger(__name__)


class AuthServiceError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class AuthService:
    OTP_PURPOSE_REGISTER = "register"
    OTP_PURPOSE_LOGIN = "login"
    AVATAR_MIME_EXTENSION = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }

    def __init__(self):
        self.password_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

    @staticmethod
    def _utcnow() -> datetime:
        return datetime.utcnow()

    @staticmethod
    def _normalize_email(email: str) -> str:
        return email.strip().lower()

    @staticmethod
    def _normalize_username(username: str) -> str:
        return username.strip()

    @staticmethod
    def _hash_otp(raw_otp: str) -> str:
        data = f"{raw_otp}:{settings.JWT_SECRET_KEY}".encode("utf-8")
        return hashlib.sha256(data).hexdigest()

    @staticmethod
    def _otp_payload(challenge: AuthOTPChallenge) -> dict[str, Any]:
        return {
            "challenge_id": challenge.id,
            "expires_at": challenge.expires_at,
            "resend_available_at": challenge.resend_available_at,
        }

    @staticmethod
    def _avatar_storage_path(file_name: str) -> str:
        return f"{settings.AVATAR_SUBDIR}/{file_name}".replace("\\", "/")

    @staticmethod
    def _absolute_avatar_file_path(avatar_path: str) -> Path:
        return Path(settings.MEDIA_ROOT) / Path(avatar_path)

    @staticmethod
    def _safe_remove_file(path: Path):
        try:
            if path.exists() and path.is_file():
                path.unlink()
        except OSError:
            logger.warning("Failed to remove avatar file: %s", path)

    @staticmethod
    def _build_avatar_url(avatar_path: str | None) -> str | None:
        if not avatar_path:
            return None
        base_url = settings.BASE_URL.rstrip("/")
        clean_path = avatar_path.strip("/").replace("\\", "/")
        return f"{base_url}/media/{clean_path}"

    def build_user_payload(self, user: User, profile: UserProfile | None = None) -> dict[str, Any]:
        return {
            "username": user.username,
            "email": user.email,
            "avatar_url": self._build_avatar_url(profile.avatar_path if profile else None),
        }

    @staticmethod
    def _get_profile(db, user_id: str) -> UserProfile | None:
        return db.query(UserProfile).filter(UserProfile.user_id == user_id).first()

    def get_user_payload(self, user: User) -> dict[str, Any]:
        db = SessionLocal()
        try:
            profile = self._get_profile(db, user.id)
            return self.build_user_payload(user, profile)
        finally:
            db.close()

    def _build_auth_payload(self, db, user: User) -> dict[str, Any]:
        access_token = self.create_access_token(user)
        profile = self._get_profile(db, user.id)
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": self.build_user_payload(user, profile),
        }

    def hash_password(self, password: str) -> str:
        return self.password_context.hash(password)

    @staticmethod
    def _is_bcrypt_hash(password_hash: str) -> bool:
        return password_hash.startswith("$2a$") or password_hash.startswith("$2b$") or password_hash.startswith("$2y$")

    def verify_password(self, password: str, password_hash: str) -> bool:
        # Backward compatibility: verify existing bcrypt hashes directly.
        if self._is_bcrypt_hash(password_hash):
            if bcrypt_lib is None:
                return False
            try:
                return bcrypt_lib.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
            except ValueError:
                return False

        return self.password_context.verify(password, password_hash)

    @staticmethod
    def _generate_otp() -> str:
        return f"{secrets.randbelow(1_000_000):06d}"

    def create_access_token(self, user: User) -> str:
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
        payload = {
            "sub": user.username,
            "email": user.email,
            "exp": expires_at,
        }
        return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    def decode_access_token(self, token: str) -> dict[str, Any]:
        try:
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            return payload
        except InvalidTokenError as exc:
            raise AuthServiceError(status_code=401, detail="Invalid authentication token") from exc

    def start_registration(self, username: str, email: str, password: str) -> dict[str, Any]:
        username = self._normalize_username(username)
        email = self._normalize_email(email)

        if not username:
            raise AuthServiceError(status_code=400, detail="Username is required")
        if not email:
            raise AuthServiceError(status_code=400, detail="Email is required")
        if len(password) < 8:
            raise AuthServiceError(status_code=400, detail="Password must be at least 8 characters")

        db = SessionLocal()
        try:
            user_by_username = db.query(User).filter(User.username == username).first()
            user_by_email = db.query(User).filter(User.email == email).first()

            if user_by_username and user_by_username.is_email_verified:
                raise AuthServiceError(status_code=409, detail="Username already exists")

            if user_by_email and user_by_email.is_email_verified:
                raise AuthServiceError(status_code=409, detail="Email already registered")

            if user_by_username and user_by_email and user_by_username.id != user_by_email.id:
                raise AuthServiceError(status_code=409, detail="Username or email already in use")

            user = user_by_username or user_by_email
            now = self._utcnow()
            if user:
                user.username = username
                user.email = email
                user.password_hash = self.hash_password(password)
                user.is_email_verified = True
                user.updated_at = now
            else:
                user = User(
                    id=str(uuid.uuid4()),
                    username=username,
                    email=email,
                    password_hash=self.hash_password(password),
                    is_email_verified=True,
                    created_at=now,
                    updated_at=now,
                )
                db.add(user)

            db.commit()
            return self._build_auth_payload(db, user)
        finally:
            db.close()

    def verify_registration(self, challenge_id: str, otp: str) -> dict[str, Any]:
        db = SessionLocal()
        try:
            challenge = self._validate_challenge(db, challenge_id, otp, self.OTP_PURPOSE_REGISTER)

            user = db.query(User).filter(User.id == challenge.user_id).first()
            if not user:
                raise AuthServiceError(status_code=404, detail="User not found")

            user.is_email_verified = True
            user.updated_at = self._utcnow()
            challenge.is_consumed = True
            db.commit()

            access_token = self.create_access_token(user)
            profile = self._get_profile(db, user.id)
            return {
                "access_token": access_token,
                "token_type": "bearer",
                "user": self.build_user_payload(user, profile),
            }
        finally:
            db.close()

    def start_login(self, email: str, password: str) -> dict[str, Any]:
        email = self._normalize_email(email)
        if not email:
            raise AuthServiceError(status_code=400, detail="Email is required")
        if not password:
            raise AuthServiceError(status_code=400, detail="Password is required")

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == email).first()
            if not user:
                raise AuthServiceError(status_code=404, detail="Email is not registered")

            if not self.verify_password(password, user.password_hash):
                raise AuthServiceError(status_code=401, detail="Invalid credentials")

            now = self._utcnow()
            if not user.is_email_verified:
                user.is_email_verified = True

            user.last_login_at = now
            user.updated_at = now
            db.commit()
            return self._build_auth_payload(db, user)
        finally:
            db.close()

    def verify_login(self, challenge_id: str, otp: str) -> dict[str, Any]:
        db = SessionLocal()
        try:
            challenge = self._validate_challenge(db, challenge_id, otp, self.OTP_PURPOSE_LOGIN)
            user = db.query(User).filter(User.id == challenge.user_id).first()
            if not user:
                raise AuthServiceError(status_code=404, detail="User not found")

            challenge.is_consumed = True
            user.last_login_at = self._utcnow()
            user.updated_at = self._utcnow()
            db.commit()

            access_token = self.create_access_token(user)
            profile = self._get_profile(db, user.id)
            return {
                "access_token": access_token,
                "token_type": "bearer",
                "user": self.build_user_payload(user, profile),
            }
        finally:
            db.close()

    def upload_avatar(self, current_user: User, upload_file: UploadFile) -> dict[str, Any]:
        content_type = (upload_file.content_type or "").lower().strip()
        if content_type not in settings.AVATAR_ALLOWED_MIME:
            raise AuthServiceError(status_code=400, detail="Unsupported image format")

        max_allowed = settings.AVATAR_MAX_BYTES
        content = upload_file.file.read(max_allowed + 1)
        if not content:
            raise AuthServiceError(status_code=400, detail="Avatar file is empty")
        if len(content) > max_allowed:
            raise AuthServiceError(status_code=400, detail="Avatar exceeds size limit")

        file_ext = self.AVATAR_MIME_EXTENSION.get(content_type)
        if not file_ext:
            raise AuthServiceError(status_code=400, detail="Unsupported image format")

        avatar_dir = Path(settings.MEDIA_ROOT) / settings.AVATAR_SUBDIR
        avatar_dir.mkdir(parents=True, exist_ok=True)

        file_name = f"{current_user.id}.{file_ext}"
        relative_path = self._avatar_storage_path(file_name)
        absolute_path = avatar_dir / file_name

        db = SessionLocal()
        try:
            profile = self._get_profile(db, current_user.id)
            if not profile:
                profile = UserProfile(
                    user_id=current_user.id,
                    avatar_path=None,
                    created_at=self._utcnow(),
                    updated_at=self._utcnow(),
                )
                db.add(profile)

            old_path = profile.avatar_path
            if old_path and old_path != relative_path:
                self._safe_remove_file(self._absolute_avatar_file_path(old_path))

            with open(absolute_path, "wb") as file_obj:
                file_obj.write(content)

            profile.avatar_path = relative_path
            profile.updated_at = self._utcnow()
            db.commit()
            db.refresh(profile)

            return {"user": self.build_user_payload(current_user, profile)}
        finally:
            db.close()

    def delete_avatar(self, current_user: User) -> dict[str, Any]:
        db = SessionLocal()
        try:
            profile = self._get_profile(db, current_user.id)
            if not profile or not profile.avatar_path:
                return {"user": self.build_user_payload(current_user, profile)}

            self._safe_remove_file(self._absolute_avatar_file_path(profile.avatar_path))
            profile.avatar_path = None
            profile.updated_at = self._utcnow()
            db.commit()
            db.refresh(profile)
            return {"user": self.build_user_payload(current_user, profile)}
        finally:
            db.close()

    def resend_otp(self, challenge_id: str) -> dict[str, Any]:
        db = SessionLocal()
        try:
            challenge = db.query(AuthOTPChallenge).filter(AuthOTPChallenge.id == challenge_id).first()
            if not challenge:
                raise AuthServiceError(status_code=404, detail="OTP challenge not found")
            if challenge.is_consumed:
                raise AuthServiceError(status_code=400, detail="OTP challenge already used")

            now = self._utcnow()
            if challenge.expires_at < now:
                raise AuthServiceError(status_code=400, detail="OTP challenge expired")
            if now < challenge.resend_available_at:
                raise AuthServiceError(status_code=429, detail="Please wait before requesting a new OTP")

            raw_otp = self._generate_otp()
            challenge.code_hash = self._hash_otp(raw_otp)
            challenge.attempt_count = 0
            challenge.expires_at = now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)
            challenge.resend_available_at = now + timedelta(seconds=settings.OTP_RESEND_COOLDOWN_SECONDS)
            db.commit()

            self._send_otp_email(email=challenge.email, purpose=challenge.purpose, otp_code=raw_otp)
            return self._otp_payload(challenge)
        finally:
            db.close()

    def _create_challenge(
        self,
        db,
        user_id: str | None,
        email: str,
        purpose: str,
    ) -> tuple[AuthOTPChallenge, str]:
        now = self._utcnow()
        db.query(AuthOTPChallenge).filter(
            AuthOTPChallenge.email == email,
            AuthOTPChallenge.purpose == purpose,
            AuthOTPChallenge.is_consumed.is_(False),
        ).update({"is_consumed": True}, synchronize_session=False)

        raw_otp = self._generate_otp()
        challenge = AuthOTPChallenge(
            id=str(uuid.uuid4()),
            user_id=user_id,
            email=email,
            purpose=purpose,
            code_hash=self._hash_otp(raw_otp),
            expires_at=now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
            resend_available_at=now + timedelta(seconds=settings.OTP_RESEND_COOLDOWN_SECONDS),
            attempt_count=0,
            max_attempts=settings.OTP_MAX_ATTEMPTS,
            is_consumed=False,
            created_at=now,
        )
        db.add(challenge)
        return challenge, raw_otp

    def _validate_challenge(self, db, challenge_id: str, otp: str, expected_purpose: str) -> AuthOTPChallenge:
        challenge = db.query(AuthOTPChallenge).filter(AuthOTPChallenge.id == challenge_id).first()
        if not challenge:
            raise AuthServiceError(status_code=404, detail="OTP challenge not found")

        if challenge.purpose != expected_purpose:
            raise AuthServiceError(status_code=400, detail="OTP challenge purpose mismatch")

        if challenge.is_consumed:
            raise AuthServiceError(status_code=400, detail="OTP challenge already used")

        now = self._utcnow()
        if challenge.expires_at < now:
            raise AuthServiceError(status_code=400, detail="OTP expired")

        if challenge.attempt_count >= challenge.max_attempts:
            raise AuthServiceError(status_code=400, detail="OTP attempts exceeded")

        supplied_hash = self._hash_otp(otp.strip())
        if not hmac.compare_digest(challenge.code_hash, supplied_hash):
            challenge.attempt_count += 1
            db.commit()
            if challenge.attempt_count >= challenge.max_attempts:
                raise AuthServiceError(status_code=400, detail="OTP attempts exceeded")
            raise AuthServiceError(status_code=400, detail="Invalid OTP")

        return challenge

    def _send_otp_email(self, email: str, purpose: str, otp_code: str):
        subject = "Sh*thub verification code"
        action = "login" if purpose == self.OTP_PURPOSE_LOGIN else "registration"
        body = (
            f"Welcome to Sh*thub!\n\n"
            f"Sh*thub is a collaborative platform that helps developers streamline their workflow, manage projects efficiently. Build with sh*tAI, fix bugs with bugAI and automate everything from building your sh*t to shipping your sh*t.\n\n"
            f"Use the following OTP code to complete your {action}:\n\n"
            f"Your Sh*thub {action} OTP is: {otp_code}\n"
            f"It expires in {settings.OTP_EXPIRE_MINUTES} minutes."
        )

        smtp_configured = bool(settings.SMTP_HOST and settings.SMTP_FROM_EMAIL)
        if not smtp_configured:
            self._handle_dev_fallback(email, otp_code)
            return

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = settings.SMTP_FROM_EMAIL
        message["To"] = email
        message.set_content(body)

        try:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
                if settings.SMTP_USE_TLS:
                    smtp.starttls()
                if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                    smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                smtp.send_message(message)
        except Exception as exc:
            if settings.AUTH_DEV_OTP_LOG:
                logger.warning("SMTP failed, using dev OTP log fallback: %s", exc)
                self._handle_dev_fallback(email, otp_code)
                return
            raise AuthServiceError(status_code=500, detail="Unable to send OTP email") from exc

    def _handle_dev_fallback(self, email: str, otp_code: str):
        if settings.AUTH_DEV_OTP_LOG:
            logger.warning("DEV OTP for %s: %s", email, otp_code)
            return
        raise AuthServiceError(status_code=500, detail="SMTP is not configured")


auth_service = AuthService()
