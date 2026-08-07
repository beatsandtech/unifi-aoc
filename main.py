from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, status, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import uuid
import datetime
import random
import os
from pydantic import BaseModel

CONNECTOR_API_KEY = os.environ.get("CONNECTOR_API_KEY", "aoc-connector-local-key")

# Schema models for Auth
class UserRegister(BaseModel):
    email: str
    password: str
    role: str = "Helpdesk"

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str

from models import init_db, SessionLocal, Organization, Customer, Site, Device, Metric, Incident, RemediationRun, Playbook, AuditLog, User
from agents import MonitoringAgent, DiagnosticAgent, RemediationExecutionAgent, IncidentCorrelationAgent, RemediationExecutionAgent

app = FastAPI(title="UniFi Autonomous Operations Center Central API")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# Simple mock database password hashing helper (plaintext matches for demo/local environment simplicity)
def verify_password(plain_password, hashed_password):
    return plain_password == hashed_password

# Setup CORS for Frontend Dev Server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "UniFi Autonomous Operations Center API Engine",
        "endpoints": {
            "dashboard_summary": "/api/dashboard",
            "all_sites": "/api/sites",
            "all_incidents": "/api/incidents",
            "all_remediations": "/api/remediations"
        }
    }


# Initialize Database
init_db()

# Dependency for DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Retrieve authenticated user from token database session
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.id == token).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

# Role enforcement helper check
def verify_connector_key(x_connector_key: str = Header(...)):
    if x_connector_key != CONNECTOR_API_KEY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid connector API key.")

def enforce_role(user: User, allowed_roles: List[str]):
    if user.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden. {user.role} role does not possess permissions to complete this action."
        )

SAFETY_LEVELS = {
    0: {"label": "L0 · Observe", "desc": "Detected and explained only — no action taken."},
    1: {"label": "L1 · Recommend", "desc": "A technician must manually perform this action."},
    2: {"label": "L2 · Approval required", "desc": "Prepared and ready — an authorized technician must approve."},
    3: {"label": "L3 · Auto low-risk", "desc": "Eligible for automatic remediation under a preapproved playbook."},
    4: {"label": "L4 · Restricted", "desc": "Always requires approval — affects shared network configuration."},
}

# User registration endpoint
@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register_user(payload: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")

    new_user = User(
        id=str(uuid.uuid4())[:8],
        email=payload.email,
        password_hash=payload.password, # Plaintext matching for simplicity in local demo setup
        role=payload.role
    )
    db.add(new_user)
    db.commit()
    return {"message": "Registration successful.", "user_id": new_user.id}

# User authentication login endpoint
@app.post("/api/auth/login")
def login_user(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Using User ID directly as Mock Token for local sqlite context session simplicity
    return {
        "access_token": user.id,
        "token_type": "bearer",
        "role": user.role
    }

# User Management Endpoints
@app.get("/api/users")
def get_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    enforce_role(current_user, ["Admin"])
    users = db.query(User).all()
    # Strip password hash before returning
    return [{"id": u.id, "email": u.email, "role": u.role, "created_at": u.created_at} for u in users]

@app.delete("/api/users/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    enforce_role(current_user, ["Admin"])
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account.")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully."}

# Seed database with sample MSP client topology if empty
@app.post("/api/seed")
def seed_data(db: Session = Depends(get_db), token: Optional[str] = Depends(OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False))):
    if db.query(User).first():
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
        user = db.query(User).filter(User.id == token).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")
        enforce_role(user, ["Admin"])
    # Check if seed already run
    if db.query(Organization).first():
        return {"message": "Database already seeded."}

    org = Organization(id="org_msp_alpha", name="Alpha MSP Group")
    db.add(org)

    # Seed Admin User
    admin = User(
        id="usr_admin", organization_id=org.id, email="admin@alpha.com",
        password_hash="admin123", role="Admin"
    )
    # Seed Helpdesk User
    helpdesk = User(
        id="usr_tech", organization_id=org.id, email="tech@alpha.com",
        password_hash="tech123", role="Helpdesk"
    )
    db.add_all([admin, helpdesk])

    cust1 = Customer(id="cust_acme", name="Acme Corporation", support_plan="Premium", organization_id=org.id)
    cust2 = Customer(id="cust_stark", name="Stark Industries", support_plan="Enterprise", organization_id=org.id)
    db.add_all([cust1, cust2])

    site1 = Site(id="site_acme_hq", customer_id=cust1.id, name="Acme HQ", timezone="America/New_York", status="Online", criticality="Premium", wan_latency_ms=12, wan_loss_pct=0.2, wan_uptime_pct=99.8)
    site2 = Site(id="site_stark_tower", customer_id=cust2.id, name="Stark Tower NY", timezone="America/New_York", status="Degraded", criticality="Premium", wan_latency_ms=45, wan_loss_pct=2.1, wan_uptime_pct=97.5)
    db.add_all([site1, site2])

    # Devices
    dev1 = Device(
        id="dev_acme_gateway", site_id=site1.id, mac="00:11:22:33:44:55",
        type="gateway", model="UXG-Pro", name="Primary Gateway UXG",
        ip_address="192.168.1.1", firmware="3.1.16", status="Online", uptime_days=127
    )
    dev2 = Device(
        id="dev_acme_switch", site_id=site1.id, mac="00:11:22:33:44:66",
        type="switch", model="USW-Pro-24-PoE", name="Core Switch 24-PoE",
        ip_address="192.168.1.10", firmware="6.5.59", status="Online", uptime_days=89
    )
    dev3 = Device(
        id="dev_acme_ap1", site_id=site1.id, mac="00:11:22:33:44:77",
        type="ap", model="U6-Pro", name="Lobby AP-U6",
        ip_address="192.168.1.20", firmware="6.5.62", status="Online",
        parent_device_id=dev2.id, switch_port=4, poe_draw=8.2, uptime_days=45
    )

    dev4 = Device(
        id="dev_stark_gateway", site_id=site2.id, mac="aa:bb:cc:dd:ee:11",
        type="gateway", model="UDM-Pro", name="UDM Pro Security Gateway",
        ip_address="10.0.0.1", firmware="3.2.7", status="Online", uptime_days=156
    )
    dev5 = Device(
        id="dev_stark_switch", site_id=site2.id, mac="aa:bb:cc:dd:ee:22",
        type="switch", model="USW-Enterprise-48-PoE", name="Stark Core Switch",
        ip_address="10.0.0.5", firmware="6.6.11", status="Online", uptime_days=134
    )
    dev6 = Device(
        id="dev_stark_ap1", site_id=site2.id, mac="aa:bb:cc:dd:ee:33",
        type="ap", model="U7-Pro", name="Executive Meeting AP",
        ip_address="10.0.0.50", firmware="7.0.4", status="Offline",
        parent_device_id=dev5.id, switch_port=12, poe_draw=0.0, uptime_days=23
    )
    db.add_all([dev1, dev2, dev3, dev4, dev5, dev6])

    # Playbooks
    pb = Playbook(
        id="pb_poe_cycle",
        name="Safe PoE Port Power-Cycle",
        trigger_conditions={"category": "Switch/PoE"},
        allowed_actions=["cycle_poe_port"],
        risk_level="Low",
        verification_tests=["ping_device", "verify_poe_draw"]
    )
    db.add(pb)
    db.commit()

    # Pre-add metric history
    for minutes in range(30, 0, -5):
        timestamp = datetime.datetime.utcnow() - datetime.timedelta(minutes=minutes)
        db.add(Metric(device_id=dev3.id, metric_type="retry_rate", value=2.0 + (minutes % 3), timestamp=timestamp))
        db.add(Metric(device_id=dev6.id, metric_type="retry_rate", value=15.0 + (minutes % 5), timestamp=timestamp))
        
    db.commit()
    return {"message": "Mock MSP workspace seeded successfully!"}

# ── Serialization helpers ────────────────────────────────────────────────
# SQLAlchemy relationships do not survive FastAPI's default encoding, so the
# operations UI would otherwise receive bare foreign keys (customer_id) with no
# human-readable name attached. These build the display-ready payloads.

def _lookup_maps(db: Session):
    customers = {c.id: c.name for c in db.query(Customer).all()}
    sites = db.query(Site).all()
    site_names = {s.id: s.name for s in sites}
    site_customer = {s.id: customers.get(s.customer_id, "Unassigned") for s in sites}
    device_names = {d.id: d.name for d in db.query(Device).all()}
    return customers, site_names, site_customer, device_names


def _age_label(minutes: int) -> str:
    if minutes < 60:
        return f"{minutes}m"
    if minutes < 1440:
        return f"{round(minutes / 60)}h"
    return f"{round(minutes / 1440)}d"


def _serialize_site(site: Site, customers, devices, incidents):
    online = sum(1 for d in devices if d.status == "Online")
    return {
        "id": site.id,
        "name": site.name,
        "customer_id": site.customer_id,
        "customer_name": customers.get(site.customer_id, "Unassigned"),
        "status": site.status,
        "criticality": site.criticality,
        "timezone": site.timezone,
        "wan_latency_ms": site.wan_latency_ms,
        "wan_loss_pct": site.wan_loss_pct,
        "wan_uptime_pct": site.wan_uptime_pct,
        "last_sync": site.last_sync,
        "devices_total": len(devices),
        "devices_online": online,
        "open_incident_count": sum(1 for i in incidents if i.status != "Resolved"),
    }


def _serialize_device(device: Device):
    return {
        "id": device.id,
        "site_id": device.site_id,
        "name": device.name,
        "type": device.type,
        "model": device.model,
        "mac": device.mac,
        "ip_address": device.ip_address,
        "firmware": device.firmware,
        "status": device.status,
        "uptime_days": device.uptime_days,
        "poe_draw": device.poe_draw,
        "switch_port": device.switch_port,
    }


def _serialize_incident(incident: Incident, site_names, site_customer, device_names):
    plan = incident.remediation_plan or []
    detected = incident.first_detected or datetime.datetime.utcnow()
    age_minutes = max(0, int((datetime.datetime.utcnow() - detected).total_seconds() // 60))
    level = incident.remediation_safety_level if incident.remediation_safety_level is not None else 2
    safety = SAFETY_LEVELS.get(level, {"label": f"L{level}", "desc": ""})
    return {
        "id": incident.id,
        "site_id": incident.site_id,
        "site_name": site_names.get(incident.site_id, "Unknown site"),
        "customer_name": site_customer.get(incident.site_id, "Unassigned"),
        "device_id": incident.device_id,
        "device_name": device_names.get(incident.device_id) if incident.device_id else None,
        "severity": incident.severity,
        "category": incident.category,
        "status": incident.status,
        "first_detected": incident.first_detected,
        "last_updated": incident.last_updated,
        "root_cause": incident.root_cause,
        "ai_confidence": incident.ai_confidence,
        "confidence_pct": round((incident.ai_confidence or 0) * 100),
        "evidence": incident.evidence,
        "recommended_action": incident.recommended_action,
        "remediation_safety_level": level,
        "safety_label": safety["label"],
        "safety_desc": safety["desc"],
        "safety_short": f"L{level}",
        "remediation_plan": plan,
        "plan_total": len(plan),
        "run_step_index": incident.run_step_index or 0,
        "verification_steps": incident.verification_steps or [],
        "age_minutes": age_minutes,
        "age_label": _age_label(age_minutes),
    }


def _all_incidents_payload(db: Session):
    _, site_names, site_customer, device_names = _lookup_maps(db)
    rows = db.query(Incident).order_by(Incident.first_detected.desc()).all()
    return [_serialize_incident(i, site_names, site_customer, device_names) for i in rows]


@app.get("/api/dashboard")
def get_dashboard_summary(db: Session = Depends(get_db)):
    total_clients = db.query(Customer).count()
    total_sites = db.query(Site).count()
    sites_online = db.query(Site).filter(Site.status == "Online").count()
    sites_degraded = db.query(Site).filter(Site.status == "Degraded").count()
    sites_offline = db.query(Site).filter(Site.status == "Offline").count()
    
    open_incidents = db.query(Incident).filter(
        Incident.status.in_(["Open", "Awaiting Approval", "Running", "Verifying", "Escalated"])
    ).count()
    remediated_incidents = db.query(Incident).filter(Incident.status == "Resolved").count()
    
    devices = db.query(Device).all()
    devices_summary = {
        "total": len(devices),
        "online": sum(1 for d in devices if d.status == "Online"),
        "offline": sum(1 for d in devices if d.status == "Offline"),
    }

    recent_incidents = _all_incidents_payload(db)[:5]

    return {
        "clients": total_clients,
        "sites": {
            "total": total_sites,
            "online": sites_online,
            "degraded": sites_degraded,
            "offline": sites_offline
        },
        "incidents": {
            "open": open_incidents,
            "remediated": remediated_incidents,
        },
        "devices": devices_summary,
        "recent_incidents": recent_incidents
    }

@app.get("/api/reports")
def get_reports(db: Session = Depends(get_db)):
    sites = db.query(Site).all()
    incidents = db.query(Incident).all()

    def uptime_band(pct: float) -> str:
        if pct >= 99.0:
            return "good"
        if pct >= 95.0:
            return "warning"
        return "critical"

    site_uptime = sorted(
        [
            {
                "site_id": s.id,
                "name": s.name,
                "wan_uptime_pct": s.wan_uptime_pct,
                "band": uptime_band(s.wan_uptime_pct or 0),
            }
            for s in sites
        ],
        key=lambda r: r["wan_uptime_pct"],
    )

    category_counts: Dict[str, int] = {}
    for i in incidents:
        category_counts[i.category] = category_counts.get(i.category, 0) + 1
    category_breakdown = sorted(
        [{"category": k, "count": v} for k, v in category_counts.items()],
        key=lambda r: -r["count"],
    )

    resolved = [i for i in incidents if i.status == "Resolved"]
    escalated = [i for i in incidents if i.status == "Escalated"]
    open_count = len(incidents) - len(resolved) - len(escalated)
    outcome_breakdown = {
        "resolved": len(resolved),
        "escalated": len(escalated),
        "open": open_count,
        "total": len(incidents),
    }

    resolution_minutes = [
        (i.last_updated - i.first_detected).total_seconds() / 60
        for i in resolved
        if i.last_updated and i.first_detected
    ]
    avg_resolution_minutes = round(sum(resolution_minutes) / len(resolution_minutes)) if resolution_minutes else None

    # 14-day incident volume, zero-filled so the trend line doesn't skip days
    # with no activity.
    today = datetime.datetime.utcnow().date()
    day_buckets = {(today - datetime.timedelta(days=n)): 0 for n in range(13, -1, -1)}
    for i in incidents:
        if not i.first_detected:
            continue
        d = i.first_detected.date()
        if d in day_buckets:
            day_buckets[d] += 1
    volume_trend = [
        {"date": d.isoformat(), "label": f"{d.strftime('%b')} {d.day}", "count": c}
        for d, c in sorted(day_buckets.items())
    ]

    firmware_versions = sorted(set(d.firmware for d in db.query(Device).all() if d.firmware))

    return {
        "site_uptime": site_uptime,
        "category_breakdown": category_breakdown,
        "outcome_breakdown": outcome_breakdown,
        "avg_resolution_minutes": avg_resolution_minutes,
        "volume_trend": volume_trend,
        "firmware_versions": firmware_versions,
    }


@app.get("/api/sites")
def get_sites(db: Session = Depends(get_db)):
    customers = {c.id: c.name for c in db.query(Customer).all()}

    devices_by_site: Dict[str, list] = {}
    for d in db.query(Device).all():
        devices_by_site.setdefault(d.site_id, []).append(d)

    incidents_by_site: Dict[str, list] = {}
    for i in db.query(Incident).all():
        incidents_by_site.setdefault(i.site_id, []).append(i)

    return [
        _serialize_site(
            s,
            customers,
            devices_by_site.get(s.id, []),
            incidents_by_site.get(s.id, []),
        )
        for s in db.query(Site).all()
    ]

@app.get("/api/sites/{site_id}")
def get_site_details(site_id: str, db: Session = Depends(get_db)):
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    customers, site_names, site_customer, device_names = _lookup_maps(db)
    devices = db.query(Device).filter(Device.site_id == site_id).all()
    incidents = db.query(Incident).filter(Incident.site_id == site_id).all()

    return {
        "site": _serialize_site(site, customers, devices, incidents),
        "devices": [_serialize_device(d) for d in devices],
        "incidents": [
            _serialize_incident(i, site_names, site_customer, device_names)
            for i in incidents
        ],
    }

@app.get("/api/incidents")
def get_incidents(db: Session = Depends(get_db)):
    return _all_incidents_payload(db)

@app.get("/api/incidents/{incident_id}")
def get_incident_detail(incident_id: str, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    customers, site_names, site_customer, device_names = _lookup_maps(db)
    site = db.query(Site).filter(Site.id == incident.site_id).first()
    device = db.query(Device).filter(Device.id == incident.device_id).first() if incident.device_id else None
    audit_logs = db.query(AuditLog).filter(AuditLog.target == incident_id).order_by(AuditLog.timestamp.asc()).all()
    runs = db.query(RemediationRun).filter(RemediationRun.incident_id == incident_id).order_by(RemediationRun.created_at.asc()).all()

    site_devices = db.query(Device).filter(Device.site_id == incident.site_id).all() if site else []
    site_incidents = db.query(Incident).filter(Incident.site_id == incident.site_id).all() if site else []

    return {
        "incident": _serialize_incident(incident, site_names, site_customer, device_names),
        "site": _serialize_site(site, customers, site_devices, site_incidents) if site else None,
        "device": _serialize_device(device) if device else None,
        "audit_logs": [
            {
                "id": a.id,
                "actor": a.user_or_agent,
                "action": a.action,
                "timestamp": a.timestamp,
                "result": a.result,
            }
            for a in audit_logs
        ],
        "remediation_runs": [
            {
                "id": r.id,
                "status": r.status,
                "approver": r.approver,
                "execution_log": r.execution_log,
                "created_at": r.created_at,
                "completed_at": r.completed_at,
            }
            for r in runs
        ],
    }

@app.post("/api/incidents/{incident_id}/diagnose")
def trigger_diagnosis(incident_id: str, db: Session = Depends(get_db)):
    agent = DiagnosticAgent(db)
    return agent.diagnose(incident_id)

def _execute_remediation_run(run_id: str):
    """Background worker for a remediation run.

    Opens its own session: FastAPI tears down the request-scoped `get_db`
    dependency before background tasks execute, so reusing it here would run
    against a closed session.
    """
    db = SessionLocal()
    try:
        RemediationExecutionAgent(db).execute_and_verify(run_id)
    except Exception as exc:  # keep a failed run from dying silently
        print(f"[Remediation] run {run_id} failed: {exc}")
    finally:
        db.close()


@app.post("/api/incidents/{incident_id}/approve")
def approve_remediation(
    incident_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Enforce role levels permissions: Only Admin, Engineer, and Helpdesk roles can trigger approved executions
    enforce_role(current_user, ["Admin", "Engineer", "Helpdesk"])

    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Level 4 touches shared network configuration — administrator only. The UI
    # hides the button, but the rule has to hold at the API too.
    if (incident.remediation_safety_level or 0) >= 4 and current_user.role != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Safety Level 4 remediations require MSP Administrator approval.",
        )

    if incident.status not in ("Open", "Awaiting Approval"):
        raise HTTPException(
            status_code=409,
            detail=f"Incident is '{incident.status}' and cannot be approved again.",
        )

    execution_agent = RemediationExecutionAgent(db)
    run = execution_agent.initiate_remediation(incident_id, current_user.email)

    # Execute the remediation run asynchronously
    background_tasks.add_task(_execute_remediation_run, run.id)

    return {"message": "Remediation run approved and execution started.", "run_id": run.id}


@app.post("/api/incidents/{incident_id}/escalate")
def escalate_incident(
    incident_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    incident.status = "Escalated"
    incident.last_updated = datetime.datetime.utcnow()
    db.add(AuditLog(
        user_or_agent=current_user.email,
        action="Manually escalated to on-call engineer",
        target=incident.id,
    ))
    db.commit()
    return {"message": "Incident escalated.", "incident_id": incident.id}

@app.get("/api/remediations")
def get_remediation_runs(db: Session = Depends(get_db)):
    return db.query(RemediationRun).order_by(RemediationRun.created_at.desc()).all()

@app.get("/api/remediations/{run_id}")
def get_remediation_details(run_id: str, db: Session = Depends(get_db)):
    run = db.query(RemediationRun).filter(RemediationRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Remediation run not found")
    return run

# Simulation Endpoints
@app.post("/api/simulate/incident")
def simulate_incident(
    site_id: Optional[str] = None,
    incident_type: Optional[str] = None,
    payload: Optional[Dict[str, str]] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    correlation_agent = IncidentCorrelationAgent(db)

    # Accept the scenario from either a query string or a JSON body so the UI
    # button and ad-hoc curl calls both work. Query string wins when both are set.
    body = payload or {}
    incident_type = incident_type or body.get("incident_type") or body.get("type") or "poe_overload"
    site_id = site_id or body.get("site_id")

    if not site_id:
        site = db.query(Site).first()
        if site:
            site_id = site.id
        else:
            site_id = "unknown_site"
            
    site = db.query(Site).filter(Site.id == site_id).first()
    
    if incident_type == "gateway_outage":
        gw = db.query(Device).filter(Device.site_id == site_id, Device.type == "gateway").first()
        gw_name = f"{gw.name} (MAC: {gw.mac}, IP: {gw.ip_address})" if gw else "Security Gateway"
        events = [
            {"event": "gateway_wan_outage", "message": f"{gw_name} reported WAN packet loss exceeding 95% on WAN1."},
            {"event": "dns_failure", "message": "Primary DNS Server 8.8.8.8 queries timed out."}
        ]
        if gw:
            gw.status = "Offline"
        if site:
            site.status = "Offline"

        incident = correlation_agent.correlate_events(site_id, events, device_id=gw.id if gw else None)
        
    elif incident_type == "switch_flap":
        sw = db.query(Device).filter(Device.site_id == site_id, Device.type == "switch").first()
        sw_name = f"{sw.name} (MAC: {sw.mac}, IP: {sw.ip_address})" if sw else "Core Switch"
        
        port_num = 12
        if sw and sw.model:
            model_up = sw.model.upper()
            if "MINI" in model_up or "5" in model_up:
                port_num = random.randint(1, 5)
            elif "8" in model_up:
                port_num = random.randint(1, 8)
            elif "16" in model_up:
                port_num = random.randint(1, 16)
            elif "24" in model_up:
                port_num = random.randint(1, 24)
            elif "48" in model_up:
                port_num = random.randint(1, 48)

        events = [
            {"event": "switch_port_flap", "message": f"{sw_name} port {port_num} negotiated down to 100Mbps/Half-Duplex."},
            {"event": "port_errors", "message": f"{sw_name} port {port_num} error packet rate at 120 pkts/sec."}
        ]
        if sw:
            sw.status = "Flapping"
        if site:
            site.status = "Degraded"

        incident = correlation_agent.correlate_events(site_id, events, device_id=sw.id if sw else None)
        
    elif incident_type == "ap_rf_noise":
        ap = db.query(Device).filter(Device.site_id == site_id, Device.type == "ap").first()
        ap_name = f"{ap.name} (MAC: {ap.mac}, IP: {ap.ip_address})" if ap else "Access Point"
        events = [
            {"event": "ap_high_retries", "message": f"{ap_name} reported TX retry rate above threshold: 42% on 5GHz."},
            {"event": "channel_interference", "message": f"{ap_name} channel 36 utilization reached 78% (Co-channel interference)."}
        ]
        if site and site.status == "Online":
            site.status = "Degraded"

        incident = correlation_agent.correlate_events(site_id, events, device_id=ap.id if ap else None)
        
    else: # poe_overload
        ap = db.query(Device).filter(Device.site_id == site_id, Device.type == "ap").first()
        sw = db.query(Device).filter(Device.site_id == site_id, Device.type == "switch").first()
        ap_name = f"{ap.name} (MAC: {ap.mac}, IP: {ap.ip_address})" if ap else "Access Point"
        sw_name = f"{sw.name} (MAC: {sw.mac}, IP: {sw.ip_address})" if sw else "Core Switch"
        
        port_num = 12
        max_port = 24
        if sw and sw.model:
            model_up = sw.model.upper()
            if "MINI" in model_up or "5" in model_up:
                max_port = 5
            elif "8" in model_up:
                max_port = 8
            elif "16" in model_up:
                max_port = 16
            elif "48" in model_up:
                max_port = 48
                
            port_num = random.randint(1, max_port)

        port_range = f"{max(1, port_num-2)}-{min(max_port, port_num+2)}"

        events = [
            {"event": "ap_disconnected", "message": f"{ap_name} has disconnected unexpectedly."},
            {"event": "poe_budget_warning", "message": f"{sw_name} reported PoE capacity limit warning on ports {port_range}."}
        ]
        if ap:
            ap.status = "Offline"
        if site:
            site.status = "Degraded"

        incident = correlation_agent.correlate_events(site_id, events, device_id=ap.id if ap else None)
            
    db.commit()

    # This is an *autonomous* operations centre: detection and diagnosis happen
    # without a human. Running the diagnostic agent immediately lands the new
    # incident in the approval queue, which is where an operator picks it up.
    try:
        DiagnosticAgent(db).diagnose(incident.id)
    except Exception as exc:
        print(f"[Simulate] auto-diagnosis failed for {incident.id}: {exc}")

    db.refresh(incident)
    _, site_names, site_customer, device_names = _lookup_maps(db)
    return {
        "message": f"{incident_type} incident simulation triggered.",
        "incident": _serialize_incident(incident, site_names, site_customer, device_names),
    }

@app.post("/api/connector/syslog", dependencies=[Depends(verify_connector_key)])
def ingest_syslog(payload: Dict[str, str], db: Session = Depends(get_db)):
    msg = payload.get("message", "").lower()
    ip = payload.get("ip", "Unknown")
    
    correlation_agent = IncidentCorrelationAgent(db)
    
    # Map raw syslog phrases to matching incident events
    events = []
    if "disconnected" in msg or "lost link" in msg:
        events.append({"event": "ap_disconnected", "message": f"Syslog from {ip}: {payload.get('message')}"})
    elif "poe" in msg and ("over" in msg or "budget" in msg or "limit" in msg):
        events.append({"event": "poe_budget_warning", "message": f"Syslog from {ip}: {payload.get('message')}"})
    elif "negotiation" in msg or "duplex" in msg or "flap" in msg:
        events.append({"event": "switch_port_flap", "message": f"Syslog from {ip}: {payload.get('message')}"})
    elif "wan" in msg or "failover" in msg:
        events.append({"event": "gateway_wan_outage", "message": f"Syslog from {ip}: {payload.get('message')}"})
        
    if events:
        # Resolve the real site from whichever device sent this syslog message —
        # a synced device's IP is the only identifying field a raw syslog packet
        # carries back to us.
        sender = db.query(Device).filter(Device.ip_address == ip).first()
        if not sender:
            return {"status": "ignored", "reason": f"No synced device found for sender IP {ip}."}

        incident = correlation_agent.correlate_events(sender.site_id, events, device_id=sender.id)
        return {"status": "event_correlated", "incident_id": incident.id}

    return {"status": "ignored", "reason": "No matched operational signatures."}

class SyncPayload(BaseModel):
    sites: List[Dict[str, Any]]
    devices: List[Dict[str, Any]]

@app.post("/api/connector/sync", dependencies=[Depends(verify_connector_key)])
def sync_telemetry(payload: SyncPayload, db: Session = Depends(get_db)):
    """Receives live Cloud API telemetry and upserts sites and devices into the database."""
    # Ensure a default organization exists
    org = db.query(Organization).first()
    if not org:
        org = Organization(id="org_default", name="Live MSP Group")
        db.add(org)
        admin = db.query(User).filter(User.email == "admin@alpha.com").first()
        if not admin:
            db.add(User(
                id="usr_admin", organization_id="org_default", email="admin@alpha.com",
                password_hash="admin123", role="Admin"
            ))
        db.flush()

    org_id = org.id

    # Upsert Sites — preserve an existing site's derived status (e.g. Degraded
    # from an open incident) instead of stomping it back to Online every 15s
    # cycle. Only a brand-new site defaults to Online; status is recomputed
    # from real device/incident state below regardless.
    active_site_ids = set()
    existing_site_ids = {row[0] for row in db.query(Site.id).all()}
    for s in payload.sites:
        site_id = s.get("id")
        if not site_id:
            continue
        active_site_ids.add(site_id)
        if site_id in existing_site_ids:
            db.merge(Site(id=site_id, name=s.get("name", "Unknown Site"), timezone="UTC"))
        else:
            db.merge(Site(id=site_id, name=s.get("name", "Unknown Site"), status="Online", timezone="UTC"))

    db.flush()  # Commit sites to session so device FKs resolve

    # Remove stale devices from active sites that aren't in the incoming payload
    incoming_macs = {d.get("mac", "").upper() for d in payload.devices}
    for site_id in active_site_ids:
        stale = db.query(Device).filter(Device.site_id == site_id).all()
        for dev in stale:
            if dev.mac.upper() not in incoming_macs:
                db.delete(dev)
    db.flush()

    # Snapshot status before upserting so we can detect Online->Offline
    # transitions below. This is the live-monitoring signal for real devices:
    # nothing else watches device health without syslog forwarding configured
    # (see /api/connector/syslog), which needs a reachable UDP endpoint this
    # deployment may not have.
    prior_status = {mac.upper(): status for mac, status in db.query(Device.mac, Device.status).all()}

    correlation_agent = IncidentCorrelationAgent(db)
    newly_offline = []  # (device_id, site_id) needing an incident after upsert

    # Upsert Devices — full field refresh via merge()
    for d in payload.devices:
        mac = d.get("mac", "")
        if not mac:
            continue
        model = d.get("model", "Unknown")
        name = d.get("name") or f"{model} ({mac})"
        device_id = f"dev_{mac.replace(':','').replace('-','').lower()}"
        new_status = d.get("status", "Online")
        db.merge(Device(
            id=device_id,
            site_id=d.get("site_id"),
            mac=mac,
            name=name,
            model=model,
            type=d.get("type") or "gateway",
            status=new_status,
            ip_address=d.get("ip", "") or "",
            firmware=d.get("firmware", "") or "",
            last_seen=datetime.datetime.utcnow()
        ))
        # Fires on a true Online->Offline flip AND on first-ever sight of an
        # already-offline device (prior_status.get returns None) — either way
        # it's real, unreported device trouble worth surfacing.
        if new_status != "Online" and prior_status.get(mac.upper()) != new_status:
            newly_offline.append((device_id, d.get("site_id")))

    db.flush()

    # Raise one incident per newly-offline device, skipping devices that
    # already have an open incident so a stuck device doesn't re-raise every
    # 15s poll cycle.
    device_type_to_event = {
        "gateway": "gateway_wan_outage",
        "switch": "switch_port_flap",
    }
    for device_id, site_id in newly_offline:
        if not site_id:
            continue
        already_open = db.query(Incident).filter(
            Incident.device_id == device_id,
            Incident.status.notin_(["Resolved"]),
        ).first()
        if already_open:
            continue
        device = db.query(Device).filter(Device.id == device_id).first()
        if not device:
            continue
        event_key = device_type_to_event.get(device.type, "ap_disconnected")
        correlation_agent.correlate_events(
            site_id,
            [{"event": event_key, "message": f"{device.name} ({device.mac}) went offline — no heartbeat from UniFi Cloud."}],
            device_id=device_id,
        )

    # Recompute every synced site's status from real device/incident state —
    # covers both new incidents just raised above and devices that recovered.
    for site_id in active_site_ids:
        site = db.query(Site).filter(Site.id == site_id).first()
        if not site:
            continue
        still_open = db.query(Incident).filter(
            Incident.site_id == site_id, Incident.status.notin_(["Resolved"])
        ).count()
        offline_devices = db.query(Device).filter(
            Device.site_id == site_id, Device.status != "Online"
        ).count()
        site.status = "Online" if still_open == 0 and offline_devices == 0 else "Degraded"

    db.commit()
    return {
        "status": "success",
        "synced_sites": len(payload.sites),
        "synced_devices": len(payload.devices),
        "new_incidents": len(newly_offline),
    }


@app.post("/api/connector/reset")
def reset_connector_data(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    enforce_role(current_user, ["Admin"])
    """Wipe all connector-synced devices and sites so a fresh sync starts clean."""
    db.query(Device).delete()
    db.query(Site).delete()
    db.commit()
    return {"status": "reset", "message": "All device and site data cleared. Next sync will repopulate."}


