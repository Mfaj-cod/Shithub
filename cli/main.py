import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

import requests
import typer  # type: ignore

app = typer.Typer()

API = os.getenv("SHITHUB_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
AUTH_DIR = Path.home() / ".shithub"
AUTH_FILE = AUTH_DIR / "auth.json"


def _load_auth() -> dict:
    if not AUTH_FILE.exists():
        return {}

    try:
        return json.loads(AUTH_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_auth(access_token: str, user: dict | None = None):
    AUTH_DIR.mkdir(parents=True, exist_ok=True)
    payload = {"access_token": access_token, "user": user or {}}
    AUTH_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _clear_auth():
    if AUTH_FILE.exists():
        AUTH_FILE.unlink()


def _get_token() -> str | None:
    env_token = os.getenv("SHITHUB_TOKEN")
    if env_token:
        return env_token

    return _load_auth().get("access_token")


def _auth_headers(required: bool = False) -> dict[str, str]:
    token = _get_token()

    if required and not token:
        typer.secho("Not authenticated. Run `shithub login` first.", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    if not token:
        return {}

    return {"Authorization": f"Bearer {token}"}


def _response_detail(response: requests.Response) -> str:
    try:
        data = response.json()
    except Exception:
        return f"{response.status_code} {response.reason}"

    if isinstance(data, dict):
        if isinstance(data.get("detail"), str):
            return data["detail"]
        if isinstance(data.get("error"), str):
            return data["error"]

    return str(data)


def _request(method: str, path: str, *, auth_required: bool = False, **kwargs):
    headers = dict(kwargs.pop("headers", {}))
    headers.update(_auth_headers(auth_required))

    response = requests.request(
        method=method,
        url=f"{API}{path}",
        headers=headers,
        timeout=20,
        **kwargs,
    )

    if not response.ok:
        detail = _response_detail(response)
        typer.secho(f"Error: {detail}", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    content_type = response.headers.get("content-type", "")
    if "application/json" in content_type:
        return response.json()
    return response.text()


def _repo_path(owner: str, name: str) -> str:
    return f"/repos/{quote(owner, safe='')}/{quote(name, safe='')}"


def _prompt_password_with_asterisks(prompt_text: str = "Password: ") -> str:
    if os.name != "nt" or not sys.stdin.isatty():
        return typer.prompt(prompt_text.rstrip(":"), hide_input=True)

    import msvcrt

    typer.echo(prompt_text, nl=False)
    chars: list[str] = []

    while True:
        ch = msvcrt.getwch()

        if ch in ("\r", "\n"):
            typer.echo()
            return "".join(chars)

        if ch == "\003":
            typer.echo()
            raise typer.Abort()

        if ch == "\b":
            if chars:
                chars.pop()
                typer.echo("\b \b", nl=False)
            continue

        if ch in ("\x00", "\xe0"):
            msvcrt.getwch()
            continue

        chars.append(ch)
        typer.echo("*", nl=False)


@app.command()
def create(owner: str, name: str):
    result = _request("POST", _repo_path(owner, name), auth_required=True)
    typer.echo(result)


@app.command()
def list(owner: str):
    repos = _request("GET", f"/repos/{quote(owner, safe='')}")

    for repo in repos:
        print(repo["name"])


@app.command()
def clone(owner: str, name: str):
    clone_url = f"{API}/repos/{quote(owner, safe='')}/{quote(name, safe='')}.git"
    subprocess.run(["git", "clone", clone_url], check=False)


@app.command()
def ai_readme(owner: str, name: str):
    result = _request("POST", f"{_repo_path(owner, name)}/ai/readme", auth_required=True)
    typer.echo(result)


@app.command()
def job(job_id: str):
    result = _request("GET", f"/jobs/{quote(job_id, safe='')}")
    typer.echo(result)


@app.command()
def login(
    email: str = typer.Option(..., prompt=True),
    password: str | None = typer.Option(None, "--password", "-p", help="Password (optional, prompt with masking if omitted)."),
):
    if not password:
        password = _prompt_password_with_asterisks()

    result = _request(
        "POST",
        "/auth/login/start",
        json={"email": email.strip(), "password": password},
    )

    token = result.get("access_token")
    user = result.get("user", {})

    if not token:
        typer.secho("Login failed: missing access token in response.", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    _save_auth(token, user)
    typer.secho(f"Logged in as {user.get('username', email)}", fg=typer.colors.GREEN)


@app.command()
def logout():
    _clear_auth()
    typer.secho("Logged out.", fg=typer.colors.GREEN)


@app.command()
def whoami():
    me = _request("GET", "/auth/me", auth_required=True)
    typer.echo(me)


if __name__ == "__main__":
    app()

"""
CLI flow:
Install CLI:

pip install -e .

Login once:
shithub login

Verify session:
shithub whoami

Run AI README:
shithub ai-readme honey testrepo

Note: in your example you ran readme_job, but you cloned testrepo; use the actual repo name.

If needed, clear session:
shithub logout

"""
