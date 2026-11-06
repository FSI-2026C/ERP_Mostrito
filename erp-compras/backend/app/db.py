from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from . import config


class Base(DeclarativeBase):
    pass


engine = create_engine(config.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_schema():
    from . import models  # noqa: F401
    with engine.begin() as c:
        c.execute(text(f"CREATE SCHEMA IF NOT EXISTS {config.SCHEMA}"))
    Base.metadata.create_all(engine)
