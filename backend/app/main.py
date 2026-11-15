from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, EmailStr, Field

ROOT = Path(__file__).resolve().parents[1]
DATABASE_PATH = Path(os.getenv("CYBER_REPORT_DATABASE", str(ROOT / "data.db")))
UPLOAD_DIR = Path(os.getenv("CYBER_REPORT_UPLOAD_DIR", str(ROOT / "private_uploads"))).resolve()
TOKEN_TTL = timedelta(hours=12)
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_UPLOADS = {
    ".pdf": {"application/pdf"},
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".txt": {"text/plain"},
}
PASSWORD_ITERATIONS = 310_000
bearer = HTTPBearer(auto_error=False)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@contextmanager
def db_connect() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PASSWORD_ITERATIONS)
    return f"{salt.hex()}:{derived.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_hex, expected = stored_hash.split(":", 1)
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), PASSWORD_ITERATIONS
        ).hex()
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def init_db() -> None:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with db_connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('user', 'analyst', 'admin')),
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                ticket TEXT NOT NULL UNIQUE,
                user_id TEXT NOT NULL REFERENCES users(id),
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                occurred_at TEXT NOT NULL,
                verification_status TEXT NOT NULL DEFAULT 'Submitted'
                    CHECK (verification_status IN ('Submitted','Under Review','Verified','Rejected')),
                resolution_status TEXT NOT NULL DEFAULT 'Open'
                    CHECK (resolution_status IN ('Open','Resolved')),
                warning_published INTEGER NOT NULL DEFAULT 0,
                risk_score INTEGER NOT NULL,
                risk_level TEXT NOT NULL,
                risk_reasons TEXT NOT NULL,
                predicted_category TEXT NOT NULL,
                confidence REAL NOT NULL,
                analysis_explanation TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS evidence (
                id TEXT PRIMARY KEY,
                report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                media_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS activity (
                id TEXT PRIMARY KEY,
                actor_id TEXT REFERENCES users(id),
                report_id TEXT REFERENCES reports(id) ON DELETE SET NULL,
                action TEXT NOT NULL,
                detail TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(verification_status, created_at);
            CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at);
            """
        )
        if connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            now = utc_now().isoformat()
            demo_users = (
                ("user", "Demo Pelapor", "demo@cyberreport.id", "DemoUser2026!", "user"),
                ("analyst", "Demo Analyst", "analyst@cyberreport.id", "DemoAnalyst2026!", "analyst"),
                ("admin", "Demo Admin", "admin@cyberreport.id", "DemoAdmin2026!", "admin"),
            )
            connection.executemany(
                "INSERT INTO users (id,name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?)",
                [(uid, name, email, hash_password(password), role, now)
                 for uid, name, email, password, role in demo_users],
            )
            samples = (
                (
                    "demo-phishing-001", "CR-DEMO-001", "Demo: pesan phishing meminta verifikasi akun",
                    "Contoh simulasi. Pesan tidak diminta mengarahkan penerima ke halaman login tiruan dan meminta verifikasi akun. Tidak ada tautan aktif atau kredensial yang disertakan.",
                    "Phishing", "Under Review", 58, "Medium", "Phishing",
                    "Laporan contoh untuk demonstrasi. Periksa konteks pesan dan domain pengirim secara manual.",
                    now,
                ),
                (
                    "demo-alert-002", "CR-DEMO-002", "Demo: pesan meniru layanan pengiriman",
                    "Contoh simulasi kampanye pesan yang meniru pemberitahuan pengiriman paket dan mendorong penerima membuka tautan. Informasi ini telah ditinjau untuk demonstrasi.",
                    "Phishing", "Verified", 45, "Medium", "Phishing",
                    "Contoh rekomendasi awal; status verifikasi ini hanya data demo, bukan peringatan dunia nyata.",
                    (utc_now() - timedelta(hours=5)).isoformat(),
                ),
                (
                    "demo-account-003", "CR-DEMO-003", "Demo: notifikasi login yang tidak dikenal",
                    "Contoh simulasi notifikasi login yang tidak dikenali. Pemilik akun mengamankan akun melalui kanal resmi dan mengirim laporan untuk ditinjau.",
                    "Account Compromise", "Submitted", 70, "High", "Account Compromise",
                    "Prioritas tinggi adalah rekomendasi triase; petugas perlu memeriksa konteks secara manual.",
                    (utc_now() - timedelta(hours=27)).isoformat(),
                ),
            )
            for report_id, ticket, title, description, category, status, score, level, predicted, explanation, created_at in samples:
                assessment = assess_report(title, description, category)
                connection.execute(
                    """INSERT INTO reports
                       (id,ticket,user_id,title,description,category,occurred_at,verification_status,
                        warning_published,risk_score,risk_level,risk_reasons,predicted_category,
                        confidence,analysis_explanation,created_at,updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        report_id, ticket, "user", title, description, category, created_at, status,
                        int(status == "Verified"), score, level,
                        "\n".join(assessment["risk_reasons"]), predicted, assessment["confidence"],
                        explanation, created_at, created_at,
                    ),
                )


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="CYBER REPORT API",
    description="Demo API for cyber threat reporting, human verification, and early warnings.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CYBER_REPORT_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class Registration(Credentials):
    name: str = Field(min_length=2, max_length=80)


class ReviewUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    verification_status: Literal["Submitted", "Under Review", "Verified", "Rejected"] | None = None
    resolution_status: Literal["Open", "Resolved"] | None = None
    warning_published: bool | None = None
    note: str | None = Field(default=None, max_length=500)


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    active: bool


def auth_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> dict:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Silakan login untuk melanjutkan.")
    token_hash = hashlib.sha256(credentials.credentials.encode()).hexdigest()
    with db_connect() as connection:
        row = connection.execute(
            """SELECT u.id,u.name,u.email,u.role,u.active,s.expires_at
               FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?""",
            (token_hash,),
        ).fetchone()
    if row is None or not row["active"]:
        raise HTTPException(status_code=401, detail="Sesi tidak valid. Silakan login kembali.")
    if datetime.fromisoformat(row["expires_at"]) <= utc_now():
        with db_connect() as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))
        raise HTTPException(status_code=401, detail="Sesi berakhir. Silakan login kembali.")
    return dict(row)


CurrentUser = Annotated[dict, Depends(auth_user)]


def require_staff(user: CurrentUser) -> dict:
    if user["role"] not in ("analyst", "admin"):
        raise HTTPException(status_code=403, detail="Akses khusus analyst atau administrator.")
    return user


def require_admin(user: CurrentUser) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Akses khusus administrator.")
    return user


StaffUser = Annotated[dict, Depends(require_staff)]
AdminUser = Annotated[dict, Depends(require_admin)]


def record_activity(
    connection: sqlite3.Connection, actor_id: str | None, action: str,
    detail: str, report_id: str | None = None,
) -> None:
    connection.execute(
        "INSERT INTO activity (id,actor_id,report_id,action,detail,created_at) VALUES (?,?,?,?,?,?)",
        (str(uuid.uuid4()), actor_id, report_id, action, detail, utc_now().isoformat()),
    )


def assess_report(title: str, description: str, category: str) -> dict:
    text = f"{title} {description}".lower()
    signals = {
        "Ransomware": ("ransom", "encrypted file", "tebusan", "file terenkripsi"),
        "Phishing": ("phishing", "password", "akun", "login", "tautan", "otp"),
        "Malware": ("malware", "virus", "trojan", "file mencurigakan"),
        "Data Breach": ("data bocor", "data leak", "database", "data pelanggan"),
        "Account Compromise": ("akun diambil", "account compromised", "akses tidak dikenal"),
    }
    matches = {
        group: sum(1 for keyword in keywords if keyword in text)
        for group, keywords in signals.items()
    }
    predicted = max(matches, key=matches.get)
    hit_count = matches[predicted]
    if hit_count == 0:
        predicted = category
    confidence = round(min(0.58 + hit_count * 0.1, 0.92), 2) if hit_count else 0.55
    urgent_markers = ("tebusan", "ransom", "data bocor", "data leak", "akun diambil", "menyebar")
    reasons = ["Kategori laporan dan deskripsi menjadi dasar pemeriksaan awal."]
    score = 35
    if any(marker in text for marker in urgent_markers):
        score += 35
        reasons.append("Terdapat istilah dampak atau urgensi yang perlu ditinjau.")
    if any(marker in text for marker in ("banyak pengguna", "seluruh", "pelanggan", "organisasi")):
        score += 15
        reasons.append("Deskripsi menyebut potensi dampak terhadap banyak pihak.")
    if len(description) > 250:
        score += 5
        reasons.append("Deskripsi memuat konteks tambahan untuk pemeriksaan.")
    score = min(score, 95)
    level = "High" if score >= 70 else "Medium" if score >= 45 else "Low"
    return {
        "risk_score": score,
        "risk_level": level,
        "risk_reasons": reasons,
        "predicted_category": predicted,
        "confidence": confidence,
        "analysis_explanation": (
            "Prediksi berbasis aturan kata kunci untuk demonstrasi. Ini rekomendasi awal, "
            "bukan bukti atau keputusan final; tinjau secara manual."
        ),
    }


def row_to_report(row: sqlite3.Row, include_private: bool = False) -> dict:
    report = dict(row)
    report["risk_reasons"] = report["risk_reasons"].split("\n")
    report["warning_published"] = bool(report["warning_published"])
    report["evidence"] = []
    report.pop("stored_name", None)
    evidence_id = report.pop("evidence_id", None)
    if evidence_id is not None:
        report["evidence"] = [{
            "id": evidence_id,
            "name": report.pop("original_name"),
            "size_bytes": report.pop("size_bytes"),
        }]
    else:
        report.pop("original_name", None)
        report.pop("size_bytes", None)
    if not include_private:
        report.pop("reporter_email", None)
        report.pop("reporter_name", None)
    return report


REPORT_SELECT = """
    SELECT r.*,u.name AS reporter_name,u.email AS reporter_email,
           e.id AS evidence_id,e.original_name,e.stored_name,e.size_bytes
    FROM reports r JOIN users u ON u.id=r.user_id
    LEFT JOIN evidence e ON e.report_id=r.id
"""


def find_similar(connection: sqlite3.Connection, report: sqlite3.Row, limit: int = 4) -> list[dict]:
    tokens = set(re.findall(r"[a-z0-9]{4,}", f"{report['title']} {report['description']}".lower()))
    if not tokens:
        return []
    rows = connection.execute(
        "SELECT id,ticket,title,description,category,verification_status FROM reports WHERE id<>? ORDER BY created_at DESC LIMIT 200",
        (report["id"],),
    ).fetchall()
    ranked = []
    for candidate in rows:
        other_tokens = set(re.findall(
            r"[a-z0-9]{4,}", f"{candidate['title']} {candidate['description']}".lower()
        ))
        intersection = len(tokens & other_tokens)
        union = len(tokens | other_tokens)
        score = intersection / union if union else 0
        if score >= 0.12:
            ranked.append({**dict(candidate), "similarity": round(score, 2)})
    return sorted(ranked, key=lambda item: item["similarity"], reverse=True)[:limit]


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "CYBER REPORT API"}


@app.post("/api/auth/login")
def login(payload: Credentials) -> dict:
    with db_connect() as connection:
        user = connection.execute(
            "SELECT id,name,email,password_hash,role,active FROM users WHERE email=?",
            (payload.email.lower(),),
        ).fetchone()
        if user is None or not user["active"] or not verify_password(payload.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Email atau kata sandi tidak sesuai.")
        token = secrets.token_urlsafe(36)
        connection.execute(
            "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)",
            (hashlib.sha256(token.encode()).hexdigest(), user["id"], (utc_now() + TOKEN_TTL).isoformat()),
        )
        record_activity(connection, user["id"], "login", "Pengguna masuk.")
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {key: user[key] for key in ("id", "name", "email", "role")},
    }


@app.post("/api/auth/register", status_code=201)
def register(payload: Registration) -> dict:
    user_id = str(uuid.uuid4())
    with db_connect() as connection:
        try:
            connection.execute(
                "INSERT INTO users (id,name,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?)",
                (user_id, payload.name.strip(), payload.email.lower(), hash_password(payload.password),
                 "user", utc_now().isoformat()),
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="Email sudah terdaftar.") from exc
        record_activity(connection, user_id, "register", "Akun pelapor dibuat.")
    return {"id": user_id, "name": payload.name.strip(), "email": payload.email.lower(), "role": "user"}


@app.get("/api/auth/me")
def me(user: CurrentUser) -> dict:
    return {key: user[key] for key in ("id", "name", "email", "role")}


@app.post("/api/auth/logout")
def logout(
    user: CurrentUser,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> dict:
    if credentials:
        token_hash = hashlib.sha256(credentials.credentials.encode()).hexdigest()
        with db_connect() as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))
            record_activity(connection, user["id"], "logout", "Pengguna keluar.")
    return {"message": "Berhasil keluar."}


@app.get("/api/dashboard")
def dashboard(user: CurrentUser) -> dict:
    with db_connect() as connection:
        if user["role"] in ("analyst", "admin"):
            total = connection.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
            counts = {
                row["verification_status"]: row["count"]
                for row in connection.execute(
                    "SELECT verification_status,COUNT(*) AS count FROM reports GROUP BY verification_status"
                )
            }
            high = connection.execute("SELECT COUNT(*) FROM reports WHERE risk_level='High'").fetchone()[0]
            reports = connection.execute(
                REPORT_SELECT + " ORDER BY r.created_at DESC LIMIT 6"
            ).fetchall()
            recent = [row_to_report(row, include_private=True) for row in reports]
            trends = connection.execute(
                """SELECT substr(created_at,1,10) AS day,COUNT(*) AS count
                   FROM reports WHERE created_at>=? GROUP BY day ORDER BY day""",
                ((utc_now() - timedelta(days=6)).date().isoformat(),),
            ).fetchall()
            return {
                "role": user["role"],
                "total_reports": total,
                "submitted": counts.get("Submitted", 0),
                "under_review": counts.get("Under Review", 0),
                "verified": counts.get("Verified", 0),
                "high_priority": high,
                "recent_reports": recent,
                "trend": [dict(row) for row in trends],
            }
        counts = {
            row["verification_status"]: row["count"]
            for row in connection.execute(
                "SELECT verification_status,COUNT(*) AS count FROM reports WHERE user_id=? GROUP BY verification_status",
                (user["id"],),
            )
        }
        reports = connection.execute(
            REPORT_SELECT + " WHERE r.user_id=? ORDER BY r.created_at DESC LIMIT 6",
            (user["id"],),
        ).fetchall()
        alerts = connection.execute(
            "SELECT COUNT(*) FROM reports WHERE warning_published=1 AND verification_status='Verified'"
        ).fetchone()[0]
    return {
        "role": user["role"],
        "total_reports": sum(counts.values()),
        "submitted": counts.get("Submitted", 0),
        "under_review": counts.get("Under Review", 0),
        "verified": counts.get("Verified", 0),
        "alerts": alerts,
        "recent_reports": [row_to_report(row) for row in reports],
    }


@app.get("/api/reports")
def list_reports(user: CurrentUser, status: str | None = None) -> list[dict]:
    with db_connect() as connection:
        query = REPORT_SELECT
        params: list[str] = []
        if user["role"] not in ("analyst", "admin"):
            query += " WHERE r.user_id=?"
            params.append(user["id"])
        if status:
            query += " AND" if params else " WHERE"
            query += " r.verification_status=?"
            params.append(status)
        query += " ORDER BY r.created_at DESC LIMIT 250"
        rows = connection.execute(query, params).fetchall()
        return [row_to_report(row, include_private=user["role"] in ("analyst", "admin")) for row in rows]


@app.post("/api/reports", status_code=201)
async def create_report(
    user: CurrentUser,
    title: Annotated[str, Form(min_length=8, max_length=120)],
    description: Annotated[str, Form(min_length=30, max_length=5000)],
    category: Annotated[str, Form()],
    occurred_at: Annotated[str, Form()],
    privacy_accepted: Annotated[bool, Form()],
    evidence_file: Annotated[UploadFile | None, File()] = None,
) -> dict:
    categories = {"Phishing", "Malware", "Data Breach", "Account Compromise", "Ransomware", "Other"}
    if category not in categories:
        raise HTTPException(status_code=422, detail="Kategori laporan tidak valid.")
    if not privacy_accepted:
        raise HTTPException(status_code=422, detail="Persetujuan privasi wajib diberikan.")
    try:
        parsed_date = datetime.fromisoformat(occurred_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Format waktu kejadian tidak valid.") from exc
    if parsed_date.tzinfo is None:
        parsed_date = parsed_date.replace(tzinfo=timezone.utc)
    if parsed_date > utc_now() + timedelta(minutes=5):
        raise HTTPException(status_code=422, detail="Waktu kejadian tidak boleh di masa depan.")
    upload_bytes = b""
    if evidence_file is not None and evidence_file.filename:
        suffix = Path(evidence_file.filename).suffix.lower()
        allowed_types = ALLOWED_UPLOADS.get(suffix)
        if allowed_types is None or evidence_file.content_type not in allowed_types:
            raise HTTPException(status_code=415, detail="Lampiran harus berupa PDF, PNG, JPG, atau TXT.")
        upload_bytes = await evidence_file.read(MAX_UPLOAD_BYTES + 1)
        if len(upload_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Ukuran lampiran maksimal 5 MB.")
    analysis = assess_report(title, description, category)
    report_id = str(uuid.uuid4())
    ticket = f"CR-{utc_now():%Y%m%d}-{secrets.token_hex(3).upper()}"
    now = utc_now().isoformat()
    stored_name = f"{uuid.uuid4().hex}{Path(evidence_file.filename).suffix.lower()}" if upload_bytes and evidence_file else None
    if stored_name:
        (UPLOAD_DIR / stored_name).write_bytes(upload_bytes)
    try:
        with db_connect() as connection:
            connection.execute(
                """INSERT INTO reports
                   (id,ticket,user_id,title,description,category,occurred_at,risk_score,risk_level,
                    risk_reasons,predicted_category,confidence,analysis_explanation,created_at,updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    report_id, ticket, user["id"], title.strip(), description.strip(), category,
                    parsed_date.isoformat(), analysis["risk_score"], analysis["risk_level"],
                    "\n".join(analysis["risk_reasons"]), analysis["predicted_category"],
                    analysis["confidence"], analysis["analysis_explanation"], now, now,
                ),
            )
            if stored_name and evidence_file:
                connection.execute(
                    "INSERT INTO evidence (id,report_id,original_name,stored_name,media_type,size_bytes) VALUES (?,?,?,?,?,?)",
                    (str(uuid.uuid4()), report_id, Path(evidence_file.filename).name, stored_name,
                     evidence_file.content_type or "application/octet-stream", len(upload_bytes)),
                )
            record_activity(connection, user["id"], "report_created", f"Tiket {ticket} dibuat.", report_id)
            row = connection.execute(REPORT_SELECT + " WHERE r.id=?", (report_id,)).fetchone()
    except Exception:
        if stored_name:
            (UPLOAD_DIR / stored_name).unlink(missing_ok=True)
        raise
    return row_to_report(row)


@app.get("/api/reports/{report_id}")
def get_report(report_id: str, user: CurrentUser) -> dict:
    with db_connect() as connection:
        row = connection.execute(REPORT_SELECT + " WHERE r.id=?", (report_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Laporan tidak ditemukan.")
        if user["role"] not in ("analyst", "admin") and row["user_id"] != user["id"]:
            raise HTTPException(status_code=404, detail="Laporan tidak ditemukan.")
        report = row_to_report(row, include_private=user["role"] in ("analyst", "admin"))
        report["similar_reports"] = find_similar(connection, row)
        return report


@app.patch("/api/reports/{report_id}/review")
def review_report(report_id: str, payload: ReviewUpdate, user: StaffUser) -> dict:
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=422, detail="Pilih perubahan yang akan disimpan.")
    if "warning_published" in changes and changes["warning_published"] and changes.get("verification_status") != "Verified":
        with db_connect() as connection:
            current = connection.execute(
                "SELECT verification_status FROM reports WHERE id=?", (report_id,)
            ).fetchone()
        if current is None:
            raise HTTPException(status_code=404, detail="Laporan tidak ditemukan.")
        if current["verification_status"] != "Verified":
            raise HTTPException(status_code=409, detail="Peringatan hanya dapat diterbitkan dari laporan terverifikasi.")
    allowed = {"verification_status", "resolution_status", "warning_published"}
    assignments = [f"{key}=?" for key in changes if key in allowed]
    values = [int(value) if key == "warning_published" else value
              for key, value in changes.items() if key in allowed]
    with db_connect() as connection:
        row = connection.execute("SELECT * FROM reports WHERE id=?", (report_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Laporan tidak ditemukan.")
        final_status = changes.get("verification_status", row["verification_status"])
        final_warning = changes.get("warning_published", bool(row["warning_published"]))
        if final_warning and final_status != "Verified":
            raise HTTPException(status_code=409, detail="Peringatan hanya dapat diterbitkan dari laporan terverifikasi.")
        assignments.append("updated_at=?")
        values.append(utc_now().isoformat())
        values.append(report_id)
        connection.execute(f"UPDATE reports SET {','.join(assignments)} WHERE id=?", values)
        details = changes.get("note") or "Status laporan diperbarui."
        record_activity(connection, user["id"], "report_reviewed", details, report_id)
        updated = connection.execute(REPORT_SELECT + " WHERE r.id=?", (report_id,)).fetchone()
    return row_to_report(updated, include_private=True)


@app.get("/api/alerts")
def list_alerts(_: CurrentUser) -> list[dict]:
    with db_connect() as connection:
        rows = connection.execute(
            """SELECT id,ticket,title,category,risk_level,created_at,updated_at
               FROM reports WHERE verification_status='Verified' AND warning_published=1
               ORDER BY updated_at DESC LIMIT 100"""
        ).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/analysis/{report_id}")
def analyze_report(report_id: str, user: StaffUser) -> dict:
    with db_connect() as connection:
        row = connection.execute(REPORT_SELECT + " WHERE r.id=?", (report_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Laporan tidak ditemukan.")
        report = row_to_report(row, include_private=True)
        report["similar_reports"] = find_similar(connection, row)
    return report


@app.get("/api/correlations")
def correlations(_: StaffUser) -> list[dict]:
    with db_connect() as connection:
        rows = connection.execute(
            """SELECT id,ticket,title,category,verification_status,created_at
               FROM reports ORDER BY created_at DESC LIMIT 200"""
        ).fetchall()
    buckets: dict[str, list[dict]] = {}
    for row in rows:
        for word in set(re.findall(r"[a-z0-9]{5,}", row["title"].lower())):
            buckets.setdefault(word, []).append(dict(row))
    return [
        {"indicator": word, "reports": reports}
        for word, reports in sorted(buckets.items(), key=lambda item: len(item[1]), reverse=True)
        if len(reports) > 1
    ][:12]


@app.get("/api/users")
def list_users(_: AdminUser) -> list[dict]:
    with db_connect() as connection:
        rows = connection.execute(
            """SELECT u.id,u.name,u.email,u.role,u.active,u.created_at,COUNT(r.id) AS report_count
               FROM users u LEFT JOIN reports r ON r.user_id=u.id
               GROUP BY u.id ORDER BY u.created_at DESC"""
        ).fetchall()
    return [dict(row) for row in rows]


@app.patch("/api/users/{user_id}")
def update_user(user_id: str, payload: UserUpdate, user: AdminUser) -> dict:
    with db_connect() as connection:
        target = connection.execute(
            "SELECT id,role,active FROM users WHERE id=?", (user_id,)
        ).fetchone()
        if target is None:
            raise HTTPException(status_code=404, detail="Akun tidak ditemukan.")
        if user_id == user["id"] and not payload.active:
            raise HTTPException(status_code=409, detail="Administrator tidak dapat menonaktifkan akunnya sendiri.")
        if target["role"] == "admin" and target["active"] and not payload.active:
            active_admins = connection.execute(
                "SELECT COUNT(*) FROM users WHERE role='admin' AND active=1"
            ).fetchone()[0]
            if active_admins <= 1:
                raise HTTPException(status_code=409, detail="Tidak dapat menonaktifkan administrator aktif terakhir.")
        connection.execute("UPDATE users SET active=? WHERE id=?", (int(payload.active), user_id))
        record_activity(
            connection,
            user["id"],
            "user_access_updated",
            f"Akses akun {'diaktifkan' if payload.active else 'dinonaktifkan'}.",
        )
    return {"id": user_id, "active": payload.active}


@app.get("/api/activity")
def list_activity(_: StaffUser) -> list[dict]:
    with db_connect() as connection:
        rows = connection.execute(
            """SELECT a.id,a.action,a.detail,a.created_at,u.name AS actor_name,r.ticket
               FROM activity a LEFT JOIN users u ON u.id=a.actor_id
               LEFT JOIN reports r ON r.id=a.report_id
               ORDER BY a.created_at DESC LIMIT 100"""
        ).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/reports/{report_id}/evidence/{evidence_id}")
def download_evidence(report_id: str, evidence_id: str, user: CurrentUser) -> FileResponse:
    with db_connect() as connection:
        evidence = connection.execute(
            """SELECT e.stored_name,e.original_name,e.media_type,r.user_id
               FROM evidence e JOIN reports r ON r.id=e.report_id
               WHERE e.id=? AND e.report_id=?""",
            (evidence_id, report_id),
        ).fetchone()
    if evidence is None or (user["role"] not in ("analyst", "admin") and evidence["user_id"] != user["id"]):
        raise HTTPException(status_code=404, detail="Lampiran tidak ditemukan.")
    path = (UPLOAD_DIR / evidence["stored_name"]).resolve()
    if path.parent != UPLOAD_DIR or not path.is_file():
        raise HTTPException(status_code=404, detail="Lampiran tidak tersedia.")
    return FileResponse(path, media_type=evidence["media_type"], filename=evidence["original_name"])
