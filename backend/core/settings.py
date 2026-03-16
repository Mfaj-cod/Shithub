import os
import json
from typing import Annotated
from pydantic_settings import BaseSettings, NoDecode # type: ignore
from dotenv import load_dotenv
from pydantic import field_validator   # type: ignore
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
BUG_API_KEY = os.getenv("BUG_API_KEY")

class Settings(BaseSettings):
    BASE_URL: str = "http://127.0.0.1:8000"
    REPO_ROOT: str = "./repos"
    DATABASE_URL: str = "sqlite:///./shithub.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    GROQ_API_KEY: str | None = None
    BUG_API_KEY: str | None = None
    BUGAI_MODEL: str = "llama-3.3-70b-versatile"
    FRONTEND_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://shithub-frontend.onrender.com",
    ]
    JWT_SECRET_KEY: str = "5d6yv5t6d75tb67rv5t6d75tb67rv5t6d75tb67rv5t6d75tb67rv5t6d75tb67rv"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60
    MEDIA_ROOT: str = "./media"
    AVATAR_SUBDIR: str = "avatars"
    AVATAR_MAX_BYTES: int = 2_097_152
    AVATAR_ALLOWED_MIME: Annotated[list[str], NoDecode] = ["image/jpeg", "image/png", "image/webp"]

    @field_validator("FRONTEND_ORIGINS", "AVATAR_ALLOWED_MIME", mode="before")
    @classmethod
    def parse_csv_lists(cls, value):
        if isinstance(value, str):
            trimmed = value.strip()
            if trimmed.startswith("[") and trimmed.endswith("]"):
                try:
                    parsed = json.loads(trimmed)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except json.JSONDecodeError:
                    pass

            return [item.strip().strip("'\"") for item in trimmed.split(",") if item.strip()]
        return value


settings = Settings()
