import os
import logging

from fastapi import FastAPI # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
from fastapi.staticfiles import StaticFiles # type: ignore
from backend.api.routes import repo
from backend.api.routes.auth import router as auth_router
from backend.api.routes.bugai import router as bugai_router
from backend.infra.database import Base, engine
from backend.api.routes.git_http import router as git_router
from backend.api.routes.jobs import router as jobs_router
from backend.api.routes.jobs import repo_router as repo_jobs_router
from backend.core.settings import settings
from backend.models.user_profile import UserProfile # noqa: F401
from backend.models.user import User # noqa: F401

app = FastAPI(title="Shithub")
logger = logging.getLogger(__name__)


def _run_schema_cleanup():
    # One-time compatibility cleanup: OTP auth was removed and this table is obsolete.
    with engine.begin() as connection:
        connection.exec_driver_sql("DROP TABLE IF EXISTS auth_otp_challenges")
    logger.info("Schema cleanup complete: dropped auth_otp_challenges if it existed.")

os.makedirs(settings.MEDIA_ROOT, exist_ok=True)
os.makedirs(os.path.join(settings.MEDIA_ROOT, settings.AVATAR_SUBDIR), exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(repo.router)
app.include_router(repo_jobs_router)
app.include_router(auth_router)
app.include_router(bugai_router)

_run_schema_cleanup()
Base.metadata.create_all(bind=engine)

app.mount("/media", StaticFiles(directory=settings.MEDIA_ROOT), name="media")

app.include_router(jobs_router)
app.include_router(git_router)
