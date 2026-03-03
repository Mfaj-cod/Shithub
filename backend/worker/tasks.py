import subprocess
import tempfile
from pathlib import Path

from backend.infra.database import SessionLocal
from backend.models.job import Job
from backend.models.repo import Repo
from backend.services.ai_service import AIService
from backend.worker.celery_app import celery

ai = AIService()


def _run_command(job_id: str, cmd: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
    )

    log_parts = [f"$ {' '.join(cmd)}\n"]
    if result.stdout:
        log_parts.append(result.stdout)
    if result.stderr:
        log_parts.append(result.stderr)

    update_job(job_id, logs="".join(log_parts))

    if check:
        result.check_returncode()

    return result


def _safe_relative_path(raw_path: str) -> Path:
    normalized = (raw_path or "").strip().replace("\\", "/")
    parts = [part for part in normalized.split("/") if part]
    if not parts or any(part in {".", ".."} for part in parts):
        raise ValueError(f"Invalid generated path: {raw_path}")
    return Path(*parts)


@celery.task(name="backend.worker.tasks.generate_readme_task")
def generate_readme_task(owner: str, name: str, job_id: str):
    update_job(job_id, "running")

    db = SessionLocal()
    repo = db.query(Repo).filter_by(owner=owner, name=name).first()
    db.close()

    if not repo:
        update_job(job_id, "failed", "Repository not found.\n")
        return "repo not found"

    try:
        repo_path = Path(repo.path)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)

            _run_command(job_id, ["git", "clone", str(repo_path), str(tmp_path)])

            readme = ai.generate_readme(owner, name, tmp_path)
            (tmp_path / "README.md").write_text(readme, encoding="utf-8")

            _run_command(job_id, ["git", "add", "-A"], cwd=tmp_path)
            status_result = _run_command(job_id, ["git", "status", "--porcelain"], cwd=tmp_path, check=False)
            if not status_result.stdout.strip():
                update_job(job_id, "success", "No README changes to commit.\n")
                return "no changes"

            _run_command(
                job_id,
                [
                    "git",
                    "-c",
                    "user.name=Shithub-AI",
                    "-c",
                    "user.email=ai@shithub.local",
                    "commit",
                    "-m",
                    "AI: add README",
                ],
                cwd=tmp_path,
            )
            _run_command(job_id, ["git", "push"], cwd=tmp_path)

        update_job(job_id, "success", "README generation completed.\n")
        return "done"
    except Exception as exc:
        update_job(job_id, "failed", f"Error: {exc}\n")
        raise


@celery.task(name="backend.worker.tasks.build_with_shitai_task")
def build_with_shitai_task(owner: str, name: str, prompt: str, job_id: str):
    update_job(job_id, "running")

    db = SessionLocal()
    repo = db.query(Repo).filter_by(owner=owner, name=name).first()
    db.close()

    if not repo:
        update_job(job_id, "failed", "Repository not found.\n")
        return "repo not found"

    try:
        repo_path = Path(repo.path)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            _run_command(job_id, ["git", "clone", str(repo_path), str(tmp_path)])

            plan = ai.generate_code_changes(owner, name, tmp_path, prompt)
            commit_message = plan.get("commit_message", "shitAI: build requested changes")
            generated_files = plan.get("files", [])

            update_job(job_id, logs=f"Applying {len(generated_files)} generated file(s).\n")

            for generated in generated_files:
                rel_path = _safe_relative_path(generated.get("path", ""))
                target = (tmp_path / rel_path).resolve()
                target.relative_to(tmp_path.resolve())
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(generated.get("content", ""), encoding="utf-8")
                update_job(job_id, logs=f"updated: {rel_path.as_posix()}\n")

            _run_command(job_id, ["git", "add", "-A"], cwd=tmp_path)
            status_result = _run_command(job_id, ["git", "status", "--porcelain"], cwd=tmp_path, check=False)
            if not status_result.stdout.strip():
                update_job(job_id, "success", "No file changes to commit.\n")
                return "no changes"

            _run_command(
                job_id,
                [
                    "git",
                    "-c",
                    "user.name=shitAI",
                    "-c",
                    "user.email=shitai@shithub.local",
                    "commit",
                    "-m",
                    commit_message.strip()[:180] or "shitAI: build requested changes",
                ],
                cwd=tmp_path,
            )
            _run_command(job_id, ["git", "push"], cwd=tmp_path)

        update_job(job_id, "success", "Build with shitAI completed.\n")
        return "done"
    except Exception as exc:
        update_job(job_id, "failed", f"Error: {exc}\n")
        raise


def update_job(job_id: str, status: str | None = None, logs: str | None = None):
    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        if not job:
            return

        if status:
            job.status = status

        if logs:
            job.logs = (job.logs or "") + logs

        db.commit()
    finally:
        db.close()
