from datetime import datetime

from sqlalchemy import Column, DateTime, String

from backend.infra.database import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id = Column(String, primary_key=True, index=True)
    avatar_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
