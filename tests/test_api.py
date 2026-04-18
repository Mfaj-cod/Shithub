import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)

def test_docs_reachable():
    response = client.get("/docs")
    assert response.status_code == 200
    assert b"Swagger UI" in response.content

def test_api_openapi_json():
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "openapi" in response.json()
