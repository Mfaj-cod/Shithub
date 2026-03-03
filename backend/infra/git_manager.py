import subprocess
import shutil
from pathlib import Path
from backend.core.settings import settings


class GitManager:
    def __init__(self):
        self.root = Path(settings.REPO_ROOT).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _run(self, *cmd: str, cwd: Path | None = None):
        subprocess.run(cmd, cwd=cwd, check=True)

    def repo_path(self, owner: str, name: str) -> Path:
        return (self.root / owner / f"{name}.git").resolve()

    def create_bare_repo(self, owner: str, name: str) -> Path:
        path = self.repo_path(owner, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        self._run("git", "init", "--bare", str(path))
        return path

    def delete_repo(self, owner: str, name: str):
        path = self.repo_path(owner, name)
        if path.exists():
            shutil.rmtree(path)
