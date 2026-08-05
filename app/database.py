from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

# Create database engine
engine = create_engine(settings.DATABASE_URL, echo=True)

# Create SessionLocal for request handling
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """Dependency that provides a database session for each API request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()