from fastapi import APIRouter, Depends, HTTPException # type: ignore
from pydantic import BaseModel # type: ignore
from backend.core.auth import require_owner_match
from backend.services.repo_service import RepoService

router = APIRouter(prefix="/repos", tags=["repos"])

service = RepoService()


class BuildWithAIRequest(BaseModel):
    prompt: str


class SaveBlobRequest(BaseModel):
    path: str
    content: str
    message: str | None = None


@router.post("/{owner}/{name}")
def create_repo(owner: str, name: str, _=Depends(require_owner_match)):
    return service.create_repo(owner, name)


@router.delete("/{owner}/{name}")
def delete_repo(owner: str, name: str, _=Depends(require_owner_match)):
    try:
        service.delete_repo(owner, name)
        return {"deleted": True}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.get("/{owner}")
def list_repos(owner: str):
    return service.list_repos(owner)

@router.post("/{owner}/{name}/ai/readme")
def ai_readme(owner: str, name: str, _=Depends(require_owner_match)):
    return service.ai_readme(owner, name)


@router.post("/{owner}/{name}/ai/build")
def ai_build(owner: str, name: str, payload: BuildWithAIRequest, _=Depends(require_owner_match)):
    try:
        return service.ai_build(owner, name, payload.prompt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

def _repo_dashboard(owner: str, name: str):
    try:
        return service.get_dashboard(owner, name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _repo_tree(owner: str, name: str, path: str = ""):
    try:
        return service.get_tree(owner, name, path)
    except ValueError as exc:
        detail = str(exc)
        status_code = 400 if detail == "Invalid path" else 404
        raise HTTPException(status_code=status_code, detail=detail) from exc


def _repo_blob(owner: str, name: str, path: str):
    try:
        return service.get_blob(owner, name, path)
    except ValueError as exc:
        detail = str(exc)
        status_code = 400 if detail in {"Invalid path", "Path is not a file"} else 404
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.get("/{owner}/{name}/dashboard")
def repo_dashboard(owner: str, name: str):
    return _repo_dashboard(owner, name)


@router.get("/{owner}/{name}/tree")
def repo_tree(owner: str, name: str, path: str = ""):
    return _repo_tree(owner, name, path)


@router.get("/{owner}/{name}/blob")
def repo_blob(owner: str, name: str, path: str):
    return _repo_blob(owner, name, path)


@router.put("/{owner}/{name}/blob")
def save_repo_blob(owner: str, name: str, payload: SaveBlobRequest, _=Depends(require_owner_match)):
    try:
        return service.save_blob(
            owner=owner,
            name=name,
            path=payload.path,
            content=payload.content,
            message=payload.message,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = 400
        if detail in {"Repo not found", "Repo path missing"}:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail="Failed to save file") from exc


@router.get("/repos/{owner}/{name}/dashboard", include_in_schema=False)
def repo_dashboard_alias(owner: str, name: str):
    return _repo_dashboard(owner, name)
