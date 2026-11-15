const STORE_KEY = "cyber-report-demo-store-v1";
const TOKEN_KEY = "cyber-report-token";

const demoCredentials = {
  "demo@cyberreport.id": "DemoUser2026!",
  "analyst@cyberreport.id": "DemoAnalyst2026!",
  "admin@cyberreport.id": "DemoAdmin2026!",
};

function createId() {
  return globalThis.crypto?.randomUUID?.()
    || `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function createInitialState() {
  const users = [
    { id: "user", name: "Demo Pelapor", email: "demo@cyberreport.id", role: "user", active: true },
    { id: "analyst", name: "Demo Analyst", email: "analyst@cyberreport.id", role: "analyst", active: true },
    { id: "admin", name: "Demo Admin", email: "admin@cyberreport.id", role: "admin", active: true },
  ].map((user) => ({ ...user, created_at: hoursAgo(72) }));

  const reports = [
    {
      id: "demo-phishing-001",
      ticket: "CR-DEMO-001",
      user_id: "user",
      reporter_name: "Demo Pelapor",
      reporter_email: "demo@cyberreport.id",
      title: "Demo: pesan phishing meminta verifikasi akun",
      description: "Contoh simulasi. Pesan tidak diminta mengarahkan penerima ke halaman login tiruan dan meminta verifikasi akun. Tidak ada tautan aktif atau kredensial yang disertakan.",
      category: "Phishing",
      occurred_at: hoursAgo(4),
      verification_status: "Under Review",
      resolution_status: "Open",
      warning_published: false,
      risk_score: 58,
      risk_level: "Medium",
      risk_reasons: ["Laporan contoh untuk demonstrasi.", "Tinjau konteks pesan dan domain pengirim secara manual."],
      predicted_category: "Phishing",
      confidence: 0.82,
      analysis_explanation: "Prediksi berbasis aturan kata kunci untuk demonstrasi. Ini rekomendasi awal, bukan bukti atau keputusan final; tinjau secara manual.",
      created_at: hoursAgo(3),
      updated_at: hoursAgo(1),
      evidence: [],
    },
    {
      id: "demo-alert-002",
      ticket: "CR-DEMO-002",
      user_id: "user",
      reporter_name: "Demo Pelapor",
      reporter_email: "demo@cyberreport.id",
      title: "Demo: pesan meniru layanan pengiriman",
      description: "Contoh simulasi kampanye pesan yang meniru pemberitahuan pengiriman paket dan mendorong penerima membuka tautan. Informasi ini telah ditinjau untuk demonstrasi.",
      category: "Phishing",
      occurred_at: hoursAgo(7),
      verification_status: "Verified",
      resolution_status: "Open",
      warning_published: true,
      risk_score: 45,
      risk_level: "Medium",
      risk_reasons: ["Contoh rekomendasi awal.", "Status ini hanya data demo, bukan peringatan dunia nyata."],
      predicted_category: "Phishing",
      confidence: 0.78,
      analysis_explanation: "Status verifikasi dan peringatan ini adalah data simulasi, bukan peringatan dunia nyata.",
      created_at: hoursAgo(6),
      updated_at: hoursAgo(5),
      evidence: [],
    },
    {
      id: "demo-account-003",
      ticket: "CR-DEMO-003",
      user_id: "user",
      reporter_name: "Demo Pelapor",
      reporter_email: "demo@cyberreport.id",
      title: "Demo: notifikasi login yang tidak dikenal",
      description: "Contoh simulasi notifikasi login yang tidak dikenali. Pemilik akun mengamankan akun melalui kanal resmi dan mengirim laporan untuk ditinjau.",
      category: "Account Compromise",
      occurred_at: hoursAgo(30),
      verification_status: "Submitted",
      resolution_status: "Open",
      warning_published: false,
      risk_score: 70,
      risk_level: "High",
      risk_reasons: ["Prioritas tinggi adalah rekomendasi triase.", "Petugas perlu memeriksa konteks secara manual."],
      predicted_category: "Account Compromise",
      confidence: 0.68,
      analysis_explanation: "Rekomendasi triase untuk demonstrasi; petugas perlu memeriksa konteks secara manual.",
      created_at: hoursAgo(28),
      updated_at: hoursAgo(27),
      evidence: [],
    },
  ];

  return {
    users,
    reports,
    sessions: {},
    activity: reports.map((report) => ({
      id: createId(),
      actor_id: null,
      actor_name: "Demo System",
      report_id: report.id,
      ticket: report.ticket,
      action: "report_created",
      detail: `Laporan simulasi ${report.ticket} tersedia.`,
      created_at: report.created_at,
    })),
  };
}

function readState() {
  const stored = localStorage.getItem(STORE_KEY);
  if (stored) return JSON.parse(stored);
  const state = createInitialState();
  writeState(state);
  return state;
}

function writeState(state) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

export function resetDemoData() {
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

function parseBody(body) {
  if (typeof body === "string") return JSON.parse(body);
  return body || {};
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function currentUser(state) {
  const token = localStorage.getItem(TOKEN_KEY);
  const userId = token && state.sessions[token];
  const user = state.users.find((item) => item.id === userId && item.active);
  if (!user) throw new Error("Silakan pilih akun demo dan masuk kembali.");
  return user;
}

function isStaff(user) {
  return user.role === "analyst" || user.role === "admin";
}

function presentReport(report, includePrivate = false) {
  const result = {
    ...report,
    risk_reasons: [...report.risk_reasons],
    evidence: [...(report.evidence || [])],
    warning_published: Boolean(report.warning_published),
  };
  if (!includePrivate) {
    delete result.reporter_email;
    delete result.reporter_name;
  }
  return result;
}

function recordActivity(state, user, action, detail, report) {
  state.activity.unshift({
    id: createId(),
    actor_id: user?.id || null,
    actor_name: user?.name || "Demo System",
    report_id: report?.id || null,
    ticket: report?.ticket || null,
    action,
    detail,
    created_at: new Date().toISOString(),
  });
}

function getDashboard(state, user) {
  const staff = isStaff(user);
  const reports = staff ? state.reports : state.reports.filter((report) => report.user_id === user.id);
  const count = (status) => reports.filter((report) => report.verification_status === status).length;
  const recent = [...reports]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6)
    .map((report) => presentReport(report, staff));

  if (!staff) {
    return {
      role: user.role,
      total_reports: reports.length,
      submitted: count("Submitted"),
      under_review: count("Under Review"),
      verified: count("Verified"),
      alerts: state.reports.filter((report) => report.warning_published && report.verification_status === "Verified").length,
      recent_reports: recent,
    };
  }

  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const day = date.toISOString().slice(0, 10);
    return {
      day,
      count: reports.filter((report) => report.created_at.slice(0, 10) === day).length,
    };
  });
  return {
    role: user.role,
    total_reports: reports.length,
    submitted: count("Submitted"),
    under_review: count("Under Review"),
    verified: count("Verified"),
    high_priority: reports.filter((report) => report.risk_level === "High").length,
    recent_reports: recent,
    trend,
  };
}

function analyzeReport(title, description, category) {
  const text = `${title} ${description}`.toLowerCase();
  const categories = [
    ["Ransomware", ["ransom", "encrypted file", "tebusan", "file terenkripsi"]],
    ["Phishing", ["phishing", "password", "akun", "login", "tautan", "otp"]],
    ["Malware", ["malware", "virus", "trojan", "file mencurigakan"]],
    ["Data Breach", ["data bocor", "data leak", "database", "data pelanggan"]],
    ["Account Compromise", ["akun diambil", "account compromised", "akses tidak dikenal"]],
  ];
  const ranked = categories.map(([name, words]) => ({
    name,
    hits: words.filter((word) => text.includes(word)).length,
  })).sort((a, b) => b.hits - a.hits);
  const predicted = ranked[0]?.hits ? ranked[0].name : category;
  const urgent = ["tebusan", "ransom", "data bocor", "data leak", "akun diambil", "menyebar"];
  const score = Math.min(35 + (urgent.some((word) => text.includes(word)) ? 35 : 0) + (description.length > 250 ? 5 : 0), 95);
  return {
    risk_score: score,
    risk_level: score >= 70 ? "High" : score >= 45 ? "Medium" : "Low",
    risk_reasons: ["Rekomendasi simulasi berbasis kata kunci.", "Perlu ditinjau manual; bukan keputusan final."],
    predicted_category: predicted,
    confidence: Math.min(0.58 + (ranked[0]?.hits || 0) * 0.1, 0.92),
    analysis_explanation: "Analisis ini disimulasikan untuk demo dan bukan bukti atau keputusan final.",
  };
}

function similarReports(state, report) {
  return state.reports
    .filter((candidate) => candidate.id !== report.id && candidate.category === report.category)
    .slice(0, 4)
    .map((candidate) => ({
      id: candidate.id,
      ticket: candidate.ticket,
      title: candidate.title,
      category: candidate.category,
      verification_status: candidate.verification_status,
      similarity: 0.25,
    }));
}

function reportDetail(state, report, user) {
  const result = presentReport(report, isStaff(user));
  result.similar_reports = similarReports(state, report);
  return result;
}

function listCorrelations(reports) {
  const groups = new Map();
  for (const report of reports) {
    const words = new Set(report.title.toLowerCase().match(/[a-z0-9]{5,}/g) || []);
    for (const word of words) {
      if (!groups.has(word)) groups.set(word, []);
      groups.get(word).push({
        id: report.id,
        ticket: report.ticket,
        title: report.title,
        category: report.category,
        verification_status: report.verification_status,
      });
    }
  }
  return [...groups.entries()]
    .filter(([, linked]) => linked.length > 1)
    .map(([indicator, linked]) => ({ indicator, reports: linked }))
    .sort((a, b) => b.reports.length - a.reports.length)
    .slice(0, 12);
}

function createReport(state, user, form) {
  const title = String(form.get("title") || "").trim();
  const description = String(form.get("description") || "").trim();
  const category = String(form.get("category") || "");
  if (title.length < 8 || description.length < 30 || String(form.get("privacy_accepted")) !== "true") {
    throw new Error("Lengkapi detail laporan dan persetujuan privasi.");
  }
  const now = new Date().toISOString();
  const assessment = analyzeReport(title, description, category);
  const report = {
    id: createId(),
    ticket: `CR-DEMO-${Date.now().toString().slice(-6)}`,
    user_id: user.id,
    reporter_name: user.name,
    reporter_email: user.email,
    title,
    description,
    category,
    occurred_at: String(form.get("occurred_at") || now),
    verification_status: "Submitted",
    resolution_status: "Open",
    warning_published: false,
    ...assessment,
    created_at: now,
    updated_at: now,
    evidence: [],
  };
  state.reports.unshift(report);
  recordActivity(state, user, "report_created", `Tiket ${report.ticket} dibuat dalam demo.`, report);
  return report;
}

export async function demoApi(pathWithQuery, options = {}) {
  const url = new URL(pathWithQuery, "https://demo.invalid");
  const path = url.pathname;
  const method = (options.method || "GET").toUpperCase();
  const state = readState();

  if (path === "/auth/login" && method === "POST") {
    const credentials = parseBody(options.body);
    const email = String(credentials.email || "").trim().toLowerCase();
    const user = state.users.find((item) => item.email === email);
    if (!user || !user.active || demoCredentials[email] !== credentials.password) {
      throw new Error("Email atau kata sandi akun demo tidak sesuai.");
    }
    const token = createId();
    state.sessions[token] = user.id;
    writeState(state);
    return { access_token: token, token_type: "bearer", user: publicUser(user) };
  }

  if (path === "/auth/register" && method === "POST") {
    throw new Error("Pendaftaran dinonaktifkan pada demo publik. Gunakan akun demo.");
  }

  if (path === "/auth/me") return publicUser(currentUser(state));

  if (path === "/auth/logout" && method === "POST") {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) delete state.sessions[token];
    writeState(state);
    return { message: "Berhasil keluar dari demo." };
  }

  const user = currentUser(state);
  const staff = isStaff(user);

  if (path === "/dashboard") return getDashboard(state, user);

  if (path === "/reports" && method === "GET") {
    const status = url.searchParams.get("status");
    const reports = state.reports
      .filter((report) => staff || report.user_id === user.id)
      .filter((report) => !status || report.verification_status === status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return reports.map((report) => presentReport(report, staff));
  }

  if (path === "/reports" && method === "POST") {
    if (user.role !== "user") throw new Error("Akun demo staf tidak dapat mengirim laporan.");
    const report = createReport(state, user, options.body);
    writeState(state);
    return presentReport(report);
  }

  if (path === "/alerts") {
    return state.reports
      .filter((report) => report.verification_status === "Verified" && report.warning_published)
      .map(({ id, ticket, title, category, risk_level, created_at, updated_at }) => ({
        id, ticket, title, category, risk_level, created_at, updated_at,
      }));
  }

  if (path === "/correlations" && staff) return listCorrelations(state.reports);

  if (path === "/activity" && staff) return state.activity;

  if (path === "/users" && user.role === "admin") {
    return state.users.map((person) => ({
      ...person,
      report_count: state.reports.filter((report) => report.user_id === person.id).length,
    }));
  }

  const reviewMatch = path.match(/^\/reports\/([^/]+)\/review$/);
  if (reviewMatch && method === "PATCH" && staff) {
    const report = state.reports.find((item) => item.id === decodeURIComponent(reviewMatch[1]));
    if (!report) throw new Error("Laporan demo tidak ditemukan.");
    const changes = parseBody(options.body);
    const nextStatus = changes.verification_status || report.verification_status;
    const nextWarning = changes.warning_published ?? report.warning_published;
    if (nextWarning && nextStatus !== "Verified") {
      throw new Error("Peringatan hanya dapat diterbitkan dari laporan terverifikasi.");
    }
    for (const key of ["verification_status", "resolution_status", "warning_published"]) {
      if (changes[key] !== undefined) report[key] = changes[key];
    }
    report.updated_at = new Date().toISOString();
    recordActivity(state, user, "report_reviewed", changes.note || "Status laporan diperbarui dalam demo.", report);
    writeState(state);
    return presentReport(report, true);
  }

  const userMatch = path.match(/^\/users\/([^/]+)$/);
  if (userMatch && method === "PATCH" && user.role === "admin") {
    const target = state.users.find((item) => item.id === decodeURIComponent(userMatch[1]));
    if (!target) throw new Error("Akun demo tidak ditemukan.");
    const changes = parseBody(options.body);
    if (target.id === user.id && changes.active === false) {
      throw new Error("Administrator demo tidak dapat menonaktifkan akunnya sendiri.");
    }
    target.active = Boolean(changes.active);
    recordActivity(state, user, "user_access_updated", `Akses akun demo ${target.active ? "diaktifkan" : "dinonaktifkan"}.`);
    writeState(state);
    return { id: target.id, active: target.active };
  }

  const reportMatch = path.match(/^\/(?:analysis|reports)\/([^/]+)$/);
  if (reportMatch && method === "GET") {
    const report = state.reports.find((item) => item.id === decodeURIComponent(reportMatch[1]));
    if (!report || (!staff && report.user_id !== user.id)) {
      throw new Error("Laporan demo tidak ditemukan.");
    }
    return reportDetail(state, report, user);
  }

  throw new Error("Fitur ini tidak tersedia pada demo.");
}
