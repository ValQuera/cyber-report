import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import main


class ReportingFlowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = Path(self.temp.name) / "test.db"
        self.uploads = Path(self.temp.name) / "uploads"
        self.patches = [
            patch.object(main, "DATABASE_PATH", self.database),
            patch.object(main, "UPLOAD_DIR", self.uploads),
        ]
        for item in self.patches:
            item.start()
        self.client = TestClient(main.app)
        self.client.__enter__()
        with main.db_connect() as connection:
            connection.execute("DELETE FROM activity")
            connection.execute("DELETE FROM reports")
        self.reporter = self.login("demo@cyberreport.id", "DemoUser2026!")
        self.analyst = self.login("analyst@cyberreport.id", "DemoAnalyst2026!")

    def tearDown(self):
        self.client.__exit__(None, None, None)
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def login(self, email, password):
        response = self.client.post("/api/auth/login", json={"email": email, "password": password})
        self.assertEqual(response.status_code, 200)
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    def create_report(self):
        response = self.client.post(
            "/api/reports",
            headers=self.reporter,
            data={
                "title": "Tautan phishing meminta password",
                "description": "Email berisi tautan login yang meminta password akun. Saya belum membukanya dan melaporkan untuk ditinjau.",
                "category": "Phishing",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "privacy_accepted": "true",
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_report_ticket_is_private_and_trackable(self):
        report = self.create_report()
        self.assertTrue(report["ticket"].startswith("CR-"))
        self.assertEqual(report["verification_status"], "Submitted")
        self.assertEqual(report["evidence"], [])
        self.assertNotIn("reporter_email", report)
        mine = self.client.get("/api/reports", headers=self.reporter).json()
        self.assertEqual(mine[0]["id"], report["id"])

    def test_warning_requires_verified_report(self):
        report = self.create_report()
        response = self.client.patch(
            f"/api/reports/{report['id']}/review",
            headers=self.analyst,
            json={"warning_published": True},
        )
        self.assertEqual(response.status_code, 409)
        self.client.patch(
            f"/api/reports/{report['id']}/review",
            headers=self.analyst,
            json={"verification_status": "Verified"},
        ).raise_for_status()
        publish = self.client.patch(
            f"/api/reports/{report['id']}/review",
            headers=self.analyst,
            json={"warning_published": True},
        )
        self.assertEqual(publish.status_code, 200, publish.text)
        alerts = self.client.get("/api/alerts", headers=self.reporter).json()
        self.assertEqual(len(alerts), 1)

    def test_report_list_and_review_are_role_restricted(self):
        report = self.create_report()
        outsider = self.login("demo@cyberreport.id", "DemoUser2026!")
        response = self.client.patch(
            f"/api/reports/{report['id']}/review",
            headers=outsider,
            json={"verification_status": "Verified"},
        )
        self.assertEqual(response.status_code, 403)

    def test_only_admin_can_manage_users_and_cannot_disable_self(self):
        response = self.client.patch(
            "/api/users/user",
            headers=self.analyst,
            json={"active": False},
        )
        self.assertEqual(response.status_code, 403)
        admin = self.login("admin@cyberreport.id", "DemoAdmin2026!")
        response = self.client.patch(
            "/api/users/admin",
            headers=admin,
            json={"active": False},
        )
        self.assertEqual(response.status_code, 409)

    def test_evidence_is_downloadable_only_by_report_owner_or_staff(self):
        response = self.client.post(
            "/api/reports",
            headers=self.reporter,
            data={
                "title": "Lampiran contoh untuk laporan phishing",
                "description": "Pesan meminta pemilik akun membuka tautan login yang tidak dikenal untuk meninjau aktivitas.",
                "category": "Phishing",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "privacy_accepted": "true",
            },
            files={"evidence_file": ("evidence.txt", b"Safe synthetic evidence", "text/plain")},
        )
        self.assertEqual(response.status_code, 201, response.text)
        report = response.json()
        evidence = report["evidence"][0]
        path = f"/api/reports/{report['id']}/evidence/{evidence['id']}"
        download = self.client.get(path, headers=self.reporter)
        self.assertEqual(download.status_code, 200)
        self.assertEqual(download.content, b"Safe synthetic evidence")

        self.client.post(
            "/api/auth/register",
            json={"name": "Other Reporter", "email": "other@example.com", "password": "OtherPass2026!"},
        ).raise_for_status()
        outsider = self.login("other@example.com", "OtherPass2026!")
        self.assertEqual(self.client.get(path, headers=outsider).status_code, 404)


if __name__ == "__main__":
    unittest.main()
