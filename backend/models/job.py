from sqlalchemy import Column, String, DateTime
from datetime import datetime
from backend.infra.database import Base
from sqlalchemy import Text

logs = Column(Text, default="")

class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, index=True)
    repo = Column(String, index=True)
    task = Column(String)
    status = Column(String, default="queued")
    logs = logs
    created_at = Column(DateTime, default=datetime.utcnow)
