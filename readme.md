# Shithub

Shithub is a self-hosted Git service built with a FastAPI backend, a React frontend, and a CLI.
It lets you manage repositories, serve Git over Smart HTTP, and run AI README generation as async jobs.
The web UI focuses on day-to-day repo operations and job visibility.

## Features
- Create, list, and delete repositories
- Git Smart HTTP clone/push support through `/repos/*`
- AI README generation with queued jobs, status tracking, and logs
- Email OTP authentication (register/login) with JWT bearer tokens
- Web UI and CLI support for repository workflows

## Architecture
```text
Frontend / CLI -> FastAPI API -> SQLite + bare Git repos + Celery/Redis -> Groq AI
```

## Prerequisites
- Python 3.11+
- Node.js 18+
- Git
- Redis (required for async AI jobs)

## Environment Variables
| Variable | Default | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | _none_ | Required for AI README generation |
| `BASE_URL` | `http://127.0.0.1:8000` | Base URL used by backend services |
| `REPO_ROOT` | `./repos` | Filesystem location for bare repositories |
| `DATABASE_URL` | `sqlite:///./shithub.db` | SQLAlchemy database connection |
| `FRONTEND_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | CORS allowlist for frontend origins |
| `JWT_SECRET_KEY` | `this_jwt_secret_key_should_be_changed_in_production` | Secret used to sign JWT access tokens |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `JWT_EXPIRE_MINUTES` | `60` | Access token expiry in minutes |
| `OTP_EXPIRE_MINUTES` | `10` | OTP challenge expiry window |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60` | Minimum delay before OTP resend |
| `OTP_MAX_ATTEMPTS` | `5` | Max invalid OTP attempts per challenge |
| `SMTP_HOST` | _none_ | SMTP host for OTP email delivery |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USERNAME` | _none_ | SMTP username |
| `SMTP_PASSWORD` | _none_ | SMTP password |
| `SMTP_FROM_EMAIL` | _none_ | Sender email for OTP messages |
| `SMTP_USE_TLS` | `true` | Enable STARTTLS for SMTP |
| `AUTH_DEV_OTP_LOG` | `true` | Log OTP in backend logs if SMTP is unavailable |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` | Frontend API base URL |

Create `.env` in project root for backend values and `frontend/.env` for frontend values (or export env vars in your shell).

## Run Locally (Full Stack)

### 1. Backend API
```bash
python -m venv .venv
# Windows PowerShell
. .venv/Scripts/Activate.ps1
# Linux/macOS
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Redis
```bash
redis-server
```

### 3. Celery Worker
```bash
celery -A backend.worker.celery_app.celery worker --loglevel=info
```

### 4. Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` by default.

If SMTP is not configured and `AUTH_DEV_OTP_LOG=true`, OTP codes are written to backend logs for development.

## Authentication Flow (Email OTP)
1. Register:
   - `POST /auth/register/start` with `username`, `email`, `password`
   - `POST /auth/register/verify` with `challenge_id`, `otp`
2. Login:
   - `POST /auth/login/start` with `email`, `password`
   - `POST /auth/login/verify` with `challenge_id`, `otp`
3. Token usage:
   - Store `access_token` and send `Authorization: Bearer <token>` for mutation endpoints.
4. OTP maintenance:
   - `POST /auth/otp/resend` to resend active OTP challenge.

## Frontend Usage
1. Open the app and set the owner (the value is persisted in local storage).
2. Create or delete repositories from the home page.
3. Trigger `Generate README` for a repository.
4. Open `/repo/:owner/:name` to view dashboard metrics and recent jobs.
5. Use `View logs` in jobs table to inspect worker output for each job.

## CLI Usage
Install the CLI in editable mode:
```bash
pip install -e .
```

Example commands:
```bash
shithub create <owner> <name>
shithub list <owner>
shithub ai-readme <owner> <name>
shithub job <job_id>
```

## API Reference (Canonical)
| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register/start` | Start registration and send OTP |
| `POST` | `/auth/register/verify` | Verify registration OTP and return JWT |
| `POST` | `/auth/login/start` | Start login and send OTP |
| `POST` | `/auth/login/verify` | Verify login OTP and return JWT |
| `POST` | `/auth/otp/resend` | Resend OTP for active challenge |
| `GET` | `/auth/me` | Return current authenticated user |
| `POST` | `/repos/{owner}/{name}` | Create repository |
| `DELETE` | `/repos/{owner}/{name}` | Delete repository |
| `GET` | `/repos/{owner}` | List repositories for owner |
| `POST` | `/repos/{owner}/{name}/ai/readme` | Queue AI README generation |
| `GET` | `/repos/{owner}/{name}/dashboard` | Repository dashboard data |
| `GET` | `/repos/{owner}/{name}/jobs` | List jobs for repository |
| `GET` | `/jobs/{job_id}` | Job status and result |
| `GET` | `/jobs/{job_id}/logs` | Job logs |

Mutation endpoints (`POST/DELETE /repos/...`) require bearer authentication and only allow changes within the authenticated user's owner namespace.

## Backward Compatibility (Deprecated Aliases)
The following routes are kept only for compatibility with older clients.  
Use canonical endpoints for all new integrations.

- `GET /repos/repos/{owner}/{name}/dashboard`
- `GET /jobs/repos/{owner}/{name}/jobs`
- `GET /jobs/jobs/{job_id}/logs`

## Verification Checklist
- Create a repository in the UI and confirm it appears immediately.
- Trigger AI README generation and observe `queued -> running -> success/failed`.
- Open job logs in the modal and verify logs load correctly.
- Confirm dashboard metrics render for the selected repository.
- Confirm clone works via Smart HTTP:
  - `git clone http://127.0.0.1:8000/repos/<owner>/<repo>.git`

## Troubleshooting
- CORS errors from frontend:
  - Ensure `FRONTEND_ORIGINS` includes your frontend origin (for example `http://localhost:5173`).
- Jobs stuck in `queued`:
  - Ensure Redis is running and Celery worker is running.
- AI README jobs failing:
  - Ensure `GROQ_API_KEY` is set and valid.
- OTP not delivered:
  - Configure SMTP variables or keep `AUTH_DEV_OTP_LOG=true` and read OTP from backend logs.
- `401` or `403` on repo create/delete/AI README:
  - Sign in first and use your own owner namespace (`/u/<username>/...`).
- Git clone/push issues over HTTP:
  - Ensure Git is installed and backend API is running on the expected host/port.

## Security Notes
- Do not commit real API keys to source control.
- Keep `.env` files local and out of public repositories.
