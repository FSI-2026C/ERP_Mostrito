import os
os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "postgresql+psycopg://compras:compras@localhost:5432/compras_test")
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text


@pytest.fixture(scope="session")
def client():
    from app.main import app
    from app.db import engine, Base
    with engine.begin() as c:
        c.execute(text("DROP SCHEMA IF EXISTS compras CASCADE"))
    with TestClient(app) as cl:
        yield cl


@pytest.fixture()
def H():
    return {"X-Empresa": "emp-prueba", "X-Usuario": "T-001"}
