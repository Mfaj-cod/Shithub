from celery import Celery # type: ignore
from backend.core.settings import settings

celery = Celery(
    "shithub",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["backend.worker.tasks"],
)

celery.conf.update(
    task_track_started=True,
    result_expires=3600,
)

celery.conf.task_serializer = "json"
celery.conf.result_serializer = "json"
celery.conf.accept_content = ["json"]

# register tasks
import backend.worker.tasks
