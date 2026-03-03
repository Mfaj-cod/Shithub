from backend.worker.celery_app import celery
from backend.infra.database import SessionLocal
from backend.models.job import Job

class JobService:

    @staticmethod
    def get_status(job_id: str):
        result = celery.AsyncResult(job_id)

        return {
            "job_id": job_id,
            "state": result.state,
            "result": result.result,
        }
    
    def get_repo_jobs(self, owner: str, name: str):
        db = SessionLocal()

        jobs = (
            db.query(Job)
            .filter(Job.repo == f"{owner}/{name}")
            .order_by(Job.created_at.desc())
            .all()
        )

        db.close()

        return [
            {
                "id": j.id,
                "task": j.task,
                "status": j.status,
                "created_at": j.created_at
            }
            for j in jobs
        ]
