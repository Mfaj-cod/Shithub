from pydantic import BaseModel, EmailStr # type: ignore
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile # type: ignore

from backend.core.auth import get_current_user
from backend.models.user import User
from backend.services.auth_service import AuthServiceError, auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterStartRequest(BaseModel):
    username: str
    email: EmailStr
    password: str


class LoginStartRequest(BaseModel):
    email: EmailStr
    password: str


def _raise_auth_error(exc: AuthServiceError):
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/register/start")
def register_start(payload: RegisterStartRequest):
    try:
        return auth_service.start_registration(
            username=payload.username,
            email=payload.email,
            password=payload.password,
        )
    except AuthServiceError as exc:
        _raise_auth_error(exc)


@router.post("/login/start")
def login_start(payload: LoginStartRequest):
    try:
        return auth_service.start_login(
            email=payload.email,
            password=payload.password,
        )
    except AuthServiceError as exc:
        _raise_auth_error(exc)


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    payload = auth_service.get_user_payload(current_user)
    payload["is_email_verified"] = current_user.is_email_verified
    return payload


@router.post("/me/avatar")
def upload_avatar(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    try:
        return auth_service.upload_avatar(current_user=current_user, upload_file=file)
    except AuthServiceError as exc:
        _raise_auth_error(exc)


@router.delete("/me/avatar")
def delete_avatar(current_user: User = Depends(get_current_user)):
    try:
        return auth_service.delete_avatar(current_user=current_user)
    except AuthServiceError as exc:
        _raise_auth_error(exc)
