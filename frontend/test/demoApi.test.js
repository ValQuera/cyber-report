import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { demoApi, resetDemoData } from "../src/demoApi.js";

const storage = new Map();
globalThis.localStorage = {
  getItem(key) {
    return storage.get(key) ?? null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};

beforeEach(() => {
  storage.clear();
});

async function signIn(email, password) {
  const response = await demoApi("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("cyber-report-token", response.access_token);
  return response;
}

test("demo accounts can sign in and invalid credentials are rejected", async () => {
  const response = await signIn("analyst@cyberreport.id", "DemoAnalyst2026!");
  assert.equal(response.user.role, "analyst");
  assert.equal((await demoApi("/dashboard")).role, "analyst");

  await assert.rejects(
    signIn("analyst@cyberreport.id", "wrong-password"),
    /kata sandi akun demo tidak sesuai/,
  );
});

test("report creation saves simulated details without storing evidence", async () => {
  await signIn("demo@cyberreport.id", "DemoUser2026!");
  const form = new FormData();
  form.set("title", "Demo: pesan phishing mencurigakan");
  form.set("description", "Ini adalah laporan simulasi yang cukup panjang untuk melewati validasi demo.");
  form.set("category", "Phishing");
  form.set("privacy_accepted", "true");
  form.append("evidence", new Blob(["sample"]), "sample.txt");

  const report = await demoApi("/reports", { method: "POST", body: form });
  assert.match(report.ticket, /^CR-DEMO-/);
  assert.deepEqual(report.evidence, []);
  assert.equal((await demoApi("/reports")).some((item) => item.id === report.id), true);

  resetDemoData();
  await assert.rejects(demoApi("/auth/me"), /masuk kembali/);
});

test("analysts can publish only verified demo reports", async () => {
  await signIn("demo@cyberreport.id", "DemoUser2026!");
  const form = new FormData();
  form.set("title", "Demo: aktivitas akun tidak dikenal");
  form.set("description", "Laporan simulasi mengenai aktivitas akun yang tidak dikenal untuk pengujian alur.");
  form.set("category", "Account Compromise");
  form.set("privacy_accepted", "true");
  const report = await demoApi("/reports", { method: "POST", body: form });

  await demoApi("/auth/logout", { method: "POST" });
  await signIn("analyst@cyberreport.id", "DemoAnalyst2026!");
  await assert.rejects(
    demoApi(`/reports/${report.id}/review`, {
      method: "PATCH",
      body: JSON.stringify({ verification_status: "Under Review", warning_published: true }),
    }),
    /hanya dapat diterbitkan/,
  );
  await demoApi(`/reports/${report.id}/review`, {
    method: "PATCH",
    body: JSON.stringify({ verification_status: "Verified", warning_published: true }),
  });
  assert.equal((await demoApi("/alerts")).some((alert) => alert.id === report.id), true);
});
