"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";
import {
  Grid3x3, MapPin, AlertTriangle, Wrench, BarChart3, LogOut,
  ChevronLeft, Search, Filter, Check, X, Play, Clock, CheckCircle2,
  AlertCircle, Zap, Router as RouterIcon
} from "lucide-react";
import {
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line,
} from "recharts";

// Dark-surface-validated (Nocturne card #232532) status colors — reserved for
// state (good/warning/critical), never reused for categorical identity.
const statusColor = {
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
  neutral: "#75798c", // var(--color-neutral-600)
};

const chartTooltipStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-divider)",
  borderRadius: "var(--radius-md)",
  fontSize: "12px",
  color: "var(--color-text)",
  padding: "8px 10px",
};

const accent = "var(--color-accent)";

function sevTagClass(sev: string) {
  if (sev === "Critical") return "tag tag-accent";
  if (sev === "High" || sev === "Warning") return "tag tag-outline";
  return "tag tag-neutral";
}

function statusTagClass(status: string) {
  if (status === "Resolved") return "tag tag-accent";
  if (status === "Awaiting Approval" || status === "Escalated") return "tag tag-outline";
  return "tag tag-neutral";
}

function siteStatusTagClass(status: string) {
  if (status === "Online") return "tag tag-accent";
  if (status === "Degraded") return "tag tag-outline";
  return "tag tag-neutral";
}

export default function Home() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [view, setView] = useState("dashboard");
  const [loading, setLoading] = useState(true);

  const [data, setData] = useState<any>(null);
  const [sites, setSites] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [reports, setReports] = useState<any>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [siteDetail, setSiteDetail] = useState<any>(null);
  const [incidentDetail, setIncidentDetail] = useState<any>(null);

  const [siteSearch, setSiteSearch] = useState("");
  const [siteCustomerFilter, setSiteCustomerFilter] = useState("all");
  const [siteStatusFilter, setSiteStatusFilter] = useState("all");

  const [incSearch, setIncSearch] = useState("");
  const [incSeverityFilter, setIncSeverityFilter] = useState("all");
  const [incStatusFilter, setIncStatusFilter] = useState("all");

  const [apiError, setApiError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [simSiteId, setSimSiteId] = useState("");
  const [simType, setSimType] = useState("poe_overload");

  const getHeaders = () => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  useEffect(() => {
    const savedToken = localStorage.getItem("aoc_token");
    if (!savedToken) {
      router.push("/login");
    } else {
      setToken(savedToken);
    }
  }, [router]);

  // Turns a failed response into a readable message instead of letting a
  // rejected promise disappear into the console.
  const readError = async (res: Response) => {
    try {
      const body = await res.json();
      return body.detail || body.message || `Request failed (${res.status})`;
    } catch {
      return `Request failed (${res.status})`;
    }
  };

  const fetchAllData = async (opts: { silent?: boolean } = {}) => {
    if (!token) return;
    if (!opts.silent) setLoading(true);
    try {
      await fetch(`${API_BASE}/api/seed`, { method: "POST", headers: getHeaders() }).catch(() => {});

      const [dash, siteList, incidentList, reportData] = await Promise.all([
        fetch(`${API_BASE}/api/dashboard`, { headers: getHeaders() }),
        fetch(`${API_BASE}/api/sites`, { headers: getHeaders() }),
        fetch(`${API_BASE}/api/incidents`, { headers: getHeaders() }),
        fetch(`${API_BASE}/api/reports`, { headers: getHeaders() }),
      ]);

      const failed = [dash, siteList, incidentList, reportData].find(r => !r.ok);
      if (failed) {
        setApiError(await readError(failed));
        return;
      }

      setData(await dash.json());
      setSites(await siteList.json());
      setIncidents(await incidentList.json());
      setReports(await reportData.json());
      setApiError(null);
    } catch {
      setApiError(`Cannot reach the operations API at ${API_BASE}. Is the backend running?`);
    } finally {
      if (!opts.silent) setLoading(false);
    }
  };

  // Background refresh so an in-flight remediation visibly advances through its
  // steps without the whole page dropping into the loading state.
  useEffect(() => {
    if (!token) return;
    const live = ["dashboard", "incidents", "remediation", "reports"].includes(view);
    const watching = view === "incidentDetail" && selectedIncidentId;
    if (!live && !watching) return;

    const timer = setInterval(() => {
      fetchAllData({ silent: true });
      if (watching && selectedIncidentId) refreshIncidentDetail(selectedIncidentId);
    }, 3000);
    return () => clearInterval(timer);
  }, [token, view, selectedIncidentId]);

  useEffect(() => {
    if (token) {
      const savedRole = localStorage.getItem("aoc_role") || "Helpdesk";
      setUser({ role: savedRole, email: "user@alpha.com" });
      fetchAllData();
    }
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem("aoc_token");
    localStorage.removeItem("aoc_role");
    setToken(null);
    router.push("/login");
  };

  const selectSite = async (siteId: string) => {
    setSelectedSiteId(siteId);
    try {
      const res = await fetch(`${API_BASE}/api/sites/${siteId}`, { headers: getHeaders() });
      const detail = await res.json();
      setSiteDetail(detail);
      setView("siteDetail");
    } catch (e) {
      console.error(e);
    }
  };

  // Silent variant used by the poll loop — updates the open incident in place
  // without resetting the view or flashing a spinner.
  const refreshIncidentDetail = async (incidentId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/incidents/${incidentId}`, { headers: getHeaders() });
      if (res.ok) setIncidentDetail(await res.json());
    } catch {
      /* the banner from fetchAllData already covers connectivity loss */
    }
  };

  const selectIncident = async (incidentId: string) => {
    setSelectedIncidentId(incidentId);
    try {
      const res = await fetch(`${API_BASE}/api/incidents/${incidentId}`, { headers: getHeaders() });
      if (!res.ok) {
        setApiError(await readError(res));
        return;
      }
      setIncidentDetail(await res.json());
      setView("incidentDetail");
    } catch {
      setApiError("Could not load that incident. Is the backend running?");
    }
  };

  const handleApproveIncident = async (incidentId: string) => {
    setBusy(`approve:${incidentId}`);
    try {
      const res = await fetch(`${API_BASE}/api/incidents/${incidentId}/approve`, {
        method: "POST",
        headers: getHeaders(),
      });
      if (!res.ok) {
        setApiError(await readError(res));
        return;
      }
      setApiError(null);
      setNotice("Remediation approved — execution started.");
      await fetchAllData({ silent: true });
      await refreshIncidentDetail(incidentId);
    } catch {
      setApiError("Approval failed — could not reach the backend.");
    } finally {
      setBusy(null);
    }
  };

  const handleEscalateIncident = async (incidentId: string) => {
    setBusy(`escalate:${incidentId}`);
    try {
      const res = await fetch(`${API_BASE}/api/incidents/${incidentId}/escalate`, {
        method: "POST",
        headers: getHeaders(),
      });
      if (!res.ok) {
        setApiError(await readError(res));
        return;
      }
      setApiError(null);
      setNotice("Incident escalated to the on-call engineer.");
      await fetchAllData({ silent: true });
      await refreshIncidentDetail(incidentId);
    } catch {
      setApiError("Escalation failed — could not reach the backend.");
    } finally {
      setBusy(null);
    }
  };

  const handleSimulate = async () => {
    const siteId = simSiteId || sites[0]?.id;
    if (!siteId) {
      setApiError("No sites available to simulate against.");
      return;
    }
    setBusy("simulate");
    try {
      const res = await fetch(
        `${API_BASE}/api/simulate/incident?site_id=${encodeURIComponent(siteId)}&incident_type=${encodeURIComponent(simType)}`,
        { method: "POST", headers: getHeaders() }
      );
      if (!res.ok) {
        setApiError(await readError(res));
        return;
      }
      const body = await res.json();
      setApiError(null);
      setSimOpen(false);
      setNotice(
        `Injected ${body.incident.severity} incident at ${body.incident.site_name} — now ${body.incident.status}.`
      );
      await fetchAllData({ silent: true });
      setView("incidents");
    } catch {
      setApiError("Simulation failed — could not reach the backend.");
    } finally {
      setBusy(null);
    }
  };

  // Auto-dismiss transient success messages; errors stay until resolved.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (loading || !token) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "var(--color-bg)" }}>
        <div style={{ color: accent }}>Loading...</div>
      </div>
    );
  }

  // Computed values
  const isAdmin = user?.role === "Admin";
  const isTech = !isAdmin;
  const awaitingCount = incidents.filter(i => i.status === "Awaiting Approval").length;
  const activeRunCount = incidents.filter(i => i.status === "Running" || i.status === "Verifying").length;
  const kpiSitesOnline = sites.filter(s => s.status === "Online").length;
  const kpiSitesDegraded = sites.filter(s => s.status === "Degraded").length;
  const kpiSitesOffline = sites.filter(s => s.status === "Offline").length;
  const kpiOpen = incidents.filter(i => i.status !== "Resolved").length;
  const kpiAwaiting = awaitingCount;
  const kpiResolved = incidents.filter(i => i.status === "Resolved").length;

  // Filtered data
  const allCustomers = Array.from(new Set(sites.map(s => s.customer_name).filter(Boolean)));
  const filteredSites = sites.filter(s => {
    if (siteCustomerFilter !== "all" && s.customer_name !== siteCustomerFilter) return false;
    if (siteStatusFilter !== "all" && s.status !== siteStatusFilter) return false;
    if (siteSearch && !s.name.toLowerCase().includes(siteSearch.toLowerCase())) return false;
    return true;
  });

  const filteredIncidents = incidents.filter(i => {
    if (incSeverityFilter !== "all" && i.severity !== incSeverityFilter) return false;
    if (incStatusFilter !== "all" && i.status !== incStatusFilter) return false;
    if (incSearch) {
      const q = incSearch.toLowerCase();
      const haystack = [i.root_cause, i.site_name, i.customer_name, i.device_name, i.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const topIncidents = incidents.filter(i => i.status !== "Resolved").slice(0, 6);

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", overflow: "hidden" }}>
      {/* SIDEBAR */}
      <div style={{
        width: "236px",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--color-divider)",
        padding: "var(--space-4)",
        gap: "var(--space-6)",
        overflowY: "auto"
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Grid3x3 style={{ width: "26px", height: "26px", color: accent, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: "15px", fontWeight: 600, lineHeight: 1.1 }}>UniFi Ops</div>
            <div style={{ fontSize: "10px", color: "var(--color-neutral-500)", letterSpacing: ".04em", textTransform: "uppercase" }}>Autonomous Ops Center</div>
          </div>
        </div>

        {/* Role selector */}
        <div className="seg" style={{ width: "100%", display: "flex" }}>
          <label className="seg-opt" style={{ flex: 1, justifyContent: "center", cursor: "pointer" }}>
            <input type="radio" name="role" checked={isAdmin} onChange={() => { localStorage.setItem("aoc_role", "Admin"); setUser({ ...user, role: "Admin" }); }} />
            Admin
          </label>
          <label className="seg-opt" style={{ flex: 1, justifyContent: "center", cursor: "pointer" }}>
            <input type="radio" name="role" checked={isTech} onChange={() => { localStorage.setItem("aoc_role", "Helpdesk"); setUser({ ...user, role: "Helpdesk" }); }} />
            Technician
          </label>
        </div>

        {/* Nav buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {[
            { id: "dashboard", label: "Dashboard", icon: Grid3x3 },
            { id: "sites", label: "Site Explorer", icon: MapPin },
            { id: "incidents", label: "Incident Center", icon: AlertTriangle, badge: awaitingCount },
            { id: "remediation", label: "Remediation Center", icon: Wrench, badge: activeRunCount },
            { id: "reports", label: "Reports", icon: BarChart3 },
          ].map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => { setView(id); setSelectedSiteId(null); setSelectedIncidentId(null); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 10px",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                fontSize: "13px",
                border: "none",
                width: "100%",
                fontFamily: "var(--font-body)",
                color: view === id ? accent : "var(--color-text)",
                background: view === id ? "var(--color-accent-900)" : "transparent",
                textAlign: "left",
              }}
            >
              <Icon style={{ width: "16px", height: "16px", color: "currentColor" }} />
              <span style={{ flex: 1 }}>{label}</span>
              {badge ? <span className="tag tag-accent" style={{ fontSize: "10px", padding: "1px 6px" }}>{badge}</span> : null}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div className="hr" style={{ margin: 0 }} />
          <div style={{ fontSize: "11px", color: "var(--color-neutral-500)" }}>Signed in as</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--color-accent-800)", color: "var(--color-accent-100)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 600 }}>
              {isAdmin ? "A" : "T"}
            </div>
            <div>
              <div style={{ fontSize: "13px" }}>{isAdmin ? "MSP Administrator" : "Helpdesk Technician"}</div>
              <div style={{ fontSize: "11px", color: "var(--color-neutral-500)" }}>BiznTech MSP</div>
            </div>
          </div>
          <button onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: "8px", background: "transparent", border: "none", color: "var(--color-text)", cursor: "pointer", fontSize: "13px", width: "100%", padding: "8px 0" }}>
            <LogOut style={{ width: "16px", height: "16px" }} />
            Logout
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3) var(--space-6)", borderBottom: "1px solid var(--color-divider)", flexShrink: 0 }}>
          <div style={{ fontSize: "18px", fontFamily: "var(--font-heading)" }}>
            {view === "dashboard" && "Global Operations Dashboard"}
            {view === "sites" && "Site Explorer"}
            {view === "siteDetail" && "Site Detail"}
            {view === "incidents" && "Incident Center"}
            {view === "incidentDetail" && "Incident Detail"}
            {view === "remediation" && "Remediation Center"}
            {view === "reports" && "Reports"}
          </div>
          <div style={{ fontSize: "13px", color: "var(--color-neutral-500)" }}>
            {view === "siteDetail" && selectedSiteId && `Site Explorer / ${siteDetail?.site?.name}`}
            {view === "incidentDetail" && selectedIncidentId && `Incident Center / ${incidentDetail?.incident?.category}`}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <button
              className="btn btn-outline"
              onClick={() => { setSimSiteId(sites[0]?.id || ""); setSimOpen(true); }}
              style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}
              title="Inject a synthetic fault to exercise the detect → diagnose → approve → remediate flow"
            >
              <Zap size={13} /> Simulate Incident
            </button>
            <div style={{ fontSize: "12px", color: "var(--color-neutral-500)" }}>
              {isAdmin ? "MSP Administrator" : "Helpdesk Technician"}
            </div>
          </div>
        </div>

        {/* Connectivity / action feedback */}
        {apiError && (
          <div style={{
            display: "flex", alignItems: "center", gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-6)",
            background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
            borderBottom: "1px solid var(--color-divider)",
            fontSize: "12px", flexShrink: 0,
          }}>
            <AlertCircle size={14} style={{ color: accent, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{apiError}</span>
            <button
              className="btn btn-ghost"
              style={{ fontSize: "11px" }}
              onClick={() => fetchAllData()}
              disabled={loading}
            >
              Retry
            </button>
            <button className="btn btn-ghost" style={{ fontSize: "11px" }} onClick={() => setApiError(null)}>
              <X size={12} />
            </button>
          </div>
        )}
        {notice && !apiError && (
          <div style={{
            display: "flex", alignItems: "center", gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-6)",
            borderBottom: "1px solid var(--color-divider)",
            fontSize: "12px", color: "var(--color-neutral-500)", flexShrink: 0,
          }}>
            <CheckCircle2 size={14} style={{ color: accent, flexShrink: 0 }} />
            <span>{notice}</span>
          </div>
        )}

        {/* Simulate Incident dialog */}
        {simOpen && (
          <div
            onClick={() => setSimOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 50,
              background: "rgba(0,0,0,0.55)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              className="card"
              style={{ width: "min(420px, 92vw)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
            >
              <div>
                <div style={{ fontSize: "15px", fontFamily: "var(--font-heading)" }}>Simulate Incident</div>
                <div style={{ fontSize: "12px", color: "var(--color-neutral-500)", marginTop: "4px" }}>
                  Injects a synthetic fault. The correlation and diagnostic agents run immediately, so the
                  incident lands in the approval queue.
                </div>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
                <span style={{ color: "var(--color-neutral-500)" }}>Site</span>
                <select className="input" value={simSiteId} onChange={e => setSimSiteId(e.target.value)}>
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>{s.customer_name} — {s.name}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
                <span style={{ color: "var(--color-neutral-500)" }}>Scenario</span>
                <select className="input" value={simType} onChange={e => setSimType(e.target.value)}>
                  <option value="poe_overload">PoE overload — AP drops (Critical, L2)</option>
                  <option value="gateway_outage">Gateway WAN outage (Critical, L4 · admin only)</option>
                  <option value="switch_flap">Switch port flap (Warning, L2)</option>
                  <option value="ap_rf_noise">AP RF interference (Warning, L3)</option>
                </select>
              </label>

              {simType === "gateway_outage" && !isAdmin && (
                <div style={{ fontSize: "11px", color: "var(--color-neutral-500)", display: "flex", gap: "6px" }}>
                  <AlertCircle size={13} style={{ flexShrink: 0, marginTop: "1px" }} />
                  <span>
                    This creates a Level&nbsp;4 restricted incident. As a technician you will be able to see it,
                    but not approve it — switch to Admin to run the remediation.
                  </span>
                </div>
              )}

              <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" onClick={() => setSimOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSimulate} disabled={busy === "simulate"}>
                  {busy === "simulate" ? "Injecting…" : "Inject Incident"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Views */}
        <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-6)" }}>
          {/* DASHBOARD */}
          {view === "dashboard" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "var(--space-3)" }}>
                {[
                  { kicker: "Sites", title: kpiSitesOnline, meta: `${kpiSitesDegraded} degraded · ${kpiSitesOffline} offline` },
                  { kicker: "Open Incidents", title: kpiOpen, meta: `${kpiAwaiting} awaiting approval` },
                  { kicker: "Auto-Remediated", title: kpiResolved, meta: "verified outcomes" },
                  { kicker: "Mean Time to Detect", title: "3m", meta: "across monitored sites" },
                  { kicker: "Mean Time to Resolve", title: "21m", meta: "approved remediations" },
                  { kicker: "AI Remediation Success", title: "91%", meta: "last 30 days" },
                ].map((card, idx) => (
                  <div key={idx} className="card elev-sm" style={{ padding: "var(--space-3)" }}>
                    <div style={{ fontSize: "10px", letterSpacing: ".1em", textTransform: "uppercase", color: accent }}>
                      {card.kicker}
                    </div>
                    <div style={{ fontSize: "26px", fontWeight: 600, marginTop: "var(--space-2)" }}>
                      {card.title}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--color-neutral-500)", marginTop: "var(--space-2)" }}>
                      {card.meta}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "var(--space-4)", alignItems: "start" }}>
                <div className="card elev-sm">
                  <div style={{ fontSize: "15px", fontWeight: 500 }}>Active Incidents</div>
                  <div className="hr" style={{ margin: "var(--space-2) 0" }} />
                  {topIncidents.map(inc => (
                    <div key={inc.id} onClick={() => selectIncident(inc.id)} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-2) 0", cursor: "pointer", borderBottom: "1px solid var(--color-divider)" }}>
                      <span className={sevTagClass(inc.severity)} style={{ fontSize: "10px" }}>
                        {inc.severity}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {inc.root_cause}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-neutral-500)" }}>
                          {inc.site_name} · {inc.category}
                          {inc.device_name ? ` · ${inc.device_name}` : ""} · {inc.age_label}
                        </div>
                      </div>
                      <span className={statusTagClass(inc.status)} style={{ fontSize: "10px" }}>
                        {inc.status}
                      </span>
                    </div>
                  ))}
                  {topIncidents.length === 0 && (
                    <div style={{ fontSize: "13px", color: "var(--color-neutral-500)", padding: "var(--space-4) 0", textAlign: "center" }}>
                      No active incidents. Use <strong>Simulate Incident</strong> to inject one.
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                  <div className="card elev-sm">
                    <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "var(--space-2)" }}>Site Health</div>
                    <div className="hr" style={{ margin: "var(--space-2) 0" }} />
                    {[
                      { label: "Online", count: kpiSitesOnline, total: sites.length },
                      { label: "Degraded", count: kpiSitesDegraded, total: sites.length },
                      { label: "Offline", count: kpiSitesOffline, total: sites.length },
                    ].map((stat, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "6px" }}>
                        <div style={{ width: "80px", fontSize: "12px", color: "var(--color-neutral-400)" }}>
                          {stat.label}
                        </div>
                        <div style={{ flex: 1, height: "6px", borderRadius: "3px", background: "var(--color-neutral-800)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${stat.total ? (stat.count / stat.total) * 100 : 0}%`, background: accent }} />
                        </div>
                        <div style={{ width: "34px", textAlign: "right", fontSize: "11px", color: "var(--color-neutral-500)" }}>
                          {stat.count}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SITE EXPLORER */}
          {view === "sites" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-4)", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  className="input"
                  placeholder="Search sites…"
                  value={siteSearch}
                  onChange={(e) => setSiteSearch(e.target.value)}
                  style={{ maxWidth: "220px" }}
                />
                <select
                  className="input"
                  value={siteCustomerFilter}
                  onChange={(e) => setSiteCustomerFilter(e.target.value)}
                  style={{ maxWidth: "220px" }}
                >
                  <option value="all">All customers</option>
                  {allCustomers.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="seg">
                  <label className="seg-opt" style={{ cursor: "pointer" }}>
                    <input type="radio" name="status" checked={siteStatusFilter === "all"} onChange={() => setSiteStatusFilter("all")} />
                    All
                  </label>
                  <label className="seg-opt" style={{ cursor: "pointer" }}>
                    <input type="radio" name="status" checked={siteStatusFilter === "Online"} onChange={() => setSiteStatusFilter("Online")} />
                    Online
                  </label>
                  <label className="seg-opt" style={{ cursor: "pointer" }}>
                    <input type="radio" name="status" checked={siteStatusFilter === "Degraded"} onChange={() => setSiteStatusFilter("Degraded")} />
                    Degraded
                  </label>
                  <label className="seg-opt" style={{ cursor: "pointer" }}>
                    <input type="radio" name="status" checked={siteStatusFilter === "Offline"} onChange={() => setSiteStatusFilter("Offline")} />
                    Offline
                  </label>
                </div>
                <div style={{ marginLeft: "auto", fontSize: "12px", color: "var(--color-neutral-500)" }}>
                  {filteredSites.length} sites
                </div>
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Devices</th>
                    <th>Open</th>
                    <th>WAN Uptime</th>
                    <th>Last Sync</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSites.map(s => (
                    <tr key={s.id} onClick={() => selectSite(s.id)} style={{ cursor: "pointer" }}>
                      <td>{s.name}</td>
                      <td style={{ color: "var(--color-neutral-400)" }}>{s.customer_name}</td>
                      <td>
                        <span className={siteStatusTagClass(s.status)}>
                          {s.status}
                        </span>
                      </td>
                      <td style={{ color: "var(--color-neutral-400)" }}>
                        {s.devices_online}/{s.devices_total}
                      </td>
                      <td style={{ color: s.open_incident_count > 0 ? accent : "var(--color-neutral-500)" }}>
                        {s.open_incident_count || "—"}
                      </td>
                      <td>{s.wan_uptime_pct}%</td>
                      <td style={{ color: "var(--color-neutral-500)" }}>
                        {s.last_sync ? new Date(s.last_sync).toLocaleString().split(",")[0] : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* SITE DETAIL */}
          {view === "siteDetail" && siteDetail && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <button
                onClick={() => setView("sites")}
                className="btn btn-ghost"
                style={{ marginBottom: "var(--space-3)" }}
              >
                <ChevronLeft style={{ width: "16px", height: "16px" }} />
                Back to Site Explorer
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "6px", flexWrap: "wrap" }}>
                <div style={{ fontSize: "22px", fontWeight: 600, fontFamily: "var(--font-heading)" }}>
                  {siteDetail.site?.name}
                </div>
                <span className={siteStatusTagClass(siteDetail.site?.status)} style={{ fontSize: "11px" }}>
                  {siteDetail.site?.status}
                </span>
              </div>

              <div style={{ color: "var(--color-neutral-500)", fontSize: "13px", marginBottom: "var(--space-4)" }}>
                {siteDetail.site?.customer_name}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
                {[
                  { kicker: "WAN Latency", value: `${siteDetail.site?.wan_latency_ms || 0}ms` },
                  { kicker: "Packet Loss", value: `${(siteDetail.site?.wan_loss_pct || 0).toFixed(1)}%` },
                  { kicker: "WAN Uptime", value: `${siteDetail.site?.wan_uptime_pct || 100}%` },
                  { kicker: "Devices Online", value: `${siteDetail.devices?.filter((d: any) => d.status === "Online").length}/${siteDetail.devices?.length || 0}` },
                ].map((card, idx) => (
                  <div key={idx} className="card elev-sm" style={{ padding: "var(--space-3)" }}>
                    <div style={{ fontSize: "10px", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-neutral-400)" }}>
                      {card.kicker}
                    </div>
                    <div style={{ fontSize: "22px", fontWeight: 600, marginTop: "var(--space-2)" }}>
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>

              {siteDetail.devices?.length > 0 && (
                <div className="card elev-sm" style={{ marginBottom: "var(--space-4)" }}>
                  <div style={{ fontSize: "15px", fontWeight: 500 }}>Devices</div>
                  <div className="hr" style={{ margin: "var(--space-2) 0" }} />
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Device</th>
                        <th>Type</th>
                        <th>Model</th>
                        <th>Status</th>
                        <th>Uptime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siteDetail.devices.map((d: any) => (
                        <tr key={d.id}>
                          <td>{d.name}</td>
                          <td style={{ textTransform: "capitalize", color: "var(--color-neutral-400)" }}>
                            {d.type}
                          </td>
                          <td>{d.model}</td>
                          <td>
                            <span className={d.status === "Online" ? "tag tag-accent" : "tag tag-neutral"}>
                              {d.status}
                            </span>
                          </td>
                          <td style={{ color: "var(--color-neutral-500)" }}>
                            {d.uptime_days}d
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* INCIDENT CENTER */}
          {view === "incidents" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-4)", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  className="input"
                  placeholder="Search incidents…"
                  value={incSearch}
                  onChange={(e) => setIncSearch(e.target.value)}
                  style={{ maxWidth: "220px" }}
                />
                <div className="seg">
                  <label className="seg-opt" style={{ cursor: "pointer" }}>
                    <input type="radio" name="sev" checked={incSeverityFilter === "all"} onChange={() => setIncSeverityFilter("all")} />
                    All
                  </label>
                  <label className="seg-opt" style={{ cursor: "pointer" }}>
                    <input type="radio" name="sev" checked={incSeverityFilter === "Critical"} onChange={() => setIncSeverityFilter("Critical")} />
                    Critical
                  </label>
                  <label className="seg-opt" style={{ cursor: "pointer" }}>
                    <input type="radio" name="sev" checked={incSeverityFilter === "Warning"} onChange={() => setIncSeverityFilter("Warning")} />
                    Warning
                  </label>
                  <label className="seg-opt" style={{ cursor: "pointer" }}>
                    <input type="radio" name="sev" checked={incSeverityFilter === "Info"} onChange={() => setIncSeverityFilter("Info")} />
                    Info
                  </label>
                </div>
                <select
                  className="input"
                  value={incStatusFilter}
                  onChange={(e) => setIncStatusFilter(e.target.value)}
                  style={{ maxWidth: "200px" }}
                >
                  <option value="all">All statuses</option>
                  <option value="Open">Open</option>
                  <option value="Awaiting Approval">Awaiting Approval</option>
                  <option value="Running">Running</option>
                  <option value="Verifying">Verifying</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Escalated">Escalated</option>
                </select>
                <div style={{ marginLeft: "auto", fontSize: "12px", color: "var(--color-neutral-500)" }}>
                  {filteredIncidents.length} incidents
                </div>
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Incident</th>
                    <th>Site</th>
                    <th>Device</th>
                    <th>Safety</th>
                    <th>Confidence</th>
                    <th>Age</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIncidents.map(inc => (
                    <tr key={inc.id} onClick={() => selectIncident(inc.id)} style={{ cursor: "pointer" }}>
                      <td>
                        <span className={sevTagClass(inc.severity)}>
                          {inc.severity}
                        </span>
                      </td>
                      <td>
                        <div>{inc.root_cause}</div>
                        <div style={{ fontSize: "11px", color: "var(--color-neutral-500)" }}>{inc.category}</div>
                      </td>
                      <td style={{ color: "var(--color-neutral-400)" }}>
                        <div>{inc.site_name}</div>
                        <div style={{ fontSize: "11px", color: "var(--color-neutral-500)" }}>{inc.customer_name}</div>
                      </td>
                      <td style={{ color: "var(--color-neutral-400)" }}>
                        {inc.device_name ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                            <RouterIcon size={12} style={{ opacity: 0.6 }} />
                            {inc.device_name}
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        <span
                          className={inc.remediation_safety_level >= 4 ? "tag tag-outline" : "tag tag-neutral"}
                          title={inc.safety_desc}
                        >
                          {inc.safety_short}
                        </span>
                      </td>
                      <td>{inc.confidence_pct}%</td>
                      <td style={{ color: "var(--color-neutral-500)" }}>{inc.age_label}</td>
                      <td>
                        <span className={statusTagClass(inc.status)}>
                          {inc.status}
                        </span>
                        {(inc.status === "Running" || inc.status === "Verifying") && inc.plan_total > 0 && (
                          <div style={{ fontSize: "11px", color: "var(--color-neutral-500)", marginTop: "3px" }}>
                            step {Math.min(inc.run_step_index, inc.plan_total)}/{inc.plan_total}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* INCIDENT DETAIL */}
          {view === "incidentDetail" && incidentDetail?.incident && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <button
                onClick={() => setView("incidents")}
                className="btn btn-ghost"
                style={{ marginBottom: "var(--space-3)" }}
              >
                <ChevronLeft style={{ width: "16px", height: "16px" }} />
                Back to Incident Center
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "6px" }}>
                <span className={sevTagClass(incidentDetail.incident.severity)}>
                  {incidentDetail.incident.severity}
                </span>
                <div style={{ fontSize: "20px", fontWeight: 600, fontFamily: "var(--font-heading)" }}>
                  {incidentDetail.incident.root_cause}
                </div>
                <span className={statusTagClass(incidentDetail.incident.status)}>
                  {incidentDetail.incident.status}
                </span>
              </div>

              <div style={{ color: "var(--color-neutral-500)", fontSize: "13px", marginBottom: "var(--space-4)" }}>
                {incidentDetail.site?.name} · {incidentDetail.incident.category} · detected{" "}
                {new Date(incidentDetail.incident.first_detected).toLocaleString()}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: "var(--space-4)", alignItems: "start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", minWidth: 0 }}>
                  <div className="card elev-sm">
                    <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: accent }}>
                      Evidence
                    </div>
                    {incidentDetail.incident.evidence?.events?.map((e: string, idx: number) => (
                      <div key={idx} style={{ fontSize: "13px", padding: "3px 0", display: "flex", gap: "8px" }}>
                        <span style={{ color: accent }}>–</span>
                        <span>{e}</span>
                      </div>
                    ))}
                  </div>

                  <div className="card elev-sm">
                    <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: accent }}>
                      AI Diagnosis
                    </div>
                    <div style={{ fontSize: "14px", marginBottom: "var(--space-2)" }}>
                      {incidentDetail.incident.root_cause}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--color-neutral-500)" }}>
                      <span>Confidence</span>
                      <div style={{ flex: 1, maxWidth: "180px", height: "6px", borderRadius: "3px", background: "var(--color-neutral-800)", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${incidentDetail.incident.ai_confidence * 100}%`,
                            background: accent,
                          }}
                        />
                      </div>
                      <span>{Math.round(incidentDetail.incident.ai_confidence * 100)}%</span>
                    </div>
                  </div>

                  {incidentDetail.incident.remediation_plan?.length > 0 && (
                    <div className="card elev-sm">
                      <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: accent }}>
                        Recommended Remediation Plan
                      </div>
                      {incidentDetail.incident.remediation_plan.map((step: string, idx: number) => (
                        <div key={idx} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "6px 0", borderBottom: idx < incidentDetail.incident.remediation_plan.length - 1 ? "1px solid var(--color-divider)" : "none" }}>
                          <div
                            style={{
                              width: "20px",
                              height: "20px",
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "10px",
                              flexShrink: 0,
                              background: "transparent",
                              color: "var(--color-neutral-500)",
                              border: "1px solid var(--color-divider)",
                            }}
                          >
                            {idx + 1}
                          </div>
                          <div style={{ fontSize: "13px", flex: 1 }}>{step}</div>
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
                        <span className="tag tag-outline" style={{ fontSize: "11px" }} title={incidentDetail.incident.safety_desc}>
                          {incidentDetail.incident.safety_label}
                        </span>
                        <span className="tag tag-neutral" style={{ fontSize: "11px" }}>
                          {incidentDetail.incident.plan_total} steps
                        </span>
                      </div>
                    </div>
                  )}

                  {incidentDetail.incident.status === "Awaiting Approval" && (
                    <div className="card elev-sm">
                      <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: accent }}>
                        Remediation Run
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--color-neutral-400)", marginBottom: "var(--space-3)" }}>
                        {incidentDetail.incident.safety_desc}
                      </div>
                      {incidentDetail.incident.remediation_safety_level >= 4 && !isAdmin ? (
                        <>
                          <div style={{ display: "flex", gap: "6px", fontSize: "13px", color: "var(--color-neutral-500)", marginBottom: "var(--space-3)" }}>
                            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: "1px", color: accent }} />
                            <span>
                              This is a Level&nbsp;4 restricted remediation and requires MSP Administrator
                              approval. Escalate it, or switch roles if you hold an administrator account.
                            </span>
                          </div>
                          <button
                            onClick={() => handleEscalateIncident(incidentDetail.incident.id)}
                            className="btn btn-secondary"
                            style={{ fontSize: "13px" }}
                            disabled={busy?.startsWith("escalate")}
                          >
                            {busy?.startsWith("escalate") ? "Escalating…" : "Escalate"}
                          </button>
                        </>
                      ) : (
                        <div style={{ display: "flex", gap: "var(--space-2)" }}>
                          <button
                            onClick={() => handleApproveIncident(incidentDetail.incident.id)}
                            className="btn btn-primary"
                            style={{ fontSize: "13px" }}
                            disabled={busy?.startsWith("approve")}
                          >
                            <Check style={{ width: "16px", height: "16px" }} />
                            {busy?.startsWith("approve") ? "Starting…" : "Approve & Run"}
                          </button>
                          <button
                            onClick={() => handleEscalateIncident(incidentDetail.incident.id)}
                            className="btn btn-secondary"
                            style={{ fontSize: "13px" }}
                            disabled={busy?.startsWith("escalate")}
                          >
                            {busy?.startsWith("escalate") ? "Escalating…" : "Escalate"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {incidentDetail.incident.status === "Running" && (
                    <div className="card elev-sm">
                      <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: accent }}>
                        Execution Progress
                      </div>
                      {incidentDetail.incident.remediation_plan?.map((step: string, idx: number) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "5px 0", fontSize: "13px" }}>
                          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: accent, flexShrink: 0 }} />
                          <div style={{ color: "var(--color-text)" }}>{step}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(incidentDetail.incident.status === "Verifying" || incidentDetail.incident.status === "Resolved" || incidentDetail.incident.status === "Escalated") && (
                    <div className="card elev-sm">
                      <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: accent }}>
                        Verification
                      </div>
                      <div className="hr" style={{ margin: "var(--space-3) 0" }} />
                      {incidentDetail.incident.verification_steps?.map((v: string, idx: number) => (
                        <div key={idx} style={{ fontSize: "13px", padding: "3px 0", display: "flex", gap: "8px" }}>
                          <span style={{ color: accent }}>✓</span>
                          <span>{v}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {incidentDetail.incident.status === "Resolved" && (
                    <div className="card elev-sm">
                      <div style={{ fontSize: "13px" }}>
                        Incident resolved — all verification checks passed.
                      </div>
                    </div>
                  )}

                  {incidentDetail.incident.status === "Escalated" && (
                    <div className="card elev-sm">
                      <div style={{ fontSize: "13px" }}>
                        Escalated to on-call engineer — awaiting manual intervention.
                      </div>
                    </div>
                  )}

                  {incidentDetail.audit_logs?.length > 0 && (
                    <div className="card elev-sm">
                      <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: accent }}>
                        Audit Trail
                      </div>
                      {incidentDetail.audit_logs.map((log: any, idx: number) => (
                        <div key={idx} style={{ display: "flex", gap: "10px", fontSize: "12px", padding: "3px 0", color: "var(--color-neutral-500)" }}>
                          <div style={{ width: "70px", flexShrink: 0 }}>
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </div>
                          <div style={{ width: "140px", flexShrink: 0, color: "var(--color-neutral-300)" }}>
                            {log.user_or_agent}
                          </div>
                          <div>{log.action}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card elev-sm" style={{ padding: "var(--space-3)" }}>
                  <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: accent }}>
                    Details
                  </div>
                  <div style={{ fontSize: "13px", display: "flex", flexDirection: "column", gap: "6px", marginTop: "var(--space-3)" }}>
                    <div>
                      <span style={{ color: "var(--color-neutral-500)" }}>Category</span> — {incidentDetail.incident.category}
                    </div>
                    <div>
                      <span style={{ color: "var(--color-neutral-500)" }}>Customer</span> — {incidentDetail.incident.customer_name}
                    </div>
                    <div>
                      <span style={{ color: "var(--color-neutral-500)" }}>Site</span> — {incidentDetail.incident.site_name}
                    </div>
                    <div>
                      <span style={{ color: "var(--color-neutral-500)" }}>Detected</span> — {incidentDetail.incident.age_label} ago
                    </div>
                    <div title={incidentDetail.incident.safety_desc}>
                      <span style={{ color: "var(--color-neutral-500)" }}>Safety</span> — {incidentDetail.incident.safety_label}
                    </div>
                  </div>
                </div>

                {/* Affected device — the object the remediation actually acts on */}
                {incidentDetail.device && (
                  <div className="card elev-sm" style={{ padding: "var(--space-3)" }}>
                    <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: accent }}>
                      Affected Device
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "var(--space-3)" }}>
                      <RouterIcon size={15} style={{ color: "var(--color-neutral-400)" }} />
                      <div>
                        <div style={{ fontSize: "13px" }}>{incidentDetail.device.name}</div>
                        <div style={{ fontSize: "11px", color: "var(--color-neutral-500)" }}>
                          {incidentDetail.device.model}
                        </div>
                      </div>
                      <span className={siteStatusTagClass(incidentDetail.device.status)} style={{ marginLeft: "auto", fontSize: "10px" }}>
                        {incidentDetail.device.status}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "5px", marginTop: "var(--space-3)" }}>
                      <div>
                        <span style={{ color: "var(--color-neutral-500)" }}>IP</span> — {incidentDetail.device.ip_address || "—"}
                      </div>
                      <div>
                        <span style={{ color: "var(--color-neutral-500)" }}>MAC</span> — {incidentDetail.device.mac}
                      </div>
                      <div>
                        <span style={{ color: "var(--color-neutral-500)" }}>Firmware</span> — {incidentDetail.device.firmware || "—"}
                      </div>
                      {incidentDetail.device.switch_port != null && (
                        <div>
                          <span style={{ color: "var(--color-neutral-500)" }}>Switch port</span> — {incidentDetail.device.switch_port}
                          {incidentDetail.device.poe_draw ? ` · ${incidentDetail.device.poe_draw}W PoE` : ""}
                        </div>
                      )}
                      <div>
                        <span style={{ color: "var(--color-neutral-500)" }}>Uptime</span> — {incidentDetail.device.uptime_days}d
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost"
                      style={{ marginTop: "var(--space-3)", fontSize: "11px", width: "100%" }}
                      onClick={() => selectSite(incidentDetail.incident.site_id)}
                    >
                      View site
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* REMEDIATION CENTER */}
          {view === "remediation" && (
            <div style={{ display: "flex", gap: "var(--space-3)", overflowX: "auto", paddingBottom: "var(--space-2)" }}>
              {["Open", "Awaiting Approval", "Running", "Verifying", "Resolved", "Escalated"].map(status => {
                const cols = incidents.filter(i => i.status === status);
                return (
                  <div key={status} style={{ flexShrink: 0, width: "230px", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    <div style={{ fontSize: "12px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-neutral-500)", display: "flex", justifyContent: "space-between" }}>
                      <span>{status}</span>
                      <span>{cols.length}</span>
                    </div>
                    {cols.map(inc => (
                      <div
                        key={inc.id}
                        onClick={() => selectIncident(inc.id)}
                        className="card elev-sm"
                        style={{ cursor: "pointer", padding: "var(--space-2)" }}
                      >
                        <div style={{ fontSize: "12px", color: "var(--color-neutral-500)", marginBottom: "2px" }}>
                          {inc.site_name}
                        </div>
                        <div style={{ fontSize: "13px" }}>{inc.root_cause}</div>
                        {inc.device_name && (
                          <div style={{ fontSize: "11px", color: "var(--color-neutral-500)", marginTop: "3px", display: "flex", alignItems: "center", gap: "4px" }}>
                            <RouterIcon size={11} /> {inc.device_name}
                          </div>
                        )}
                        {(inc.status === "Running" || inc.status === "Verifying") && inc.plan_total > 0 && (
                          <div style={{ marginTop: "6px" }}>
                            <div style={{ height: "3px", background: "var(--color-divider)", borderRadius: "2px", overflow: "hidden" }}>
                              <div style={{
                                height: "100%",
                                width: `${Math.round((Math.min(inc.run_step_index, inc.plan_total) / inc.plan_total) * 100)}%`,
                                background: accent,
                                transition: "width .4s ease",
                              }} />
                            </div>
                            <div style={{ fontSize: "10px", color: "var(--color-neutral-500)", marginTop: "3px" }}>
                              step {Math.min(inc.run_step_index, inc.plan_total)}/{inc.plan_total}
                            </div>
                          </div>
                        )}
                        <div style={{ marginTop: "6px" }}>
                          <span className={sevTagClass(inc.severity)} style={{ fontSize: "10px" }}>
                            {inc.severity}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* REPORTS */}
          {view === "reports" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-3)" }}>
                {[
                  { title: "Managed Sites", value: sites.length, meta: `${kpiSitesOnline} online` },
                  { title: "Total Devices", value: data?.devices?.total || 0, meta: `${data?.devices?.online || 0} online` },
                  { title: "Incidents Resolved", value: kpiResolved, meta: "all-time" },
                  {
                    title: "Avg Time to Resolve",
                    value: reports?.avg_resolution_minutes != null ? `${reports.avg_resolution_minutes}m` : "—",
                    meta: "resolved incidents",
                  },
                ].map((card, idx) => (
                  <div key={idx} className="card elev-sm" style={{ padding: "var(--space-3)", textAlign: "center" }}>
                    <div style={{ fontSize: "11px", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-neutral-500)" }}>
                      {card.title}
                    </div>
                    <div style={{ fontSize: "32px", fontWeight: 600, marginTop: "var(--space-2)" }}>
                      {card.value}
                    </div>
                    <div style={{ fontSize: "10px", marginTop: "var(--space-2)", color: "var(--color-neutral-400)" }}>
                      {card.meta}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "var(--space-4)" }}>
                {/* Site Uptime — status-banded bars */}
                <div className="card elev-sm" style={{ padding: "var(--space-4)" }}>
                  <div style={{ fontSize: "15px", fontWeight: 500 }}>Site Uptime</div>
                  <div style={{ fontSize: "12px", color: "var(--color-neutral-500)", marginBottom: "var(--space-2)" }}>
                    30-day WAN uptime by site
                  </div>
                  {!reports?.site_uptime?.length ? (
                    <div style={{ fontSize: "12px", color: "var(--color-neutral-500)", padding: "var(--space-4) 0", textAlign: "center" }}>
                      No sites yet.
                    </div>
                  ) : (
                    <>
                      {reports.site_uptime.map((row: any) => {
                        // Bars are scaled within the 80–100% band, not 0–100 —
                        // uptime rarely drops below 80, so a 0-based scale would
                        // make every bar look nearly full and hide the differences.
                        const fillPct = Math.max(0, Math.min(100, ((row.wan_uptime_pct - 80) / 20) * 100));
                        const color = statusColor[row.band as keyof typeof statusColor];
                        return (
                          <div key={row.site_id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "8px" }}>
                            <div style={{ width: "100px", fontSize: "12px", color: "var(--color-neutral-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {row.name}
                            </div>
                            <div style={{ flex: 1, height: "8px", borderRadius: "4px", background: "var(--color-neutral-800)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${fillPct}%`, background: color, borderRadius: "4px" }} />
                            </div>
                            <div style={{ width: "44px", textAlign: "right", fontSize: "11px", color: "var(--color-neutral-400)" }}>
                              {row.wan_uptime_pct}%
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-3)", fontSize: "11px", color: "var(--color-neutral-500)" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: statusColor.good, display: "inline-block" }} /> ≥ 99%
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: statusColor.warning, display: "inline-block" }} /> 95–99%
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: statusColor.critical, display: "inline-block" }} /> &lt; 95%
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Incidents by Category — single-series, one color, axis label carries identity */}
                <div className="card elev-sm" style={{ padding: "var(--space-4)" }}>
                  <div style={{ fontSize: "15px", fontWeight: 500 }}>Common Problems</div>
                  <div style={{ fontSize: "12px", color: "var(--color-neutral-500)", marginBottom: "var(--space-2)" }}>
                    Incidents by category, all-time
                  </div>
                  {!reports?.category_breakdown?.length ? (
                    <div style={{ fontSize: "12px", color: "var(--color-neutral-500)", padding: "var(--space-4) 0", textAlign: "center" }}>
                      No incidents recorded yet. Use <strong>Simulate Incident</strong> to generate data.
                    </div>
                  ) : (
                    (() => {
                      const maxCount = Math.max(...reports.category_breakdown.map((r: any) => r.count));
                      return reports.category_breakdown.map((row: any) => (
                        <div key={row.category} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "8px" }}>
                          <div style={{ width: "120px", fontSize: "12px", color: "var(--color-neutral-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.category}
                          </div>
                          <div style={{ flex: 1, height: "8px", borderRadius: "4px", background: "var(--color-neutral-800)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${(row.count / maxCount) * 100}%`, background: accent, borderRadius: "4px" }} />
                          </div>
                          <div style={{ width: "24px", textAlign: "right", fontSize: "11px", color: "var(--color-neutral-400)" }}>
                            {row.count}
                          </div>
                        </div>
                      ));
                    })()
                  )}
                </div>

                {/* Remediation Effectiveness — status composition */}
                <div className="card elev-sm" style={{ padding: "var(--space-4)" }}>
                  <div style={{ fontSize: "15px", fontWeight: 500 }}>Remediation Effectiveness</div>
                  <div style={{ fontSize: "12px", color: "var(--color-neutral-500)", marginBottom: "var(--space-3)" }}>
                    Outcome of every incident raised, all-time
                  </div>
                  {!reports?.outcome_breakdown?.total ? (
                    <div style={{ fontSize: "12px", color: "var(--color-neutral-500)", padding: "var(--space-4) 0", textAlign: "center" }}>
                      No incidents recorded yet.
                    </div>
                  ) : (
                    <>
                      {[
                        { label: "Resolved", count: reports.outcome_breakdown.resolved, color: statusColor.good },
                        { label: "In progress", count: reports.outcome_breakdown.open, color: statusColor.neutral },
                        { label: "Escalated", count: reports.outcome_breakdown.escalated, color: statusColor.critical },
                      ].map((stat, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "8px" }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: stat.color, display: "inline-block", flexShrink: 0 }} />
                          <div style={{ width: "84px", fontSize: "12px", color: "var(--color-neutral-400)" }}>
                            {stat.label}
                          </div>
                          <div style={{ flex: 1, height: "6px", borderRadius: "3px", background: "var(--color-neutral-800)", overflow: "hidden" }}>
                            <div style={{
                              height: "100%",
                              width: `${reports.outcome_breakdown.total ? (stat.count / reports.outcome_breakdown.total) * 100 : 0}%`,
                              background: stat.color,
                            }} />
                          </div>
                          <div style={{ width: "28px", textAlign: "right", fontSize: "11px", color: "var(--color-neutral-500)" }}>
                            {stat.count}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* Incident Volume — single-series trend */}
                <div className="card elev-sm" style={{ padding: "var(--space-4)" }}>
                  <div style={{ fontSize: "15px", fontWeight: 500 }}>Incident Volume</div>
                  <div style={{ fontSize: "12px", color: "var(--color-neutral-500)", marginBottom: "var(--space-2)" }}>
                    Detected incidents, last 14 days
                  </div>
                  {!reports?.volume_trend?.length ? (
                    <div style={{ fontSize: "12px", color: "var(--color-neutral-500)", padding: "var(--space-4) 0", textAlign: "center" }}>
                      No data yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={reports.volume_trend} margin={{ top: 8, right: 16, left: -16, bottom: 4 }}>
                        <CartesianGrid vertical={false} stroke="var(--color-divider)" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: "var(--color-neutral-500)" }}
                          axisLine={false}
                          tickLine={false}
                          interval={1}
                        />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-neutral-500)" }} axisLine={false} tickLine={false} width={28} />
                        <Tooltip
                          cursor={{ stroke: "var(--color-divider)" }}
                          contentStyle={chartTooltipStyle}
                          formatter={(v: any) => [v, "Incidents"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke={accent}
                          strokeWidth={2}
                          dot={{ r: 2.5, fill: accent, strokeWidth: 0 }}
                          activeDot={{ r: 4, fill: accent, stroke: "var(--color-surface)", strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
