# CYBER REPORT

Prototype web application for cyber threat reporting, analyst verification, monitoring, and verified early warnings. It follows the provided pre-requirement design: dark responsive UI, role-based access, private reports and evidence, explainable initial triage, and human-controlled publication.

## Stack

- Frontend: React, Vite, Tailwind CSS, Recharts
- Backend: FastAPI, SQLite (portable prototype database)
- Evidence: private local storage; authenticated download only

## Run locally

Requirements: Python 3.10+ and Node.js 20+.

On Windows, install dependencies once from the project root and launch both services with the helper:

```powershell
python -m pip install -r backend\requirements.txt
npm --prefix frontend install
.\start-dev.ps1
```

The script opens separate PowerShell windows for the API and frontend. Keep both windows open while using the app.

1. Start the API:

   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   python -m uvicorn app.main:app --reload
   ```

2. In a second terminal, start the web app:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

3. Open `http://localhost:5173`. API documentation is available at `http://localhost:8000/docs`.

The frontend uses `http://localhost:8000/api` by default when demo mode is off. Set `VITE_DEMO_MODE=true` to run the frontend without an API; set `VITE_DEMO_MODE=false` and `VITE_API_URL` to connect to a separate backend. The API uses local SQLite by default; set `DATABASE_URL` to use a hosted PostgreSQL database. `CYBER_REPORT_DATABASE`, `CYBER_REPORT_UPLOAD_DIR`, and `CYBER_REPORT_CORS_ORIGINS` configure local database storage, evidence storage, and allowed frontend origins.

## Public demo on Vercel (no backend or database)

The root `vercel.json` deploys the Vite frontend as a static site. For a presentation-only website:

1. Import this repository into Vercel and keep the project root as the root directory.
2. In **Project Settings → Environment Variables**, set `VITE_DEMO_MODE` to `true` for Production (and Preview if you use preview deployments).
3. Redeploy. No backend URL, database, card, or database credentials are needed.

Production builds use demo mode by default unless `VITE_DEMO_MODE=false` is explicitly set. Demo reports and review actions are stored in that visitor's browser only; they are not shared across visitors, backed up, or protected as private data. The sign-in screen provides sample accounts and a reset button. Do not enter real incidents, personal information, credentials, or evidence. File uploads and account registration are disabled in demo mode.

## Deploy to Vercel

For a frontend deployment on Vercel, this repo already includes a Vercel config at the project root and a frontend environment template:

- `vercel.json` builds the Vite app from `frontend/` and serves the production bundle from `frontend/dist/`.
- `frontend/.env.example` shows the demo-mode setting. `VITE_API_URL` is only needed when connecting to a separately hosted API.

Example:

```bash
cp frontend/.env.example frontend/.env
# For a backend-free demo, keep VITE_DEMO_MODE=true.
# For a live API, set VITE_DEMO_MODE=false and VITE_API_URL to its /api URL.
```

Then import the repo into Vercel and use the project root as the app root. This Vercel project serves the frontend. The FastAPI backend can run as a separate Vercel project from the same repository.

### Deploy FastAPI as a second Vercel project

1. In Vercel, import the same GitHub repository as a new project. Set **Root Directory** to `backend` and let Vercel detect the FastAPI framework. The backend entrypoint is `app/main.py`; dependencies are in `backend/requirements.txt`.
2. Before deploying, add these environment variables to the **backend project only**:
   - `DATABASE_URL`: the Supabase Transaction Pooler URI for Vercel Functions. Keep it secret.
   - `CYBER_REPORT_ADMIN_EMAIL` and `CYBER_REPORT_ADMIN_PASSWORD`: a valid email and a unique password with at least 12 characters. These bootstrap the first administrator in an empty database.
   - `CYBER_REPORT_CORS_ORIGINS`: the frontend's exact HTTPS origin, for example `https://your-app.vercel.app` (no `/api`).
   - `CYBER_REPORT_UPLOAD_DIR`: `/tmp/cyber-report-uploads`. Vercel's function filesystem is temporary; avoid evidence uploads for demos that require durable files.
3. Deploy the backend project. Copy its Vercel domain and verify `<backend-domain>/api/health`.
4. In the existing frontend Vercel project, set `VITE_API_URL` to `https://<backend-domain>/api` as a **Config** variable, then redeploy the frontend.

Do not set `DATABASE_URL` or administrator credentials in the frontend project or in any `VITE_*` variable. Supabase stores report records persistently; `/tmp` evidence files are temporary.

### Deploy the API and persistent data

1. Create a managed PostgreSQL database (for example, on Neon, Supabase, or Render) and copy its connection URL. For a persistent API service on Supabase, prefer the Session Pooler URI; the API also disables prepared statements when using Transaction Pooler.
2. Deploy this repository as a Python web service. Install with `python -m pip install -r backend/requirements.txt` and start with `python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT`.
3. Configure these environment variables on the API service:
   - `DATABASE_URL`: the PostgreSQL connection URL. The API creates its tables on first startup.
   - `CYBER_REPORT_ADMIN_EMAIL` and `CYBER_REPORT_ADMIN_PASSWORD`: used once to create the first administrator in an empty PostgreSQL database. Use a unique password with at least 12 characters; do not use the demo credentials.
   - `CYBER_REPORT_CORS_ORIGINS`: your deployed Vercel origin, such as `https://your-app.vercel.app`.
   - `CYBER_REPORT_UPLOAD_DIR`: a persistent disk path if the API host uses ephemeral filesystems, so uploaded evidence survives restarts and redeploys.
4. In Vercel, set `VITE_API_URL` to the deployed API URL ending in `/api`, then redeploy the frontend.

Keep the database URL and administrator password only in the API host's secret environment settings, never in frontend variables or committed files. Existing local SQLite data is not copied automatically to PostgreSQL. The API's private evidence files also need persistent storage; a persistent database alone does not store those file contents.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Pelapor | `demo@cyberreport.id` | `DemoUser2026!` |
| Security analyst | `analyst@cyberreport.id` | `DemoAnalyst2026!` |
| Administrator | `admin@cyberreport.id` | `DemoAdmin2026!` |

These are prototype-only seeded accounts and are created only for local SQLite use. The first local run also creates three clearly labeled, synthetic sample reports so dashboard, verification, and alert views are populated; the seeded published alert is demo data, not a real-world warning. A fresh PostgreSQL deployment instead requires the administrator environment variables above and does not create demo users or reports. New registrations receive the Pelapor role only.

## Prototype behavior and boundaries

- Reports receive a ticket number, initial status, deterministic keyword-based category recommendation, explainable triage score, and optional private evidence (PDF/PNG/JPG/TXT, maximum 5 MB).
- Classification, similarity, and risk scores are demonstration heuristics—not a trained or calibrated AI model. They are recommendations, not evidence or a decision of guilt.
- Only an analyst or administrator can change verification and resolution status. A public alert can only be published for a report whose verification status is `Verified`; alerts are queried from verified and published records only.
- Reporters can view only their own report details and evidence. Staff-only API routes enforce analyst/admin roles; user management is administrator-only.
- This prototype does not scan external systems, accept or request credentials, or publish unverified indicators.

## Tests

```powershell
cd backend
python -m unittest discover -s tests -v
```
