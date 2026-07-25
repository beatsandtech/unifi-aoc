// Sample data generator for the UniFi Autonomous Operations Center prototype.
// Deterministic (seeded) so the dataset is stable across reloads.

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (min, max) => Math.floor(min + rand() * (max - min + 1));

const CUSTOMERS = [
  "Riverton Family Dental", "Bellwether Logistics", "Crestline Behavioral Health",
  "Oakhurst Credit Union", "Summit Ridge Manufacturing", "Palmetto Urgent Care",
  "Vantage Legal Group", "Northfield School District",
];

const SITE_NAME_POOL = [
  "Main Office", "Downtown Branch", "Warehouse", "Clinic A", "Clinic B", "Distribution Center",
  "North Campus", "South Campus", "Retail Floor", "Admin Building", "Annex", "Remote Office",
];

const AP_MODELS = ["U6-Pro", "U6-LR", "U7-Pro", "U6-Mesh", "UAP-AC-Lite"];
const SWITCH_MODELS = ["USW-24-PoE", "USW-48-PoE", "USW-Pro-24", "USW-Lite-16-PoE"];
const GW_MODELS = ["UDM-Pro", "UDM-SE", "UXG-Pro", "UDM"];

function genDevices(siteSeededRand, siteId) {
  const devices = [];
  const gwModel = pick(GW_MODELS);
  devices.push({
    id: siteId + "-gw1", type: "gateway", name: "Gateway", model: gwModel,
    status: rand() > 0.92 ? "offline" : rand() > 0.85 ? "degraded" : "online",
    firmware: "4." + int(0, 2) + "." + int(0, 30), uptimeDays: int(1, 210),
  });
  devices.push({
    id: siteId + "-console", type: "console", name: "Controller", model: "Console",
    status: rand() > 0.95 ? "degraded" : "online",
    firmware: "4." + int(0, 2) + "." + int(0, 20), uptimeDays: int(1, 300),
  });
  const switchCount = int(1, 3);
  for (let i = 0; i < switchCount; i++) {
    devices.push({
      id: siteId + "-sw" + i, type: "switch", name: "Switch " + (i + 1), model: pick(SWITCH_MODELS),
      status: rand() > 0.93 ? "offline" : rand() > 0.86 ? "degraded" : "online",
      firmware: "7." + int(0, 2) + "." + int(0, 40), uptimeDays: int(1, 300), poeDrawW: int(40, 380), poeBudgetW: 400,
    });
  }
  const apCount = int(3, 12);
  for (let i = 0; i < apCount; i++) {
    devices.push({
      id: siteId + "-ap" + i, type: "ap", name: "AP " + (i + 1), model: pick(AP_MODELS),
      status: rand() > 0.9 ? "offline" : rand() > 0.82 ? "degraded" : "online",
      firmware: "7." + int(0, 2) + "." + int(0, 40), uptimeDays: int(1, 300),
      clients: int(0, 45), channel: pick([1, 6, 11, 36, 40, 44, 149]), txPower: pick(["low", "medium", "high"]),
    });
  }
  return devices;
}

function buildSites() {
  const sites = [];
  let siteCounter = 1;
  CUSTOMERS.forEach((customer, ci) => {
    const siteCount = int(1, 4);
    const shuffled = SITE_NAME_POOL.slice().sort(() => rand() - 0.5);
    for (let i = 0; i < siteCount; i++) {
      const name = shuffled[i];
      const id = "site-" + siteCounter++;
      const devices = genDevices(rand, id);
      const online = devices.filter((d) => d.status === "online").length;
      const degraded = devices.filter((d) => d.status === "degraded").length;
      const offline = devices.filter((d) => d.status === "offline").length;
      const status = offline > 0 ? "offline" : degraded > 0 ? "degraded" : "online";
      sites.push({
        id, customer, customerIdx: ci, name,
        criticality: pick(["standard", "high", "high", "standard", "critical"]),
        wanLatencyMs: int(8, 65), wanLossPct: (rand() * 1.4).toFixed(2), wanUptimePct: (99 + rand() * 0.98).toFixed(2),
        status, devices, devicesOnline: online, devicesDegraded: degraded, devicesOffline: offline,
        devicesTotal: devices.length, lastSync: int(1, 30) + "m ago",
      });
    }
  });
  return sites;
}

export const SITES = buildSites();

function siteRef(id) { return SITES.find((s) => s.id === id); }

const INCIDENT_TEMPLATES = [
  {
    category: "AP power delivery", severity: "critical", deviceType: "ap",
    title: "AP repeatedly disconnecting — lobby coverage",
    evidence: [
      "AP disconnected 4 times within 30 minutes",
      "Connected switch remained online throughout",
      "Switch port reported PoE resets during each event",
      "PoE consumption on the port approached its budget limit",
      "Neighboring APs remained healthy with no client impact",
    ],
    rootCause: "Probable AP power-delivery issue: the switch port is repeatedly hitting its PoE budget and resetting the AP.",
    confidence: 89, risk: "low", safetyLevel: 2,
    plan: [
      "Confirm alternate Wi-Fi coverage is available nearby",
      "Capture current port power-draw counters",
      "Power-cycle the affected PoE port",
      "Monitor the AP for 10 minutes",
      "Escalate if another PoE reset occurs",
    ],
    verify: ["AP returned online", "Normal power draw on the port", "Clients reconnected", "No disconnects for 10 minutes"],
    finalNote: "Temporarily remediated — hardware inspection recommended if it recurs.",
  },
  {
    category: "Channel interference", severity: "warning", deviceType: "ap",
    title: "Excessive retries from co-channel interference",
    evidence: [
      "Retry rate above 40% for 20+ minutes",
      "Two neighboring APs broadcasting on the same channel",
      "Client count on the affected AP is within normal range",
      "No hardware errors reported",
    ],
    rootCause: "Co-channel interference between adjacent APs is degrading throughput for connected clients.",
    confidence: 82, risk: "low", safetyLevel: 2,
    plan: ["Run a channel scan across the site", "Reassign the AP to a cleaner channel", "Confirm width matches site RF plan", "Monitor retry rate for 15 minutes"],
    verify: ["Retry rate dropped below 15%", "No new client disconnects", "Adjacent APs unaffected"],
    finalNote: "Resolved — channel reassignment cleared the interference.",
  },
  {
    category: "WAN degradation", severity: "critical", deviceType: "gateway",
    title: "Elevated WAN latency and packet loss",
    evidence: ["Latency climbed from 12ms to 180ms over 15 minutes", "Packet loss measured at 6.4%", "No local congestion on LAN interfaces", "ISP status page reports no outage"],
    rootCause: "Upstream ISP degradation — likely a carrier-side issue rather than a local fault.",
    confidence: 74, risk: "medium", safetyLevel: 3,
    plan: ["Confirm failover WAN is healthy", "Fail over to secondary WAN if degradation persists", "Open a ticket with the ISP", "Notify affected customer contacts"],
    verify: ["Latency back under 30ms", "Packet loss under 0.5%", "Failover link stable if engaged"],
    finalNote: "Monitoring — root cause is carrier-side, ticket opened with ISP.",
  },
  {
    category: "VPN tunnel failure", severity: "critical", deviceType: "gateway",
    title: "Site-to-site VPN tunnel down",
    evidence: ["Tunnel state changed to down 8 minutes ago", "No configuration change logged on either end", "Remote peer unreachable on UDP 500/4500", "WAN interface otherwise healthy"],
    rootCause: "VPN tunnel dropped, likely from a transient handshake failure with the remote peer.",
    confidence: 91, risk: "low", safetyLevel: 2,
    plan: ["Verify remote peer is reachable", "Restart the local VPN tunnel", "Re-establish handshake", "Confirm routed traffic resumes"],
    verify: ["Tunnel state is up", "Handshake completed", "Traffic flowing both directions"],
    finalNote: "Resolved — tunnel re-established automatically after restart.",
  },
  {
    category: "PoE overload", severity: "warning", deviceType: "switch",
    title: "Switch approaching PoE budget limit",
    evidence: ["PoE draw at 91% of budget for 40 minutes", "No single port drawing abnormally", "Device count on switch unchanged", "No port resets yet observed"],
    rootCause: "Cumulative PoE load across all ports is approaching the switch's power budget.",
    confidence: 68, risk: "low", safetyLevel: 1,
    plan: ["Review per-port power draw", "Identify lowest-priority PoE device", "Recommend load rebalancing or PoE budget increase", "Flag for capacity planning"],
    verify: ["Draw stable, no resets", "Capacity plan noted"],
    finalNote: "Recommendation only — no automatic action taken.",
  },
  {
    category: "Spanning tree change", severity: "warning", deviceType: "switch",
    title: "Unexpected spanning-tree topology change",
    evidence: ["3 topology change notifications in 10 minutes", "One uplink port flapped twice", "No new devices adopted during the window", "Client impact minimal"],
    rootCause: "A flapping uplink is triggering repeated STP recalculation.",
    confidence: 71, risk: "medium", safetyLevel: 3,
    plan: ["Identify the flapping port", "Check cable and transceiver health", "Consider disabling the port if confirmed faulty", "Escalate to on-site technician for cable test"],
    verify: ["Topology stable for 15 minutes", "No further flapping observed"],
    finalNote: "Escalated — physical cable inspection required on site.",
  },
  {
    category: "DHCP exhaustion", severity: "critical", deviceType: "gateway",
    title: "DHCP pool exhausted — new clients cannot connect",
    evidence: ["DHCP pool at 100% utilization", "Lease time set to 24 hours", "Client count higher than usual for this site", "No rogue DHCP server detected"],
    rootCause: "The configured DHCP scope is too small for current device density at this site.",
    confidence: 85, risk: "medium", safetyLevel: 3,
    plan: ["Reclaim expired leases", "Recommend expanding the DHCP scope", "Shorten lease time temporarily", "Notify customer of capacity growth"],
    verify: ["Free addresses available in pool", "New clients obtaining leases"],
    finalNote: "Temporarily remediated — scope expansion recommended and pending approval.",
  },
  {
    category: "Firmware drift", severity: "info", deviceType: "ap",
    title: "Firmware version inconsistent across APs",
    evidence: ["3 of 9 APs on an older firmware build", "No functional issues currently reported", "Site is outside its maintenance window"],
    rootCause: "Firmware rollout did not complete across all devices at the site.",
    confidence: 95, risk: "low", safetyLevel: 4,
    plan: ["Schedule firmware update for next maintenance window", "Stage update on one AP first", "Roll out to remaining APs", "Confirm adoption after update"],
    verify: ["All APs report matching firmware", "No adoption failures"],
    finalNote: "Scheduled — awaiting next maintenance window.",
  },
  {
    category: "Rogue device", severity: "warning", deviceType: "switch",
    title: "Unauthorized device detected on access port",
    evidence: ["New MAC address seen on a port with no prior history", "Device fingerprint does not match approved inventory", "Port has no VLAN restriction configured"],
    rootCause: "An unrecognized device was connected to an unrestricted access port.",
    confidence: 77, risk: "high", safetyLevel: 4,
    plan: ["Confirm device identity with on-site contact", "Isolate port to guest VLAN if unconfirmed", "Disable port if unauthorized", "Log incident for security review"],
    verify: ["Port isolated or disabled", "No further unauthorized traffic"],
    finalNote: "Escalated — awaiting customer confirmation before port action.",
  },
  {
    category: "Sticky clients", severity: "info", deviceType: "ap",
    title: "Clients holding onto a weaker AP signal",
    evidence: ["4 clients staying connected below -75dBm", "A stronger AP is in range for all 4 clients", "Band steering enabled but not engaging"],
    rootCause: "Client roaming thresholds are allowing devices to stay on a weak signal instead of roaming.",
    confidence: 63, risk: "low", safetyLevel: 1,
    plan: ["Review minimum RSSI settings", "Recommend enabling stricter roaming assistance", "Monitor client roam behavior"],
    verify: ["Clients roam to stronger AP", "Signal quality improves"],
    finalNote: "Recommendation only — no automatic action taken.",
  },
  {
    category: "Controller backup failure", severity: "warning", deviceType: "console",
    title: "Nightly configuration backup failed",
    evidence: ["Backup job failed 2 nights in a row", "Console storage at 82% utilization", "No recent configuration changes"],
    rootCause: "Insufficient storage headroom is causing the backup job to fail.",
    confidence: 80, risk: "low", safetyLevel: 2,
    plan: ["Clear old log and backup archives", "Re-run backup job manually", "Confirm backup completes and validates", "Alert if storage climbs again"],
    verify: ["Backup completed successfully", "Storage utilization reduced"],
    finalNote: "Resolved — backup completed after clearing archives.",
  },
  {
    category: "Certificate expiration", severity: "info", deviceType: "console",
    title: "Controller certificate expiring in 9 days",
    evidence: ["TLS certificate expires 2026-08-01", "No auto-renewal configured", "Console otherwise healthy"],
    rootCause: "Certificate auto-renewal was never configured for this console.",
    confidence: 99, risk: "low", safetyLevel: 1,
    plan: ["Generate renewed certificate", "Schedule installation during a maintenance window", "Confirm services reload cleanly"],
    verify: ["New certificate installed", "No client trust warnings"],
    finalNote: "Scheduled — pending maintenance window.",
  },
];

const STATUS_ROTATION = [
  "awaiting-approval", "awaiting-approval", "running", "verifying",
  "resolved", "resolved", "resolved", "escalated", "open", "open",
];

export const INCIDENTS = INCIDENT_TEMPLATES.map((t, i) => {
  const site = SITES[(i * 3 + 2) % SITES.length];
  const device = site.devices.find((d) => d.type === t.deviceType) || site.devices[0];
  const status = STATUS_ROTATION[i % STATUS_ROTATION.length];
  const ageMin = int(6, 620);
  return {
    id: "inc-" + (i + 1), ...t, siteId: site.id, siteName: site.name, customer: site.customer,
    deviceId: device.id, deviceName: device.name, status, ageMin,
    detectedAt: ageMin + "m ago", run: status === "running" || status === "verifying" ? { stepIndex: status === "verifying" ? t.plan.length : int(1, t.plan.length - 1), verified: false } : null,
    audit: [{ actor: "Monitoring Agent", action: "Incident detected", at: ageMin + "m ago" }, { actor: "Diagnostic Agent", action: "Root cause diagnosed (" + t.confidence + "% confidence)", at: (ageMin - 1) + "m ago" }],
  };
});

export const SAFETY_LEVELS = {
  0: { label: "L0 · Observe", desc: "Detected and explained only — no action taken." },
  1: { label: "L1 · Recommend", desc: "A technician must manually perform this action." },
  2: { label: "L2 · Approval required", desc: "Prepared and ready — an authorized technician must approve." },
  3: { label: "L3 · Auto low-risk", desc: "Eligible for automatic remediation under a preapproved playbook." },
  4: { label: "L4 · Restricted", desc: "Always requires approval — affects shared network configuration." },
};

export function kpis(incidents, sites) {
  const online = sites.filter((s) => s.status === "online").length;
  const degraded = sites.filter((s) => s.status === "degraded").length;
  const offline = sites.filter((s) => s.status === "offline").length;
  const open = incidents.filter((i) => !["resolved"].includes(i.status)).length;
  const awaiting = incidents.filter((i) => i.status === "awaiting-approval").length;
  const resolved = incidents.filter((i) => i.status === "resolved").length;
  return { online, degraded, offline, open, awaiting, resolved, total: sites.length };
}
