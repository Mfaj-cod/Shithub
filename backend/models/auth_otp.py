from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from backend.infra.database import Base


class AuthOTPChallenge(Base):
    __tablename__ = "auth_otp_challenges"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=True)
    email = Column(String, index=True, nullable=False)
    purpose = Column(String, index=True, nullable=False)
    code_hash = Column(String, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    resend_available_at = Column(DateTime, nullable=False)
    attempt_count = Column(Integer, default=0, nullable=False)
    max_attempts = Column(Integer, default=5, nullable=False)
    is_consumed = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
