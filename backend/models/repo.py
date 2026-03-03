from sqlalchemy import Column, Integer, String
from backend.infra.database import Base


class Repo(Base):
    __tablename__ = "repos"

    id = Column(Integer, primary_key=True)
    owner = Column(String, index=True)
    name = Column(String, index=True)
    path = Column(String)
