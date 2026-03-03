from typing import Literal

from fastapi import APIRouter, Depends, HTTPException  # type: ignore
from pydantic import BaseModel  # type: ignore

from backend.core.auth import get_current_user
from backend.models.user import User
from backend.services.ai_service import BugAIServiceError, AIService

router = APIRouter(prefix="/ai/bugai", tags=["bugai"])
ai_service = AIService()


class BugAIHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class BugAIAskRequest(BaseModel):
    prompt: str
    history: list[BugAIHistoryItem] = []
    owner: str | None = None
    repo: str | None = None


@router.post("/ask")
def ask_bugai(payload: BugAIAskRequest, current_user: User = Depends(get_current_user)):
    try:
        return ai_service.answer_bugai(
            prompt=payload.prompt,
            history=[{"role": item.role, "content": item.content} for item in payload.history],
            owner=payload.owner,
            repo=payload.repo,
            current_username=current_user.username,
        )
    except BugAIServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
