from fastapi import Depends, HTTPException # type: ignore
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer # type: ignore

from backend.infra.database import SessionLocal
from backend.models.user import User
from backend.services.auth_service import AuthServiceError, auth_service

security = HTTPBearer(auto_error=True)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    token = credentials.credentials

    try:
        payload = auth_service.decode_access_token(token)
    except AuthServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
    finally:
        db.close()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_email_verified:
        raise HTTPException(status_code=403, detail="Email is not verified")

    return user


def require_owner_match(owner: str, current_user: User = Depends(get_current_user)) -> User:
    if owner != current_user.username:
        raise HTTPException(
            status_code=403,
            detail="You can only modify repositories in your own namespace",
        )
    return current_user
