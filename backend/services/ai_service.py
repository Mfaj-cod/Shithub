import ast
import json
import re
import warnings
from pathlib import Path
from typing import Any

from groq import Groq # type: ignore
from backend.core.settings import settings
from backend.infra.database import SessionLocal
from backend.models.repo import Repo


MAX_FILES = 500          # token safety
MODEL = "llama-3.1-8b-instant"
MAX_CODE_CONTEXT_FILES = 400
MAX_CODE_CONTEXT_BYTES = 5000
MAX_GENERATED_FILES = 30
MAX_JSON_ATTEMPTS = 3

MAX_BUGAI_HISTORY_ITEMS = 12
MAX_BUGAI_PROMPT_CHARS = 4000
MAX_BUGAI_MESSAGE_CHARS = 2000


class BugAIServiceError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class AIService:
    """
    Handles all LLM interactions.

    Responsibilities:
    - summarize repo structure
    - build prompt
    - call Groq
    - return markdown only
    """

    def __init__(self):
        self.client = Groq(api_key=settings.GROQ_API_KEY)
        bug_api_key = settings.BUG_API_KEY
        self.bugai_client = Groq(api_key=bug_api_key) if bug_api_key else None
        self.base_url = settings.BASE_URL.rstrip("/")

    def _chat_completion(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.2,
        json_mode: bool = False,
        model: str = MODEL,
        client: Groq | None = None,
    ) -> str:
        llm_client = client or self.client
        if llm_client is None:
            raise ValueError("LLM client is not configured")

        request_payload: dict = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if json_mode:
            request_payload["response_format"] = {"type": "json_object"}

        try:
            response = llm_client.chat.completions.create(**request_payload)
        except Exception:
            if not json_mode:
                raise
            # Fallback for SDK/model combinations that may not support response_format.
            request_payload.pop("response_format", None)
            response = llm_client.chat.completions.create(**request_payload)

        return (response.choices[0].message.content or "").strip()

    # repo summarization
    def _summarize_repo(self, repo_path: Path) -> str:
        files = []

        for p in repo_path.rglob("*"):
            if not p.is_file():
                continue

            if ".git" in str(p):
                continue

            files.append(str(p.relative_to(repo_path)))

        return "\n".join(files[:MAX_FILES])

    # prompt builder
    def _build_prompt(self, owner: str, name: str, structure: str) -> str:
        clone_url = f"{self.base_url}/repos/{owner}/{name}.git"

        return f"""
You are a senior open-source maintainer.

Write a high quality README.md.

Rules:
- Never mention GitHub
- Use THIS clone URL exactly: {clone_url}
- Output ONLY markdown

Repository:
name: {name}

Files:
{structure}

Sections required:
- Title
- Description
- Features
- Installation
- Usage
- Tech stack (best guess)
- Contributing
"""

    # public API
    def generate_readme(self, owner: str, name: str, repo_path: Path) -> str:
        structure = self._summarize_repo(repo_path)
        prompt = self._build_prompt(owner, name, structure)

        return self._chat_completion(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            json_mode=False,
        )

    @staticmethod
    def _is_probably_binary(data: bytes) -> bool:
        return b"\x00" in data

    def _build_code_context(self, repo_path: Path) -> tuple[str, str]:
        all_files: list[str] = []
        snippet_blocks: list[str] = []
        snippet_count = 0

        for path in sorted(repo_path.rglob("*")):
            if not path.is_file():
                continue
            if ".git" in path.parts:
                continue

            rel = str(path.relative_to(repo_path)).replace("\\", "/")
            all_files.append(rel)

            if snippet_count >= MAX_CODE_CONTEXT_FILES:
                continue

            try:
                raw = path.read_bytes()
            except OSError:
                continue

            if self._is_probably_binary(raw):
                continue

            text = raw[:MAX_CODE_CONTEXT_BYTES].decode("utf-8", errors="replace")
            snippet_blocks.append(f"### {rel}\n{text}")
            snippet_count += 1

        return "\n".join(all_files[:MAX_FILES]), "\n\n".join(snippet_blocks)

    @staticmethod
    def _find_first_json_object(text: str) -> str:
        start_index = -1
        depth = 0
        in_string = False
        escape = False

        for i, char in enumerate(text):
            if in_string:
                if escape:
                    escape = False
                    continue
                if char == "\\":
                    escape = True
                    continue
                if char == '"':
                    in_string = False
                continue

            if char == '"':
                in_string = True
                continue

            if char == "{":
                if depth == 0:
                    start_index = i
                depth += 1
                continue

            if char == "}":
                if depth == 0:
                    continue
                depth -= 1
                if depth == 0 and start_index != -1:
                    return text[start_index : i + 1]

        return ""

    @staticmethod
    def _extract_json_payload(raw_text: str) -> dict:
        text = (raw_text or "").strip()

        if text.startswith("```"):
            lines = text.splitlines()
            if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].strip() == "```":
                text = "\n".join(lines[1:-1]).strip()
            if text.startswith("json"):
                text = text[4:].strip()

        json_candidate = AIService._find_first_json_object(text)
        if not json_candidate:
            raise ValueError("AI response did not contain JSON")

        payload = AIService._parse_json_like(json_candidate)
        if not isinstance(payload, dict):
            raise ValueError("AI response JSON root must be an object")
        return payload

    @staticmethod
    def _normalize_json_like(text: str) -> str:
        normalized = text
        normalized = normalized.replace("\u201c", '"').replace("\u201d", '"')
        normalized = normalized.replace("\u2018", "'").replace("\u2019", "'")
        normalized = re.sub(r",\s*([}\]])", r"\1", normalized)
        return normalized

    @staticmethod
    def _escape_invalid_json_backslashes(text: str) -> str:
        # Keep valid JSON escapes and escape stray "\" sequences such as "\)".
        return re.sub(r'\\(?!["\\/bfnrtu])', r"\\\\", text)

    @staticmethod
    def _parse_json_like(text: str) -> dict:
        normalized = AIService._normalize_json_like(text)
        candidates = [
            text,
            normalized,
            AIService._escape_invalid_json_backslashes(text),
            AIService._escape_invalid_json_backslashes(normalized),
        ]

        for candidate in candidates:
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                continue

        for candidate in candidates:
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", SyntaxWarning)
                    parsed = ast.literal_eval(candidate)
            except (ValueError, SyntaxError):
                continue
            if isinstance(parsed, dict):
                return parsed

        raise ValueError("AI response JSON parsing failed")

    def _repair_json_with_llm(self, raw_text: str) -> dict:
        repair_prompt = f"""
You convert malformed JSON-like text into strict RFC8259 JSON.
Output only valid JSON object with double-quoted keys and strings.
No markdown fences, no explanation.

Input text:
{raw_text}
"""
        repaired_text = self._chat_completion(
            messages=[{"role": "user", "content": repair_prompt}],
            temperature=0,
            json_mode=True,
        )
        return self._extract_json_payload(repaired_text)

    @staticmethod
    def _sanitize_bugai_history(history: list[dict[str, Any]] | None) -> list[dict[str, str]]:
        if not history:
            return []

        cleaned: list[dict[str, str]] = []
        for item in history[-MAX_BUGAI_HISTORY_ITEMS:]:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role", "")).strip().lower()
            content = item.get("content")
            if role not in {"user", "assistant"}:
                continue
            if not isinstance(content, str):
                continue
            text = content.strip()
            if not text:
                continue
            cleaned.append(
                {
                    "role": role,
                    "content": text[:MAX_BUGAI_MESSAGE_CHARS],
                }
            )
        return cleaned

    @staticmethod
    def _normalize_bugai_answer(answer: str) -> str:
        text = (answer or "").strip()
        if not text:
            return text

        # Remove markdown code fences while preserving code content.
        text = re.sub(r"^\s*`{3,}.*$", "", text, flags=re.MULTILINE)
        text = re.sub(r"^\s*`+\s*$", "", text, flags=re.MULTILINE)

        # Remove heading markers and bold markers.
        text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.MULTILINE)
        text = text.replace("**", "")

        # Convert markdown bullet markers to plain bullets.
        text = re.sub(r"^\s*\*\s+", "- ", text, flags=re.MULTILINE)

        # Collapse excessive blank lines created during cleanup.
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def _resolve_bugai_context(
        self,
        owner: str | None,
        repo: str | None,
        current_username: str,
    ) -> tuple[bool, str | None, str]:
        normalized_owner = (owner or "").strip()
        normalized_repo = (repo or "").strip()

        if not normalized_owner and not normalized_repo:
            return False, None, ""
        if not normalized_owner or not normalized_repo:
            raise BugAIServiceError(status_code=400, detail="Both owner and repo are required when using repository context")
        if normalized_owner != current_username:
            raise BugAIServiceError(status_code=403, detail="You can only use repository context in your own namespace")

        db = SessionLocal()
        try:
            repo_row = db.query(Repo).filter_by(owner=normalized_owner, name=normalized_repo).first()
        finally:
            db.close()

        if not repo_row:
            raise BugAIServiceError(status_code=404, detail="Repository not found")

        repo_path = Path(repo_row.path)
        if not repo_path.exists():
            raise BugAIServiceError(status_code=404, detail="Repository path missing")

        structure, snippets = self._build_code_context(repo_path)
        context_text = (
            f"Repository: {normalized_owner}/{normalized_repo}\n"
            f"Tree snapshot:\n{structure}\n\n"
            f"Sample file snippets:\n{snippets}"
        )
        return True, f"{normalized_owner}/{normalized_repo}", context_text

    def answer_bugai(
        self,
        prompt: str,
        history: list[dict[str, Any]] | None = None,
        owner: str | None = None,
        repo: str | None = None,
        current_username: str = "",
    ) -> dict[str, Any]:
        clean_prompt = (prompt or "").strip()
        if not clean_prompt:
            raise BugAIServiceError(status_code=400, detail="Prompt is required")
        if len(clean_prompt) > MAX_BUGAI_PROMPT_CHARS:
            raise BugAIServiceError(status_code=400, detail=f"Prompt must be <= {MAX_BUGAI_PROMPT_CHARS} characters")
        if not current_username:
            raise BugAIServiceError(status_code=401, detail="Not authenticated")

        context_used, context_repo, context_text = self._resolve_bugai_context(owner, repo, current_username)
        safe_history = self._sanitize_bugai_history(history)

        system_prompt = (
            "You are bugAI, an expert software engineering assistant. "
            "Answer coding questions with clear, actionable guidance. "
            "Prefer concise explanations, runnable examples, and explicit assumptions. "
            "Never claim you executed code unless the user explicitly provided outputs. "
            "Return plain text only (no markdown headings, no bold markers, no fenced code blocks). "
            "If you include code, provide raw code directly with normal indentation."
        )

        messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
        if context_used and context_text:
            messages.append(
                {
                    "role": "system",
                    "content": (
                        "Use this repository context to ground your answer. "
                        "If context is insufficient, say what is missing.\n\n"
                        f"{context_text}"
                    ),
                }
            )

        messages.extend(safe_history)
        messages.append({"role": "user", "content": clean_prompt})

        if not self.bugai_client:
            raise BugAIServiceError(status_code=500, detail="bugAI client is not configured")

        try:
            answer = self._chat_completion(
                messages=messages,
                temperature=0.2,
                json_mode=False,
                model=settings.BUGAI_MODEL,
                client=self.bugai_client,
            )
        except Exception as exc:
            raise BugAIServiceError(status_code=500, detail="bugAI request failed") from exc

        if not answer.strip():
            raise BugAIServiceError(status_code=500, detail="bugAI returned an empty answer")

        clean_answer = self._normalize_bugai_answer(answer)

        return {
            "answer": clean_answer,
            "model": settings.BUGAI_MODEL,
            "context_used": context_used,
            "context_repo": context_repo,
        }

    def generate_code_changes(self, owner: str, name: str, repo_path: Path, instruction: str) -> dict:
        if not instruction.strip():
            raise ValueError("Build instruction is required")

        structure, snippets = self._build_code_context(repo_path)
        clone_url = f"{self.base_url}/repos/{owner}/{name}.git"

        user_prompt = f"""
You are an autonomous software engineer working on a git repository.

User instruction:
{instruction.strip()}

Repository name: {name}
Clone URL: {clone_url}

Current repository tree (trimmed):
{structure}

Sample file contents (trimmed):
{snippets}

Return ONLY valid JSON with this exact shape:
{{
  "commit_message": "short commit message",
  "files": [
    {{
      "path": "relative/path/to/file.ext",
      "content": "full new file content"
    }}
  ]
}}

Rules:
- Only include files you want to create/update.
- Paths must be repo-relative (no leading slash, no ..).
- Return up to {MAX_GENERATED_FILES} files.
- Do not include markdown fences or extra text.
- Use strict JSON with double quotes only.
"""

        messages: list[dict[str, str]] = [
            {
                "role": "system",
                "content": "Return strictly valid RFC8259 JSON object only. No prose, no markdown."
            },
            {"role": "user", "content": user_prompt},
        ]

        payload = None
        last_error: Exception | None = None
        for _ in range(MAX_JSON_ATTEMPTS):
            raw = self._chat_completion(messages=messages, temperature=0, json_mode=True)
            try:
                payload = self._extract_json_payload(raw)
                break
            except ValueError as exc:
                last_error = exc
                try:
                    payload = self._repair_json_with_llm(raw)
                    break
                except ValueError as repair_exc:
                    last_error = repair_exc
                    messages.append({"role": "assistant", "content": raw})
                    messages.append(
                        {
                            "role": "user",
                            "content": (
                                "Your previous response was not valid JSON for the required schema. "
                                "Return only one valid JSON object now."
                            ),
                        }
                    )

        if payload is None:
            raise ValueError("AI response JSON parsing failed") from last_error

        commit_message = payload.get("commit_message")
        files = payload.get("files")

        if not isinstance(commit_message, str) or not commit_message.strip():
            raise ValueError("AI response missing commit_message")
        if not isinstance(files, list) or not files:
            raise ValueError("AI response missing files list")
        if len(files) > MAX_GENERATED_FILES:
            raise ValueError("AI requested too many files in one build")

        cleaned_files: list[dict[str, str]] = []
        for item in files:
            if not isinstance(item, dict):
                continue
            rel_path = item.get("path")
            content = item.get("content")
            if not isinstance(rel_path, str) or not rel_path.strip():
                continue
            if not isinstance(content, str):
                continue
            cleaned_files.append(
                {
                    "path": rel_path.strip(),
                    "content": content,
                }
            )

        if not cleaned_files:
            raise ValueError("AI response produced no valid file edits")

        return {
            "commit_message": commit_message.strip(),
            "files": cleaned_files,
        }
