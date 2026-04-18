import os
import pytest
import responses
from typer.testing import CliRunner

from cli.main import app

runner = CliRunner()

@pytest.fixture
def mock_auth():
    os.environ["SHITHUB_TOKEN"] = "test-token"
    yield
    if "SHITHUB_TOKEN" in os.environ:
        del os.environ["SHITHUB_TOKEN"]

@responses.activate
def test_list_repos():
    responses.add(
        responses.GET,
        "http://127.0.0.1:8000/repos/testowner",
        json=[{"name": "repo_a"}, {"name": "repo_b"}],
        status=200
    )
    result = runner.invoke(app, ["list", "testowner"])
    assert result.exit_code == 0
    assert "repo_a" in result.stdout
    assert "repo_b" in result.stdout

@responses.activate
def test_whoami(mock_auth):
    responses.add(
        responses.GET,
        "http://127.0.0.1:8000/auth/me",
        json={"username": "testuser", "email": "test@test.com"},
        status=200
    )
    result = runner.invoke(app, ["whoami"])
    assert result.exit_code == 0
    assert "testuser" in result.stdout

@responses.activate
def test_job():
    responses.add(
        responses.GET,
        "http://127.0.0.1:8000/jobs/job-123",
        json={"status": "completed", "id": "job-123"},
        status=200
    )
    result = runner.invoke(app, ["job", "job-123"])
    assert result.exit_code == 0
    assert "completed" in result.stdout
