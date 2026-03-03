from celery import Celery # type: ignore

celery = Celery(
    "shithub",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0",
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
