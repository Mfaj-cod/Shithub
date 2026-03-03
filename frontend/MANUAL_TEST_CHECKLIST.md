# Manual Verification Checklist

## Prerequisites
- Backend API running at `http://127.0.0.1:8000`
- Frontend running from `frontend/` with `npm install` then `npm run dev`
- Optional: Redis + Celery worker running for AI README jobs
- If `tailwind.config.js` or theme tokens were changed, restart Vite (`npm run dev`) and hard-refresh browser once.

## Authentication
1. Register with username/email/password and verify you are signed in immediately after submit.
2. Login with email/password and verify no OTP prompt appears.
3. Hit legacy routes (`/auth/register/verify`, `/auth/login/verify`, `/auth/otp/resend`) and verify they return `410`.
4. Confirm `/auth/me` returns `is_email_verified: true` after both register and login flows.

## Core UI Flow
1. Open the app and confirm owner defaults to saved value or `honey`.
2. Change owner and refresh browser; confirm owner persists.
3. Create a repo and verify it appears in the home table immediately.
4. Delete a repo and verify it is removed from the table.
5. Click `Open` on a repo and verify URL changes to `/repo/:owner/:name`.

## Dashboard + Jobs
1. Verify dashboard cards render branches, files, size, and last commit.
2. Trigger `Generate README` from repo page and verify success/info message includes a job id.
3. Verify jobs list updates from `queued` -> `running` -> `success/failed`.
4. Verify polling continues while jobs are active and stops when all jobs are terminal.
5. Click `View logs` on a job and confirm logs modal loads job logs.

## API Compatibility
1. Confirm frontend uses canonical endpoints:
- `GET /repos/{owner}/{name}/dashboard`
- `GET /repos/{owner}/{name}/jobs`
- `GET /jobs/{job_id}/logs`
2. Confirm old alias routes still work from backend side (hidden/deprecated).

## Route Navigation
1. Verify user tabs navigate with URL changes under `/u/:owner/:tab`.
2. Verify repo tabs navigate with URL changes under `/repo/:owner/:name/:tab`.
3. Verify invalid tabs redirect to defaults (`repositories` for user pages, `code` for repo pages).

## Responsive Checks
1. Desktop width: ensure table/actions/cards align cleanly.
2. Mobile width (<= 768px): ensure no layout breakage, controls stack, and modal remains usable.
