from fastapi import APIRouter, HTTPException # type: ignore
from backend.services.job_service import JobService
from backend.worker.celery_app import celery

from backend.models.job import Job
from backend.infra.database import SessionLocal

router = APIRouter(prefix="/jobs", tags=["jobs"])
repo_router = APIRouter(prefix="/repos", tags=["jobs"])

service = JobService()


@router.get("/{job_id}")
def job_status(job_id: str):
    return service.get_status(job_id)


@router.get("/raw/{job_id}")
def job_status_raw(job_id: str):
    r = celery.AsyncResult(job_id)

    return {
        "id": job_id,
        "state": r.state,
        "result": r.result
    }


@router.get("/")
def list_jobs():
    db = SessionLocal()
    jobs = db.query(Job).order_by(Job.created_at.desc()).all()
    db.close()

    return [
        {
            "id": j.id,
            "repo": j.repo,
            "task": j.task,
            "created_at": j.created_at
        }
        for j in jobs
    ]

@repo_router.get("/{owner}/{name}/jobs")
def repo_jobs(owner: str, name: str):
    return service.get_repo_jobs(owner, name)


@router.get("/repos/{owner}/{name}/jobs", include_in_schema=False)
def repo_jobs_alias(owner: str, name: str):
    return service.get_repo_jobs(owner, name)


def _job_logs(job_id: str):
    db = SessionLocal()
    job = db.get(Job, job_id)
    db.close()

    if not job:
        raise HTTPException(status_code=404, detail="job not found")

    return {
        "id": job.id,
        "status": job.status,
        "logs": job.logs
    }


@router.get("/{job_id}/logs")
def job_logs(job_id: str):
    return _job_logs(job_id)


@router.get("/jobs/{job_id}/logs", include_in_schema=False)
def job_logs_alias(job_id: str):
    return _job_logs(job_id)
