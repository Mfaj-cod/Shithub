import subprocess
from pathlib import Path
import uuid
from backend.infra.database import SessionLocal
from backend.models.repo import Repo
from backend.infra.git_manager import GitManager
from backend.worker.tasks import build_with_shitai_task, generate_readme_task
from backend.models.job import Job

git = GitManager()

class RepoService:
    MAX_BLOB_VIEW_BYTES = 200_000

    def create_repo(self, owner: str, name: str):
        path = git.create_bare_repo(owner, name)

        db = SessionLocal()
        repo = Repo(owner=owner, name=name, path=str(path))
        db.add(repo)
        db.commit()
        db.close()

        return {"owner": owner, "name": name, "path": str(path)}

    def delete_repo(self, owner: str, name: str):
        db = SessionLocal()
        repo = db.query(Repo).filter_by(owner=owner, name=name).first()

        if not repo:
            db.close()
            raise ValueError("Repo not found")

        db.query(Job).filter(Job.repo == f"{owner}/{name}").delete()
        db.delete(repo)
        db.commit()
        db.close()

        git.delete_repo(owner, name)

    def list_repos(self, owner: str):
        db = SessionLocal()
        repos = db.query(Repo).filter(Repo.owner == owner).all()
        db.close()

        return [
            {
                "name": r.name,
                "owner": r.owner,
                "path": r.path
            }
            for r in repos
        ]
    


    def ai_readme(self, owner: str, name: str):
        job_id = str(uuid.uuid4())

        # save job first
        db = SessionLocal()
        db.add(Job(
            id=job_id,
            repo=f"{owner}/{name}",
            task="generate_readme",
            status="queued"
        ))
        db.commit()
        db.close()

        # then dispatch celery
        generate_readme_task.delay(owner, name, job_id)

        return {"job_id": job_id, "status": "queued"}

    def ai_build(self, owner: str, name: str, prompt: str):
        if not prompt.strip():
            raise ValueError("Build prompt is required")

        job_id = str(uuid.uuid4())

        db = SessionLocal()
        db.add(
            Job(
                id=job_id,
                repo=f"{owner}/{name}",
                task="build_with_shitai",
                status="queued",
            )
        )
        db.commit()
        db.close()

        build_with_shitai_task.delay(owner, name, prompt.strip(), job_id)

        return {"job_id": job_id, "status": "queued"}


    def get_dashboard(self, owner: str, name: str):
        db = SessionLocal()

        repo = db.query(Repo).filter_by(owner=owner, name=name).first()
        if not repo:
            db.close()
            raise ValueError("Repo not found")

        jobs = (
            db.query(Job)
            .filter(Job.repo == f"{owner}/{name}")
            .order_by(Job.created_at.desc())
            .limit(10)
            .all()
        )

        db.close()

        repo_path = Path(repo.path)

        if not repo_path.exists():
            raise ValueError("Repo path missing")

        # Git stats (works for bare and non-bare repos, including empty repos)
        branches = self._safe_git_lines(
            repo_path,
            ["git", "for-each-ref", "refs/heads", "--format=%(refname:short)"]
        )
        last_commit_raw = self._safe_git_output(
            repo_path,
            ["git", "log", "-1", "--pretty=%h|%s|%cr"]
        ).strip()
        last_commit = last_commit_raw or None
        commits_output = self._safe_git_output(
            repo_path,
            ["git", "log", "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%cr"]
        )
        recent_commits = []
        for line in commits_output.splitlines():
            parts = line.split("\x1f")
            if len(parts) != 5:
                continue
            full_hash, short_hash, message, author, relative_time = parts
            recent_commits.append(
                {
                    "hash": full_hash,
                    "short_hash": short_hash,
                    "message": message,
                    "author": author,
                    "relative_time": relative_time,
                }
            )
        files_output = self._safe_git_output(
            repo_path,
            ["git", "ls-tree", "-r", "--name-only", "HEAD"]
        )
        file_count = len([line for line in files_output.splitlines() if line.strip()])

        # size (rough disk usage)
        size = sum(f.stat().st_size for f in repo_path.rglob("*") if f.is_file())

        return {
            "name": repo.name,
            "owner": repo.owner,
            "branches": branches,
            "last_commit": last_commit,
            "files": file_count,
            "size_bytes": size,
            "recent_jobs": [
                {
                    "id": j.id,
                    "status": j.status,
                    "task": j.task
                }
                for j in jobs
            ],
            "recent_commits": recent_commits,
        }

    def get_tree(self, owner: str, name: str, path: str = ""):
        db = SessionLocal()
        repo = db.query(Repo).filter_by(owner=owner, name=name).first()
        db.close()

        if not repo:
            raise ValueError("Repo not found")

        repo_path = Path(repo.path)
        if not repo_path.exists():
            raise ValueError("Repo path missing")

        normalized_path = self._normalize_tree_path(path)
        treeish = "HEAD"

        if normalized_path:
            obj_type = self._safe_git_output(repo_path, ["git", "cat-file", "-t", f"HEAD:{normalized_path}"]).strip()
            if not obj_type:
                raise ValueError("Path not found")
            if obj_type != "tree":
                raise ValueError("Path is not a directory")
            treeish = f"HEAD:{normalized_path}"

        tree_output = self._safe_git_output(repo_path, ["git", "ls-tree", "-l", treeish])
        entries = []

        for line in tree_output.splitlines():
            if "\t" not in line:
                continue

            meta, item_name = line.split("\t", 1)
            parts = meta.split()
            if len(parts) < 4:
                continue

            item_type = parts[1]
            size_token = parts[3]
            size_bytes = int(size_token) if size_token.isdigit() else None
            clean_name = item_name.strip()

            full_path = f"{normalized_path}/{clean_name}" if normalized_path else clean_name
            entries.append(
                {
                    "name": clean_name,
                    "path": full_path,
                    "type": "dir" if item_type == "tree" else "file",
                    "size_bytes": size_bytes,
                }
            )

        entries.sort(key=lambda item: (item["type"] != "dir", item["name"].lower()))

        return {
            "path": normalized_path,
            "entries": entries,
        }

    def get_blob(self, owner: str, name: str, path: str):
        db = SessionLocal()
        repo = db.query(Repo).filter_by(owner=owner, name=name).first()
        db.close()

        if not repo:
            raise ValueError("Repo not found")

        repo_path = Path(repo.path)
        if not repo_path.exists():
            raise ValueError("Repo path missing")

        normalized_path = self._normalize_tree_path(path)
        if not normalized_path:
            raise ValueError("Invalid path")

        obj_type = self._safe_git_output(repo_path, ["git", "cat-file", "-t", f"HEAD:{normalized_path}"]).strip()
        if not obj_type:
            raise ValueError("Path not found")
        if obj_type != "blob":
            raise ValueError("Path is not a file")

        size_output = self._safe_git_output(repo_path, ["git", "cat-file", "-s", f"HEAD:{normalized_path}"]).strip()
        size_bytes = int(size_output) if size_output.isdigit() else 0

        raw_blob = self._safe_git_output_bytes(repo_path, ["git", "show", f"HEAD:{normalized_path}"])
        limited_blob = raw_blob[: self.MAX_BLOB_VIEW_BYTES]
        is_binary = b"\x00" in limited_blob

        if is_binary:
            content = ""
        else:
            content = limited_blob.decode("utf-8", errors="replace")

        truncated = len(raw_blob) > self.MAX_BLOB_VIEW_BYTES
        line_count = content.count("\n") + 1 if content else 0

        return {
            "path": normalized_path,
            "name": normalized_path.split("/")[-1],
            "size_bytes": size_bytes,
            "is_binary": is_binary,
            "truncated": truncated,
            "content": content,
            "line_count": line_count,
            "max_view_bytes": self.MAX_BLOB_VIEW_BYTES,
        }

    @staticmethod
    def _safe_git_output(repo_path: Path, cmd: list[str]) -> str:
        try:
            return subprocess.check_output(
                cmd,
                cwd=repo_path,
                text=True,
                stderr=subprocess.DEVNULL
            )
        except subprocess.CalledProcessError:
            return ""

    def _safe_git_lines(self, repo_path: Path, cmd: list[str]) -> list[str]:
        output = self._safe_git_output(repo_path, cmd)
        return [line for line in output.splitlines() if line.strip()]

    @staticmethod
    def _safe_git_output_bytes(repo_path: Path, cmd: list[str]) -> bytes:
        try:
            return subprocess.check_output(
                cmd,
                cwd=repo_path,
                stderr=subprocess.DEVNULL
            )
        except subprocess.CalledProcessError:
            return b""

    @staticmethod
    def _normalize_tree_path(path: str) -> str:
        normalized = (path or "").strip().strip("/")
        if not normalized:
            return ""

        parts = [part for part in normalized.split("/") if part]
        if any(part in {".", ".."} for part in parts):
            raise ValueError("Invalid path")

        return "/".join(parts)
