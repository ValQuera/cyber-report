import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell,
  BookOpen, Check, CheckCircle2, ChevronDown, CircleHelp, ClipboardCheck, Clock3,
  Download, FileSearch, FileText, Fingerprint, Globe2, LayoutDashboard,
  LockKeyhole, LogOut, Menu, Plus, Radio, Search, Shield, ShieldAlert,
  ShieldCheck, Sparkles, Users, Waypoints, X, Zap,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api, DEMO_MODE } from "./api.js";
import { resetDemoData } from "./demoApi.js";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "reports", label: "Report management", icon: FileText, staff: true },
  { id: "analysis", label: "AI analysis", icon: Sparkles, staff: true },
  { id: "correlations", label: "Threat correlation", icon: Waypoints, staff: true },
  { id: "monitoring", label: "Threat monitoring", icon: Radio, staff: true },
  { id: "alerts", label: "Threat alerts", icon: Bell },
  { id: "education", label: "Security education", icon: BookOpen },
  { id: "users", label: "User management", icon: Users, admin: true },
  { id: "activity", label: "Activity log", icon: Activity, staff: true },
];

const categories = ["Phishing", "Malware", "Data Breach", "Account Compromise", "Ransomware", "Other"];
const statuses = ["Submitted", "Under Review", "Verified", "Rejected", "Resolved"];
const roleLabel = { user: "Pelapor", analyst: "Security analyst", admin: "Administrator" };
const localDateTime = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatDate(value, short = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", short
    ? { day: "2-digit", month: "short" }
    : { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function StatusBadge({ status }) {
  const styles = {
    Verified: "green", Resolved: "green", "Under Review": "blue",
    Submitted: "amber", Rejected: "red", Open: "slate",
  };
  return <span className={`status-badge ${styles[status] || "slate"}`}><i />{status || "Open"}</span>;
}

function RiskBadge({ risk }) {
  const value = risk || "Low";
  return <span className={`risk-badge ${value.toLowerCase()}`}><span />{value} risk</span>;
}

function App() {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [page, setPage] = useState("overview");
  const [dashboard, setDashboard] = useState(null);
  const [reports, setReports] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [correlations, setCorrelations] = useState([]);
  const [people, setPeople] = useState([]);
  const [activity, setActivity] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All reports");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isStaff = user?.role === "analyst" || user?.role === "admin";

  useEffect(() => {
    const token = localStorage.getItem("cyber-report-token");
    if (!token) {
      setInitializing(false);
      return;
    }
    api("/auth/me")
      .then(setUser)
      .catch(() => localStorage.removeItem("cyber-report-token"))
      .finally(() => setInitializing(false));
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    setError("");
    try {
      const tasks = [
        api("/dashboard"),
        api("/reports"),
        api("/alerts"),
      ];
      if (isStaff) tasks.push(api("/correlations"), api("/activity"));
      if (user.role === "admin") tasks.push(api("/users"));
      const results = await Promise.all(tasks);
      setDashboard(results[0]);
      setReports(results[1]);
      setAlerts(results[2]);
      if (isStaff) {
        setCorrelations(results[3]);
        setActivity(results[4]);
      }
      if (user.role === "admin") setPeople(results[5]);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [isStaff, user]);

  async function openReport(report) {
    setSelected(report);
    try {
      const path = isStaff ? `/analysis/${report.id}` : `/reports/${report.id}`;
      setSelected(await api(path));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 3800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function signIn(payload, isRegister) {
    setBusy(true);
    setError("");
    try {
      if (isRegister) {
        await api("/auth/register", { method: "POST", body: JSON.stringify(payload) });
      }
      const response = await api("/auth/login", { method: "POST", body: JSON.stringify(payload) });
      localStorage.setItem("cyber-report-token", response.access_token);
      setUser(response.user);
      setPage("overview");
      setNotice(isRegister ? "Akun berhasil dibuat. Selamat datang." : "Berhasil masuk ke workspace.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    let logoutWarning = "";
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (requestError) {
      logoutWarning = `Server belum mengonfirmasi logout: ${requestError.message}`;
    }
    localStorage.removeItem("cyber-report-token");
    setUser(null);
    setDashboard(null);
    setReports([]);
    setError(logoutWarning);
    setPage("overview");
  }

  async function updateReport(id, changes) {
    setBusy(true);
    setError("");
    try {
      await api(`/reports/${id}/review`, { method: "PATCH", body: JSON.stringify(changes) });
      setSelected(null);
      setNotice("Pembaruan laporan berhasil disimpan.");
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateUser(person) {
    setError("");
    try {
      await api(`/users/${person.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !person.active }),
      });
      setNotice(`Akses ${person.name} berhasil ${person.active ? "dinonaktifkan" : "diaktifkan"}.`);
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const filteredReports = useMemo(() => reports.filter((report) => {
    const normalized = query.trim().toLowerCase();
    const matchesText = !normalized || [
      report.ticket, report.title, report.category, report.reporter_name,
    ].some((value) => value?.toLowerCase().includes(normalized));
    const matchesStatus = statusFilter === "All reports" || report.verification_status === statusFilter;
    return matchesText && matchesStatus;
  }), [query, reports, statusFilter]);

  if (initializing) return <div className="boot-screen"><ShieldCheck size={30} /><span>{DEMO_MODE ? "Menyiapkan demo..." : "Menyiapkan secure workspace..."}</span></div>;
  if (!user) return <AuthScreen onSignIn={signIn} error={error} busy={busy} demoMode={DEMO_MODE} />;

  const activePage = navigation.find((item) => item.id === page)?.label || "Overview";
  const allowedNavigation = navigation.filter((item) =>
    (!item.staff || isStaff) && (!item.admin || user.role === "admin"),
  );

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="mobile-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <a className="brand-lockup" href="#" onClick={(event) => { event.preventDefault(); setPage("overview"); }}>
          <span className="brand-symbol"><Shield size={22} strokeWidth={2.2} /><i /></span>
          <span className="brand-copy"><b>CYBER<span>REPORT</span></b><small>THREAT INTELLIGENCE</small></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav">
          {allowedNavigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => { setPage(id); setSidebarOpen(false); }}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              {id === "alerts" && alerts.length > 0 && <span className="nav-count">{alerts.length}</span>}
              {page === id && <span className="nav-active-mark" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-health"><span className="pulse-dot" /><span><b>{DEMO_MODE ? "Demo mode" : "All systems operational"}</b><small>{DEMO_MODE ? "Data simulasi di browser ini" : "API connection secure"}</small></span><Check size={14} /></div>
          <button className="user-profile" onClick={signOut}>
            <span className="avatar">{initials(user.name)}</span>
            <span className="profile-copy"><b>{user.name}</b><small>{roleLabel[user.role]}</small></span>
            <LogOut size={15} className="profile-exit" />
          </button>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>{activePage}</b></div>
          <div className="topbar-actions">
            <span className="live-indicator"><i /> {DEMO_MODE ? "DEMO SIMULATION" : "LIVE MONITORING"}</span>
            <span className="topbar-divider" />
            <button className="icon-button notification-button" aria-label="Threat alerts" onClick={() => setPage("alerts")}><Bell size={18} />{alerts.length > 0 && <i />}</button>
            <button className="topbar-user" onClick={signOut}><span className="avatar mini-avatar">{initials(user.name)}</span><ChevronDown size={14} /></button>
          </div>
        </header>

        <section className="page-content">
          {DEMO_MODE && <div className="inline-alert info-alert"><CircleHelp size={17} /><span>DEMO PUBLIK: data simulasi hanya tersimpan di browser ini. Jangan masukkan informasi pribadi atau laporan nyata.</span></div>}
          {error && <div className="inline-alert error-alert"><AlertTriangle size={17} />{error}<button onClick={() => setError("")}><X size={15} /></button></div>}
          {page === "overview" && <Dashboard dashboard={dashboard} reports={reports} alerts={alerts} isStaff={isStaff} user={user} onNavigate={setPage} onSelect={openReport} />}
          {page === "reports" && <ReportsPage reports={filteredReports} query={query} setQuery={setQuery} status={statusFilter} setStatus={setStatusFilter} isStaff={isStaff} onSelect={openReport} demoMode={DEMO_MODE} />}
          {page === "new-report" && <ReportForm busy={busy} demoMode={DEMO_MODE} onCancel={() => setPage("overview")} onSubmit={async (formData) => {
            setBusy(true);
            setError("");
            try {
              const report = await api("/reports", { method: "POST", body: formData });
              await refresh();
              setNotice(`Laporan tersimpan · tiket ${report.ticket}`);
              setPage("reports");
            } catch (requestError) {
              setError(requestError.message);
            } finally {
              setBusy(false);
            }
          }} />}
          {page === "analysis" && <AnalysisPage reports={reports} onSelect={openReport} />}
          {page === "correlations" && <CorrelationPage groups={correlations} />}
          {page === "monitoring" && <MonitoringPage reports={reports} onSelect={openReport} demoMode={DEMO_MODE} />}
          {page === "alerts" && <AlertsPage alerts={alerts} demoMode={DEMO_MODE} />}
          {page === "education" && <EducationPage />}
          {page === "users" && <UsersPage people={people} onToggle={updateUser} />}
          {page === "activity" && <ActivityPage items={activity} />}
        </section>
      </main>

      {selected && <ReportDialog report={selected} isStaff={isStaff} busy={busy} onClose={() => setSelected(null)} onUpdate={updateReport} />}
      {notice && <div className="toast"><CheckCircle2 size={18} />{notice}<button onClick={() => setNotice("")}><X size={15} /></button></div>}
      <button className="floating-report" onClick={() => setPage("new-report")}><Plus size={18} /><span>Buat laporan</span></button>
    </div>
  );
}

function AuthScreen({ onSignIn, error, busy, demoMode }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("demo@cyberreport.id");
  const [password, setPassword] = useState("DemoUser2026!");
  const [name, setName] = useState("");
  const [showDemo, setShowDemo] = useState(demoMode);
  function submit(event) {
    event.preventDefault();
    const payload = { email, password };
    if (isRegister) payload.name = name;
    onSignIn(payload, isRegister);
  }
  return (
    <div className="auth-page">
      <div className="auth-grid-bg" />
      <header className="auth-top">
        <div className="brand-lockup"><span className="brand-symbol"><Shield size={22} /><i /></span><span className="brand-copy"><b>CYBER<span>REPORT</span></b><small>THREAT INTELLIGENCE</small></span></div>
        <span className="auth-encrypted"><LockKeyhole size={13} /> {demoMode ? "PUBLIC DEMO · DATA SIMULATION" : <>ENCRYPTED &amp; SECURE</>}</span>
      </header>
      <main className="auth-main">
        <section className="auth-hero">
          <div className="eyebrow"><span className="eyebrow-line" /> CYBER THREAT REPORTING PLATFORM</div>
          <h1>Make the digital<br />world <em>safer.</em></h1>
          <p>One trusted space to report, verify, and respond to cyber threats. Every signal matters. Every response counts.</p>
          <div className="hero-metrics">
            <div><span className="metric-icon"><ShieldCheck size={17} /></span><b>Human verified</b><small>Analysts are always in control</small></div>
            <div><span className="metric-icon cyan"><Fingerprint size={17} /></span><b>Privacy first</b><small>Your identity stays protected</small></div>
          </div>
          <div className="hero-foot"><span /><span>PREVENTION THROUGH COLLABORATION</span><span /></div>
        </section>
        <section className="auth-card">
          <div className="auth-card-top"><div className="card-overline">{demoMode ? "DEMO ACCESS" : "SECURE ACCESS"}</div><span className="lock-emblem"><LockKeyhole size={16} /></span></div>
          <h2>{isRegister ? "Create your account" : "Welcome back"}</h2>
          <p className="auth-subtitle">{demoMode ? "Pilih akun simulasi. Jangan masukkan data asli." : isRegister ? "Bergabung untuk membuat laporan ancaman." : "Masuk untuk melanjutkan ke secure workspace."}</p>
          <form onSubmit={submit} className="auth-form">
            {isRegister && <label>Nama lengkap<input required minLength="2" maxLength="80" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama Anda" /></label>}
            <label>Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" /></label>
            <label>Password<div className="password-wrap"><input required type="password" minLength="8" autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 8 karakter" /><span><LockKeyhole size={14} /></span></div></label>
            {error && <div className="form-error"><AlertTriangle size={15} />{error}</div>}
            <button className="primary-button auth-submit" disabled={busy}>{busy ? "Memproses..." : demoMode ? "Enter demo" : isRegister ? "Buat akun" : "Sign in securely"}<ArrowRight size={17} /></button>
          </form>
          {!demoMode && <div className="auth-switch">{isRegister ? "Sudah punya akun?" : "Belum memiliki akun?"}<button onClick={() => setIsRegister(!isRegister)}>{isRegister ? "Sign in" : "Daftar sekarang"}</button></div>}
          {!demoMode && !isRegister && <button className="demo-toggle" onClick={() => setShowDemo(!showDemo)}><CircleHelp size={14} /> Akun demo untuk presentasi <ChevronDown size={13} className={showDemo ? "rotate" : ""} /></button>}
          {showDemo && !isRegister && <div className="demo-accounts">
            <button onClick={() => { setEmail("demo@cyberreport.id"); setPassword("DemoUser2026!"); }}>Pelapor <span>demo@cyberreport.id</span></button>
            <button onClick={() => { setEmail("analyst@cyberreport.id"); setPassword("DemoAnalyst2026!"); }}>Analyst <span>analyst@cyberreport.id</span></button>
            <button onClick={() => { setEmail("admin@cyberreport.id"); setPassword("DemoAdmin2026!"); }}>Admin <span>admin@cyberreport.id</span></button>
          </div>}
          {demoMode && <button className="demo-reset" type="button" onClick={() => resetDemoData()}>Reset demo data in this browser</button>}
        </section>
      </main>
      <footer className="auth-footer"><span>© 2026 CYBER REPORT · KARTIKA CYBER HACKATHON</span><span><i /> PROTOTYPE · DATA DEMO</span></footer>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><div className="section-eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

function Dashboard({ dashboard, reports, alerts, isStaff, user, onNavigate, onSelect }) {
  const stats = isStaff ? [
    { label: "Total reports", value: dashboard?.total_reports ?? "—", icon: FileText, tone: "blue", change: "All incoming signals" },
    { label: "New reports", value: dashboard?.submitted ?? "—", icon: Zap, tone: "cyan", change: "Awaiting initial review" },
    { label: "Under review", value: dashboard?.under_review ?? "—", icon: Clock3, tone: "amber", change: "Active investigations" },
    { label: "High priority", value: dashboard?.high_priority ?? "—", icon: ShieldAlert, tone: "red", change: "Recommended for triage" },
  ] : [
    { label: "My reports", value: dashboard?.total_reports ?? "—", icon: FileText, tone: "blue", change: "Submitted by you" },
    { label: "In review", value: dashboard?.under_review ?? "—", icon: Clock3, tone: "amber", change: "Being reviewed" },
    { label: "Verified", value: dashboard?.verified ?? "—", icon: ShieldCheck, tone: "green", change: "Human verified" },
    { label: "Public alerts", value: alerts.length, icon: Bell, tone: "cyan", change: "Verified information only" },
  ];
  const trendData = dashboard?.trend?.length
    ? dashboard.trend.map((item) => ({ day: formatDate(item.day, true), reports: item.count }))
    : Array.from({ length: 7 }, (_, index) => ({ day: formatDate(new Date(Date.now() - (6 - index) * 86400000).toISOString(), true), reports: 0 }));
  const categoryCounts = categories.map((category) => ({
    category,
    count: reports.filter((report) => report.category === category).length,
  })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count).slice(0, 4);
  return (
    <>
      <PageHeading eyebrow="COMMAND CENTER · OVERVIEW" title={`Good day, ${user.name.split(" ")[0]}.`} description={isStaff ? "Here's what's happening across the threat landscape today." : "Pantau laporan dan ikuti informasi ancaman yang telah diverifikasi."} action={<button className="primary-button" onClick={() => onNavigate("new-report")}><Plus size={16} /> Report an incident</button>} />
      <div className="overview-meta"><span><span className="pulse-dot" /> LIVE THREAT MONITORING</span><span>UPDATED JUST NOW <ArrowUpRight size={12} /></span></div>
      <div className="stats-grid">{stats.map(({ label, value, icon: Icon, tone, change }) => <article className="stat-card" key={label}>
        <div className="stat-top"><span className={`stat-icon ${tone}`}><Icon size={18} /></span><span className="stat-more"><ArrowUpRight size={15} /></span></div>
        <div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-foot"><span className={`tiny-dot ${tone}`} />{change}</div>
      </article>)}</div>
      <div className="dashboard-grid">
        <article className="panel trend-panel">
          <div className="panel-heading"><div><div className="section-eyebrow">ACTIVITY OVERVIEW</div><h2>Threat activity</h2></div><span className="chart-period"><span className="pulse-dot" /> LAST 7 DAYS</span></div>
          <div className="chart-key"><span><i /> Reports received</span><span className="chart-total">{dashboard?.total_reports ?? 0} <small>total reports</small></span></div>
          <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trendData} margin={{ top: 10, right: 4, left: -22, bottom: 0 }}>
            <defs><linearGradient id="reportGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2795ff" stopOpacity={0.25} /><stop offset="95%" stopColor="#2795ff" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke="#1b2a3d" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: "#718096", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: "#718096", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "#111c30", border: "1px solid #263851", borderRadius: 9, color: "#f8fafc" }} />
            <Area type="monotone" dataKey="reports" name="Reports" stroke="#2795ff" strokeWidth={2.5} fill="url(#reportGlow)" activeDot={{ r: 5, fill: "#53c7ff", stroke: "#0b1220", strokeWidth: 3 }} />
          </AreaChart></ResponsiveContainer></div>
        </article>
        <article className="panel categories-panel">
          <div className="panel-heading"><div><div className="section-eyebrow">SIGNAL CLASSIFICATION</div><h2>Report categories</h2></div><button className="ghost-icon" title="Based on submitted reports"><CircleHelp size={15} /></button></div>
          {categoryCounts.length ? <div className="category-list">{categoryCounts.map(({ category, count }, index) => <div className="category-row" key={category}>
            <div className={`category-icon cat-${index}`}><FileSearch size={16} /></div><div className="category-copy"><b>{category}</b><span>{count} {count === 1 ? "report" : "reports"}</span></div><div className="category-track"><i style={{ width: `${Math.max(14, (count / Math.max(...categoryCounts.map((item) => item.count))) * 100)}%` }} /></div><b className="category-number">{count}</b>
          </div>)}</div> : <EmptyState icon={Globe2} title="No classified signals yet" text="Report categories will appear here when reports arrive." />}
          <button className="text-link" onClick={() => onNavigate(isStaff ? "reports" : "alerts")}>View {isStaff ? "all reports" : "verified alerts"} <ArrowRight size={14} /></button>
        </article>
      </div>
      <section className="panel recent-panel">
        <div className="panel-heading"><div><div className="section-eyebrow">{isStaff ? "INCOMING SIGNALS" : "YOUR ACTIVITY"}</div><h2>{isStaff ? "Recent reports" : "Recent submissions"}</h2></div><button className="text-link" onClick={() => onNavigate(isStaff ? "reports" : "reports")}>View all <ArrowRight size={14} /></button></div>
        {reports.length ? <ReportTable reports={reports.slice(0, 5)} isStaff={isStaff} onSelect={onSelect} compact /> : <EmptyState icon={FileText} title="Nothing to review yet" text={isStaff ? "New incident reports will appear in this queue." : "Your submitted reports and their status will appear here."} action={<button className="secondary-button" onClick={() => onNavigate("new-report")}><Plus size={15} /> Submit a report</button>} />}
      </section>
      <div className="dashboard-footnote"><ShieldCheck size={15} /><span>AI classifications are recommendations only. All reports require human review before verification or public warning.</span><button onClick={() => onNavigate(isStaff ? "analysis" : "alerts")}>Learn more <ArrowRight size={13} /></button></div>
    </>
  );
}

function ReportsPage({ reports, query, setQuery, status, setStatus, isStaff, onSelect, demoMode }) {
  return <>
    <PageHeading eyebrow={demoMode ? "DEMO · SIMULATED REPORTS" : "THREAT INTELLIGENCE · REPORTS"} title={isStaff ? "Report management" : "Report history"} description={demoMode ? "Semua laporan dan status di halaman ini adalah data simulasi lokal." : isStaff ? "Review incoming reports, prioritize investigations, and make verification decisions." : "Lacak perkembangan laporan dan lihat status pemeriksaan oleh tim analis."} action={!isStaff && <span className={demoMode ? "prototype-pill" : "private-pill"}>{demoMode ? "LOCAL DEMO DATA" : <><LockKeyhole size={13} /> PRIVATE TO YOU</>}</span>} />
    <div className="toolbar panel">
      <div className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reports, tickets, or categories" /></div>
      <div className="toolbar-right"><span>{reports.length} reports</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>All reports</option>{statuses.slice(0, 4).map((item) => <option key={item}>{item}</option>)}</select></div>
    </div>
    <section className="panel report-list-panel">
      {reports.length ? <ReportTable reports={reports} isStaff={isStaff} onSelect={onSelect} /> : <EmptyState icon={Search} title="No matching reports" text="Coba ubah kata kunci atau filter status laporan." />}
    </section>
    <div className="privacy-note"><CircleHelp size={15} /><span>{demoMode ? "Mode demo berjalan di browser ini dan tidak menyediakan penyimpanan atau perlindungan data backend." : "Identitas pelapor dan lampiran hanya dapat diakses pihak yang berwenang. Data ini tidak ditampilkan secara publik."}</span></div>
  </>;
}

function ReportTable({ reports, isStaff, onSelect, compact = false }) {
  return <div className="table-scroll"><table className="reports-table">
    <thead><tr><th>Report</th><th>Category</th>{isStaff && <th>Priority</th>}<th>Status</th>{isStaff && <th>Reporter</th>}<th>Date</th><th /></tr></thead>
    <tbody>{reports.map((report) => <tr key={report.id} onClick={() => onSelect(report)}>
      <td><div className="table-title"><span className="table-file-icon"><FileText size={15} /></span><span><b>{report.title}</b><small>{report.ticket}</small></span></div></td>
      <td><span className="category-tag">{report.category}</span></td>
      {isStaff && <td><RiskBadge risk={report.risk_level} /></td>}
      <td><StatusBadge status={report.verification_status} /></td>
      {isStaff && <td><span className="reporter-cell">{report.reporter_name || "—"}</span></td>}
      <td><span className="date-cell">{formatDate(report.created_at, true)}</span></td>
      <td><button className="row-arrow" aria-label={`Open ${report.ticket}`} onClick={(event) => { event.stopPropagation(); onSelect(report); }}><ArrowRight size={15} /></button></td>
    </tr>)}</tbody>
  </table>{compact && <div className="table-caption"><span>Showing {reports.length} recent reports</span><span>Click any report to view details</span></div>}</div>;
}

function ReportForm({ busy, demoMode, onCancel, onSubmit }) {
  const [form, setForm] = useState({ title: "", description: "", category: "", occurred_at: localDateTime(), privacy_accepted: false });
  const [file, setFile] = useState(null);
  const [localError, setLocalError] = useState("");
  function update(key, value) { setForm((previous) => ({ ...previous, [key]: value })); }
  function submit(event) {
    event.preventDefault();
    setLocalError("");
    if (form.description.trim().length < 30) return setLocalError("Jelaskan kejadian dengan minimal 30 karakter.");
    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => data.append(key, value));
    data.set("occurred_at", new Date(form.occurred_at).toISOString());
    if (file) data.append("evidence_file", file);
    onSubmit(data);
  }
  return <>
    <PageHeading eyebrow={demoMode ? "PUBLIC DEMO · SIMULATED REPORT" : "SECURE INTAKE · NEW REPORT"} title="Report an incident" description={demoMode ? "Buat laporan contoh untuk mencoba alur demo. Jangan masukkan data pribadi atau insiden nyata." : "Ceritakan apa yang terjadi. Tim analis akan meninjau laporan dan lampiran secara rahasia."} action={<button className="secondary-button" onClick={onCancel}>Cancel</button>} />
    <form className="report-form-layout" onSubmit={submit}>
      <section className="panel form-panel">
        <div className="form-section-title"><span className="form-step">01</span><div><h2>Incident details</h2><p>Berikan informasi yang cukup agar tim dapat mulai meninjau.</p></div></div>
        <label className="field-label">Report title <span className="required">*</span><input required minLength="8" maxLength="120" value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Contoh: Email phishing mengatasnamakan layanan bank" /></label>
        <div className="field-row">
          <label className="field-label">Threat category <span className="required">*</span><select required value={form.category} onChange={(event) => update("category", event.target.value)}><option value="" disabled>Select a category</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="field-label">When did this happen? <span className="required">*</span><input required type="datetime-local" value={form.occurred_at} max={localDateTime()} onChange={(event) => update("occurred_at", event.target.value)} /></label>
        </div>
        <label className="field-label">What happened? <span className="required">*</span><textarea required minLength="30" maxLength="5000" rows="6" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Jelaskan apa yang Anda lihat, pesan yang diterima, atau dampak yang terjadi. Jangan sertakan kata sandi atau informasi pribadi yang tidak diperlukan." /><span className="field-hint">{form.description.length}/5000 characters · Jangan masukkan kata sandi atau data sensitif.</span></label>
        <div className="form-section-title evidence-heading"><span className="form-step">02</span><div><h2>Supporting evidence <span className="optional">OPTIONAL</span></h2><p>{demoMode ? "Lampiran tidak disimpan dalam demo publik." : "Lampirkan bukti relevan. Maksimum 5 MB per file."}</p></div></div>
        <label className={`upload-zone ${file ? "file-selected" : ""} ${demoMode ? "demo-upload-disabled" : ""}`}><input type="file" disabled={demoMode} accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" onChange={(event) => { setFile(event.target.files?.[0] || null); setLocalError(""); }} />
          {demoMode ? <><span className="upload-icon"><CircleHelp size={20} /></span><b>Uploads are disabled in this demo</b><small>No files are sent or stored</small></> : file ? <><span className="upload-icon"><CheckCircle2 size={21} /></span><b>{file.name}</b><small>{(file.size / 1024 / 1024).toFixed(2)} MB · Click to replace</small></> : <><span className="upload-icon"><Download size={20} /></span><b>Drop evidence here, or <em>browse files</em></b><small>PDF, PNG, JPG, TXT · maximum 5 MB</small></>}
        </label>
        <label className="privacy-consent"><input type="checkbox" checked={form.privacy_accepted} onChange={(event) => update("privacy_accepted", event.target.checked)} /><span className="custom-check"><Check size={12} /></span><span>{demoMode ? "Saya memahami ini hanya data simulasi lokal dan tidak akan memasukkan laporan nyata atau informasi pribadi." : "Saya menyatakan laporan ini akurat sepanjang pengetahuan saya dan menyetujui pemrosesan data untuk keperluan verifikasi. Identitas dan bukti hanya dapat dilihat pihak berwenang."}</span></label>
        {localError && <div className="form-error"><AlertTriangle size={15} />{localError}</div>}
        <div className="form-actions"><span><LockKeyhole size={14} /> {demoMode ? "Data simulasi di browser ini" : "Your report is confidential"}</span><button className="primary-button" disabled={busy || !form.privacy_accepted}>{busy ? "Mengirim laporan..." : demoMode ? "Submit demo report" : "Submit secure report"}<ArrowRight size={16} /></button></div>
      </section>
      <aside className="form-aside">
        <div className="aside-info"><span className="aside-icon"><ShieldCheck size={20} /></span><h3>{demoMode ? "Demo data only" : "Your privacy comes first"}</h3><p>{demoMode ? "Data simulasi disimpan di localStorage browser ini dan tidak dikirim ke backend." : "Informasi pelapor dan lampiran hanya dapat diakses analyst atau admin yang berwenang."}</p><div className="aside-divider" /><ul>{demoMode ? <><li><CircleHelp size={14} /> Data tidak dibagikan antar pengunjung</li><li><CircleHelp size={14} /> Upload bukti dinonaktifkan</li><li><CircleHelp size={14} /> Status bukan hasil verifikasi nyata</li></> : <><li><Check size={14} /> Laporan dienkripsi saat dikirim</li><li><Check size={14} /> Identitas tidak ditampilkan publik</li><li><Check size={14} /> Peringatan hanya dari laporan terverifikasi</li></>}</ul></div>
        <div className="aside-info ai-note"><span className="aside-icon cyan"><Sparkles size={19} /></span><div className="section-eyebrow">RESPONSIBLE AI</div><h3>Human-led review</h3><p>Analisis otomatis hanyalah rekomendasi awal. Keputusan verifikasi tetap berada di tangan petugas.</p></div>
      </aside>
    </form>
  </>;
}

function AnalysisPage({ reports, onSelect }) {
  const analyzed = reports.filter((report) => report.predicted_category);
  return <>
    <PageHeading eyebrow="DECISION SUPPORT · AI/NLP" title="AI analysis" description="Klasifikasi, kemiripan, dan rekomendasi prioritas untuk membantu triase petugas." action={<span className="prototype-pill"><Sparkles size={13} /> RULE-BASED DEMO</span>} />
    <div className="inline-alert info-alert"><CircleHelp size={17} /><span>Analisis ini menggunakan aturan dan kata kunci sederhana untuk prototipe. Confidence bukan probabilitas terkalibrasi dan tidak boleh digunakan sebagai bukti final.</span></div>
    <div className="analysis-summary">
      <div className="panel analysis-intro"><span className="analysis-orbit"><Sparkles size={24} /></span><div><div className="section-eyebrow">HUMAN-IN-THE-LOOP</div><h2>Explainable by design</h2><p>Setiap rekomendasi menyertakan alasan yang dapat ditinjau. Analyst memutuskan langkah berikutnya.</p></div><div className="analysis-stat"><b>{analyzed.length}</b><span>reports analyzed</span></div></div>
      <div className="analysis-list">{analyzed.length ? analyzed.map((report) => <button className="analysis-card" key={report.id} onClick={() => onSelect(report)}>
        <div className="analysis-card-head"><span className="analysis-mini-icon"><Sparkles size={15} /></span><span className={`confidence ${report.confidence >= 0.75 ? "conf-high" : ""}`}>{Math.round(report.confidence * 100)}% confidence</span><RiskBadge risk={report.risk_level} /></div>
        <h3>{report.title}</h3><div className="analysis-prediction"><span>Predicted category</span><b>{report.predicted_category}</b></div><div className="confidence-track"><i style={{ width: `${report.confidence * 100}%` }} /></div>
        <div className="analysis-card-foot"><span>{report.ticket} · {formatDate(report.created_at, true)}</span><span>Review details <ArrowRight size={13} /></span></div>
      </button>) : <div className="panel"><EmptyState icon={Sparkles} title="No analysis yet" text="Report analysis and recommendation will appear here." /></div>}</div>
    </div>
  </>;
}

function CorrelationPage({ groups }) {
  return <>
    <PageHeading eyebrow="THREAT INTELLIGENCE · RELATIONSHIPS" title="Threat correlation" description="Kelompok indikasi dengan istilah bersama untuk membantu pemeriksaan keterkaitan laporan." action={<span className="prototype-pill"><Waypoints size={13} /> INDICATOR MATCHING</span>} />
    <div className="inline-alert info-alert"><CircleHelp size={17} /><span>Pengelompokan prototipe menggunakan kata kunci yang sama pada judul laporan, bukan intelijen ancaman eksternal. Hubungan bukan bukti adanya pelaku atau insiden yang sama.</span></div>
    {groups.length ? <div className="correlation-grid">{groups.map((group) => <article className="panel correlation-card" key={group.indicator}>
      <div className="correlation-head"><span className="correlation-icon"><Waypoints size={17} /></span><div><span className="section-eyebrow">SHARED KEYWORD</span><h2>{group.indicator}</h2></div><span className="group-count">{group.reports.length} linked</span></div>
      <div className="correlation-connector">{group.reports.map((report) => <div className="correlation-report" key={report.id}><span className="connector-dot" /><span><b>{report.title}</b><small>{report.ticket} · {report.category}</small></span><StatusBadge status={report.verification_status} /></div>)}</div>
      <div className="correlation-foot"><span><CircleHelp size={14} /> Suggested relationship · analyst review required</span><ArrowUpRight size={14} /></div>
    </article>)}</div> : <div className="panel"><EmptyState icon={Waypoints} title="No shared indicators found" text="When reports share keywords in their titles, suggested groupings will appear here." /></div>}
  </>;
}

function MonitoringPage({ reports, onSelect, demoMode }) {
  const verified = reports.filter((report) => report.verification_status === "Verified");
  const open = verified.filter((report) => report.resolution_status !== "Resolved");
  const resolved = verified.filter((report) => report.resolution_status === "Resolved");
  return <>
    <PageHeading eyebrow={demoMode ? "DEMO · SIMULATED THREAT DATA" : "OPERATIONS · VERIFIED THREATS"} title={demoMode ? "Demo monitoring" : "Threat monitoring"} description={demoMode ? "Status verifikasi dan penanganan pada halaman ini hanyalah contoh." : "Pantau informasi terverifikasi, tingkat prioritas, dan status penanganan."} action={demoMode ? <span className="prototype-pill">SIMULATED SIGNALS</span> : <span className="verified-only"><ShieldCheck size={14} /> VERIFIED SIGNALS ONLY</span>} />
    <div className="monitoring-metrics"><div className="panel monitor-metric"><span className="monitor-icon green"><ShieldCheck size={18} /></span><span>Verified reports</span><b>{verified.length}</b></div><div className="panel monitor-metric"><span className="monitor-icon amber"><Activity size={18} /></span><span>Open response</span><b>{open.length}</b></div><div className="panel monitor-metric"><span className="monitor-icon blue"><CheckCircle2 size={18} /></span><span>Resolved</span><b>{resolved.length}</b></div></div>
    <div className="panel monitoring-panel"><div className="panel-heading"><div><div className="section-eyebrow">{demoMode ? "SIMULATED REGISTER" : "VERIFIED THREAT REGISTER"}</div><h2>{demoMode ? "Sample monitoring" : "Current monitoring"}</h2></div><span className="monitoring-live"><i /> {demoMode ? "DEMO" : "LIVE"}</span></div>
      {verified.length ? <div className="table-scroll"><table className="reports-table"><thead><tr><th>Verified report</th><th>Priority</th><th>Response status</th><th>Last updated</th><th /></tr></thead><tbody>{verified.map((report) => <tr key={report.id} onClick={() => onSelect(report)}><td><div className="table-title"><span className="table-file-icon verified-file"><ShieldCheck size={15} /></span><span><b>{report.title}</b><small>{report.ticket} · {report.category}</small></span></div></td><td><RiskBadge risk={report.risk_level} /></td><td><StatusBadge status={report.resolution_status} /></td><td><span className="date-cell">{formatDate(report.updated_at, true)}</span></td><td><ArrowRight size={15} className="row-arrow-icon" /></td></tr>)}</tbody></table></div> : <EmptyState icon={ShieldCheck} title="No verified information yet" text="Reports appear here only after a human analyst verifies them." />}
    </div>
  </>;
}

function AlertsPage({ alerts, demoMode }) {
  return <>
    <PageHeading eyebrow={demoMode ? "DEMO · SIMULATED ALERTS" : "PUBLIC INFORMATION · VERIFIED ONLY"} title={demoMode ? "Demo threat alerts" : "Threat alerts"} description={demoMode ? "Contoh tampilan peringatan; bukan ancaman dunia nyata." : "Informasi ancaman yang telah ditinjau dan dipublikasikan secara resmi."} action={demoMode ? <span className="prototype-pill">DEMO DATA</span> : <span className="verified-only"><ShieldCheck size={14} /> HUMAN VERIFIED</span>} />
    <div className="alert-policy"><span className="alert-policy-icon"><ShieldCheck size={18} /></span><div><b>{demoMode ? "Simulated alert flow" : "Trusted, verified information"}</b><p>{demoMode ? "Status dan isi di bawah ini hanya data contoh untuk presentasi, bukan hasil pemeriksaan keamanan." : "Peringatan hanya diterbitkan oleh petugas setelah proses verifikasi. Prediksi AI dan laporan yang belum diverifikasi tidak ditampilkan di halaman ini."}</p></div></div>
    {alerts.length ? <div className="alert-list">{alerts.map((alert) => <article className="panel public-alert" key={alert.id}><span className="public-alert-icon"><AlertTriangle size={19} /></span><div className="public-alert-content"><div className="public-alert-meta"><span className="verified-label"><CheckCircle2 size={13} /> {demoMode ? "DEMO ALERT" : "VERIFIED ALERT"}</span><span>{formatDate(alert.updated_at)}</span></div><h2>{alert.title}</h2><p>{demoMode ? "Data verifikasi simulasi untuk demonstrasi. Jangan gunakan sebagai informasi ancaman nyata." : `${alert.category} · Informasi telah diverifikasi oleh security analyst. Gunakan kewaspadaan dan ikuti prosedur keamanan organisasi.`}</p><div className="public-alert-foot"><RiskBadge risk={alert.risk_level} /><span>{alert.ticket}</span></div></div></article>)}</div> : <div className="panel"><EmptyState icon={Bell} title="No active threat alerts" text={demoMode ? "Belum ada contoh peringatan aktif pada demo ini." : "Belum ada peringatan publik. Peringatan akan muncul setelah laporan terverifikasi dan dipublikasikan oleh petugas."} /></div>}
  </>;
}

function UsersPage({ people, onToggle }) {
  return <>
    <PageHeading eyebrow="ADMINISTRATION · ACCESS CONTROL" title="User management" description="Akun dan hak akses terdaftar dalam prototype. Pelaporan publik tidak membuka akses staf." action={<span className="private-pill"><LockKeyhole size={13} /> ADMIN ONLY</span>} />
    <div className="panel user-management"><div className="panel-heading"><div><div className="section-eyebrow">REGISTERED ACCOUNTS</div><h2>{people.length} platform users</h2></div><span className="prototype-pill"><Users size={13} /> ROLE-BASED ACCESS</span></div><div className="table-scroll"><table className="reports-table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Reports</th><th>Joined</th><th>Access</th></tr></thead><tbody>{people.map((person) => <tr key={person.id}><td><div className="table-title"><span className="avatar table-avatar">{initials(person.name)}</span><span><b>{person.name}</b><small>{person.email}</small></span></div></td><td><span className={`role-chip ${person.role}`}>{roleLabel[person.role]}</span></td><td><StatusBadge status={person.active ? "Verified" : "Rejected"} /></td><td>{person.report_count}</td><td className="date-cell">{formatDate(person.created_at, true)}</td><td><button className={`access-toggle ${person.active ? "access-active" : ""}`} onClick={() => onToggle(person)}>{person.active ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div></div>
  </>;
}

function EducationPage() {
  const guidance = [
    { number: "01", icon: LockKeyhole, title: "Gunakan kata sandi yang kuat", text: "Pakai kata sandi unik untuk setiap akun dan aktifkan autentikasi multifaktor bila tersedia." },
    { number: "02", icon: Search, title: "Periksa tautan sebelum dibuka", text: "Pastikan alamat pengirim dan domain situs benar. Jangan terburu-buru mengikuti pesan mendesak." },
    { number: "03", icon: ShieldAlert, title: "Jangan pernah bagikan OTP", text: "Pihak resmi tidak meminta kata sandi, kode OTP, atau recovery code melalui pesan atau telepon." },
    { number: "04", icon: FileText, title: "Laporkan indikasi dengan aman", text: "Sertakan konteks yang relevan, tetapi jangan unggah kata sandi atau data pribadi yang tidak diperlukan." },
    { number: "05", icon: Download, title: "Perbarui perangkat lunak", text: "Gunakan pembaruan resmi, kunci layar perangkat, dan aktifkan pencadangan data secara berkala." },
    { number: "06", icon: CircleHelp, title: "Verifikasi sebelum menyebarkan", text: "Periksa informasi melalui kanal resmi. Status prediksi atau laporan awal bukan konfirmasi ancaman." },
  ];
  return <>
    <PageHeading eyebrow="SECURITY AWARENESS · PRACTICAL GUIDANCE" title="Security education" description="Kebiasaan sederhana untuk membantu melindungi akun, perangkat, dan informasi pribadi." action={<span className="prototype-pill"><ShieldCheck size={13} /> STAY INFORMED</span>} />
    <div className="education-banner"><span><ShieldCheck size={21} /></span><div><div className="section-eyebrow">CYBER HYGIENE BASICS</div><h2>Pause. Check. Protect.</h2><p>Berhenti sejenak sebelum mengeklik atau membagikan informasi. Verifikasi sumber dan gunakan kanal resmi.</p></div></div>
    <div className="education-grid">{guidance.map(({ number, icon: Icon, title, text }) => <article className="panel education-card" key={number}><div className="education-card-top"><span className="education-icon"><Icon size={18} /></span><span>{number}</span></div><h3>{title}</h3><p>{text}</p></article>)}</div>
    <div className="education-disclaimer"><CircleHelp size={15} /><span>Panduan umum untuk edukasi. Jika ada insiden aktif, ikuti prosedur keamanan organisasi atau hubungi petugas yang berwenang.</span></div>
  </>;
}

function ActivityPage({ items }) {
  return <>
    <PageHeading eyebrow="GOVERNANCE · AUDIT TRAIL" title="Activity log" description="Catatan aktivitas penting untuk mendukung akuntabilitas dan pemeriksaan operasional." action={<span className="prototype-pill"><LockKeyhole size={13} /> STAFF ONLY</span>} />
    <div className="panel activity-panel"><div className="panel-heading"><div><div className="section-eyebrow">RECENT EVENTS</div><h2>Audit trail</h2></div><span className="activity-count">{items.length} events</span></div>
      {items.length ? <div className="activity-list">{items.map((item) => <div className="activity-row" key={item.id}><span className="activity-icon"><Activity size={15} /></span><div><b>{item.detail}</b><small>{item.actor_name || "System"}{item.ticket ? ` · ${item.ticket}` : ""}</small></div><time>{formatDate(item.created_at)}</time></div>)}</div> : <EmptyState icon={Activity} title="No activity recorded" text="Login, submissions, and review actions will appear in the audit trail." />}
    </div>
  </>;
}

function ReportDialog({ report, isStaff, busy, onClose, onUpdate }) {
  const [note, setNote] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  async function downloadEvidence(file) {
    try {
      const token = localStorage.getItem("cyber-report-token");
      const base = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
      const response = await fetch(`${base}/reports/${report.id}/evidence/${file.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Lampiran tidak dapat diakses.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setEvidenceError("");
    } catch (requestError) {
      setEvidenceError(requestError.message);
    }
  }
  const similar = report.similar_reports || [];
  return <div className="dialog-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="report-dialog">
      <div className="dialog-top"><span className="section-eyebrow">INCIDENT REPORT · {report.ticket}</span><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="dialog-title-row"><div><h2>{report.title}</h2><div className="dialog-meta">{report.category} <span>·</span> Reported {formatDate(report.created_at)}</div></div><StatusBadge status={report.verification_status} /></div>
      {isStaff && <div className="dialog-reporting-user"><span className="avatar mini-avatar">{initials(report.reporter_name)}</span><span><b>{report.reporter_name}</b><small>{report.reporter_email}</small></span><LockKeyhole size={14} /></div>}
      <div className="dialog-section"><div className="section-eyebrow">INCIDENT DESCRIPTION</div><p className="description-copy">{report.description}</p><div className="occurred-date"><Clock3 size={14} /> Occurred {formatDate(report.occurred_at)}</div></div>
      <div className="dialog-section"><div className="section-eyebrow">ATTACHED EVIDENCE</div>{report.evidence?.length ? report.evidence.map((file) => <button className="evidence-file" key={file.id} onClick={() => downloadEvidence(file)}><FileText size={16} /><span><b>{file.name}</b><small>{(file.size_bytes / 1024 / 1024).toFixed(2)} MB · Private attachment</small></span><Download size={15} /></button>) : <div className="no-evidence">No evidence attached</div>}{evidenceError && <div className="form-error">{evidenceError}</div>}</div>
      <div className="dialog-section ai-assessment"><div className="assessment-heading"><span className="analysis-mini-icon"><Sparkles size={15} /></span><div><div className="section-eyebrow">AI-ASSISTED INITIAL ASSESSMENT</div><small>Recommendation only · human review required</small></div></div>
        <div className="assessment-row"><span>Predicted category</span><b>{report.predicted_category}</b></div><div className="assessment-row"><span>Confidence (not calibrated)</span><b>{Math.round(report.confidence * 100)}%</b></div><div className="assessment-row"><span>Priority recommendation</span><RiskBadge risk={report.risk_level} /></div>
        <ul className="reason-list">{report.risk_reasons?.map((reason) => <li key={reason}><span>•</span>{reason}</li>)}</ul><p className="assessment-explanation">{report.analysis_explanation}</p>
      </div>
      {similar.length > 0 && <div className="dialog-section"><div className="section-eyebrow">POTENTIALLY SIMILAR REPORTS</div>{similar.map((item) => <div className="similar-row" key={item.id}><span className="similar-score">{Math.round(item.similarity * 100)}%</span><span><b>{item.title}</b><small>{item.ticket} · {item.category}</small></span></div>)}</div>}
      <div className="dialog-section"><div className="section-eyebrow">RESPONSE TRACKING</div><div className="assessment-row"><span>Resolution</span><StatusBadge status={report.resolution_status || "Open"} /></div><div className="assessment-row"><span>Early warning</span><span className={report.warning_published ? "warning-live" : "warning-private"}>{report.warning_published ? "Published" : "Not published"}</span></div></div>
      {isStaff && <div className="dialog-actions">
        <label className="field-label">Analyst note (optional)<input maxLength="500" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note to the audit trail" /></label>
        <div className="review-button-grid">
          {report.verification_status !== "Under Review" && <button disabled={busy} className="secondary-button" onClick={() => onUpdate(report.id, { verification_status: "Under Review", note: note || "Laporan mulai ditinjau." })}><FileSearch size={15} /> Start review</button>}
          {report.verification_status !== "Verified" && <button disabled={busy} className="verify-button" onClick={() => onUpdate(report.id, { verification_status: "Verified", note: note || "Laporan diverifikasi oleh analyst." })}><ShieldCheck size={15} /> Verify report</button>}
          {report.verification_status !== "Rejected" && <button disabled={busy} className="reject-button" onClick={() => onUpdate(report.id, { verification_status: "Rejected", warning_published: false, note: note || "Laporan ditolak setelah peninjauan." })}><X size={15} /> Reject</button>}
          {report.verification_status === "Verified" && !report.warning_published && <button disabled={busy} className="primary-button publish-button" onClick={() => onUpdate(report.id, { warning_published: true, note: note || "Peringatan diterbitkan setelah verifikasi." })}><Bell size={15} /> Publish alert</button>}
          {report.verification_status === "Verified" && report.warning_published && <button disabled={busy} className="secondary-button publish-button" onClick={() => onUpdate(report.id, { warning_published: false, note: note || "Peringatan ditarik oleh analyst." })}><Bell size={15} /> Retract alert</button>}
          {report.verification_status === "Verified" && report.resolution_status !== "Resolved" && <button disabled={busy} className="resolve-button" onClick={() => onUpdate(report.id, { resolution_status: "Resolved", note: note || "Penanganan laporan dinyatakan selesai." })}><CheckCircle2 size={15} /> Mark resolved</button>}
        </div>
        <p className="dialog-privacy"><LockKeyhole size={13} /> Keputusan review dan perubahan status dicatat dalam activity log.</p>
      </div>}
    </aside>
  </div>;
}

function EmptyState({ icon: Icon, title, text, action }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={21} /></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export default App;
