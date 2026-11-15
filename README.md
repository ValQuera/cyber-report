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

The frontend uses `http://localhost:8000/api` by default. Set `VITE_API_URL` before running/building the frontend to use another API URL. Set `CYBER_REPORT_DATABASE`, `CYBER_REPORT_UPLOAD_DIR`, and `CYBER_REPORT_CORS_ORIGINS` on the API to configure local persistence and allowed frontend origins.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Pelapor | `demo@cyberreport.id` | `DemoUser2026!` |
| Security analyst | `analyst@cyberreport.id` | `DemoAnalyst2026!` |
| Administrator | `admin@cyberreport.id` | `DemoAdmin2026!` |

These are prototype-only seeded accounts. The first run also creates three clearly labeled, synthetic sample reports so dashboard, verification, and alert views are populated; the seeded published alert is demo data, not a real-world warning. Before any real deployment, replace the SQLite adapter with PostgreSQL and configure production credentials and secret handling. New registrations receive the Pelapor role only.

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
