from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from backend.core.settings import settings

engine = create_engine(settings.DATABASE_URL, echo=False)

SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()
