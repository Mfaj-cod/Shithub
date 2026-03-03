import os
import subprocess
from fastapi import APIRouter, Request, Response # type: ignore
from backend.core.settings import settings

router = APIRouter()

exec_path = subprocess.check_output(["git", "--exec-path"]).decode().strip()
backend_binary = "git-http-backend.exe" if os.name == "nt" else "git-http-backend"
GIT_HTTP_BACKEND = os.path.join(exec_path, backend_binary)

if not os.path.exists(GIT_HTTP_BACKEND):
    fallback_binary = "git-http-backend" if backend_binary.endswith(".exe") else "git-http-backend.exe"
    fallback_path = os.path.join(exec_path, fallback_binary)
    if os.path.exists(fallback_path):
        GIT_HTTP_BACKEND = fallback_path


@router.api_route("/repos/{path:path}", methods=["GET", "POST"])
async def git_http(path: str, request: Request):
    """
    Proxy Git smart HTTP protocol to git-http-backend
    """

    env = os.environ.copy()
    body = await request.body()
    query_service = request.query_params.get("service", "")
    is_receive_pack = query_service == "git-receive-pack" or path.endswith("git-receive-pack")

    env.update({
        "GIT_PROJECT_ROOT": settings.REPO_ROOT,
        "GIT_HTTP_EXPORT_ALL": "1",
        "PATH_INFO": f"/{path}",
        "REQUEST_METHOD": request.method,
        "QUERY_STRING": request.url.query,
        "CONTENT_TYPE": request.headers.get("content-type", ""),
        "CONTENT_LENGTH": request.headers.get("content-length", str(len(body))),
    })

    # Local/dev mode: allow pushes over Smart HTTP without external web-server auth.
    if is_receive_pack:
        env["REMOTE_USER"] = "shithub"

    proc = subprocess.Popen(
        [GIT_HTTP_BACKEND],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env
    )

    stdout, _ = proc.communicate(body)

    # git-http-backend returns raw HTTP response
    header_blob, separator, content = stdout.partition(b"\r\n\r\n")
    if not separator:
        header_blob, separator, content = stdout.partition(b"\n\n")
    if not separator:
        return Response(stdout, media_type="text/plain", status_code=500)

    headers = {}
    status_code = 200

    for line in header_blob.replace(b"\r\n", b"\n").split(b"\n"):
        if not line.strip():
            continue
        if b":" in line:
            k, v = line.split(b":", 1)
            key = k.decode()
            value = v.decode().strip()
            if key.lower() == "status":
                try:
                    status_code = int(value.split(" ", 1)[0])
                except (TypeError, ValueError):
                    status_code = 500
            else:
                headers[key] = value

    return Response(content, headers=headers, status_code=status_code)
