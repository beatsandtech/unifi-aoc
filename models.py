import datetime
from sqlalchemy import create_engine, Column, String, Integer, DateTime, ForeignKey, Float, JSON, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

DATABASE_URL = "sqlite:///./unifi_aoc.db"  # SQLite used for straightforward installation/demo in MVP

Base = declarative_base()
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Organization(Base):
    __tablename__ = "organizations"
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    customers = relationship("Customer", back_populates="organization")

class Customer(Base):
    __tablename__ = "customers"
    id = Column(String, primary_key=True, index=True)
    organization_id = Column(String, ForeignKey("organizations.id"))
    name = Column(String, nullable=False)
    support_plan = Column(String, default="Standard")  # Standard, Premium, Enterprise
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    organization = relationship("Organization", back_populates="customers")
    sites = relationship("Site", back_populates="customer")

class Site(Base):
    __tablename__ = "sites"
    id = Column(String, primary_key=True, index=True)
    customer_id = Column(String, ForeignKey("customers.id"))
    name = Column(String, nullable=False)
    unifi_site_id = Column(String, nullable=True)
    console_id = Column(String, nullable=True)
    timezone = Column(String, default="UTC")
    status = Column(String, default="Online")  # Online, Degraded, Offline
    criticality = Column(String, default="Standard")  # Standard, Premium, Critical
    wan_latency_ms = Column(Integer, default=0)
    wan_loss_pct = Column(Float, default=0.0)
    wan_uptime_pct = Column(Float, default=100.0)
    last_sync = Column(DateTime, default=datetime.datetime.utcnow)

    customer = relationship("Customer", back_populates="sites")
    devices = relationship("Device", back_populates="site")
    incidents = relationship("Incident", back_populates="site")

class Device(Base):
    __tablename__ = "devices"
    id = Column(String, primary_key=True, index=True)
    site_id = Column(String, ForeignKey("sites.id"))
    mac = Column(String, unique=True, index=True)
    type = Column(String, nullable=False)  # ap, switch, gateway, console
    model = Column(String, nullable=False)
    name = Column(String, nullable=False)
    ip_address = Column(String, nullable=True)
    firmware = Column(String, nullable=True)
    status = Column(String, default="Online")  # Online, Flapping, Offline, Adopting
    last_seen = Column(DateTime, default=datetime.datetime.utcnow)
    parent_device_id = Column(String, nullable=True)
    switch_port = Column(Integer, nullable=True)
    poe_draw = Column(Float, default=0.0)  # Watts
    uptime_days = Column(Integer, default=0)

    site = relationship("Site", back_populates="devices")

class Metric(Base):
    __tablename__ = "metrics"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, ForeignKey("devices.id"))
    metric_type = Column(String, index=True)  # cpu, memory, packet_loss, retry_rate, temperature
    value = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

class Incident(Base):
    __tablename__ = "incidents"
    id = Column(String, primary_key=True, index=True)
    site_id = Column(String, ForeignKey("sites.id"))
    device_id = Column(String, nullable=True)
    severity = Column(String, default="Medium")  # Low, Medium, High, Critical
    category = Column(String, nullable=False)  # AP, Switch, Gateway, Controller
    status = Column(String, default="Open")  # Open, Awaiting Approval, Running, Verifying, Resolved, Escalated
    first_detected = Column(DateTime, default=datetime.datetime.utcnow)
    last_updated = Column(DateTime, default=datetime.datetime.utcnow)
    root_cause = Column(String, nullable=True)
    ai_confidence = Column(Float, default=0.0)
    business_impact = Column(String, nullable=True)
    evidence = Column(JSON, nullable=True)  # {events: [...]}
    recommended_action = Column(String, nullable=True)
    remediation_safety_level = Column(Integer, default=2)  # 0, 1, 2, 3, 4
    remediation_plan = Column(JSON, nullable=True)  # ordered list of step strings
    verification_steps = Column(JSON, nullable=True)  # list of verification checks
    run_step_index = Column(Integer, default=0)  # how many plan steps have completed

    site = relationship("Site", back_populates="incidents")
    remediation_runs = relationship("RemediationRun", back_populates="incident")

class Playbook(Base):
    __tablename__ = "playbooks"
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    trigger_conditions = Column(JSON, nullable=True)
    allowed_actions = Column(JSON, nullable=True)
    risk_level = Column(String, default="Low")  # Low, Medium, High
    verification_tests = Column(JSON, nullable=True)

    remediation_runs = relationship("RemediationRun", back_populates="playbook")

class RemediationRun(Base):
    __tablename__ = "remediation_runs"
    id = Column(String, primary_key=True, index=True)
    incident_id = Column(String, ForeignKey("incidents.id"))
    playbook_id = Column(String, ForeignKey("playbooks.id"))
    status = Column(String, default="Pending")  # Pending, Approved, Executing, Verifying, Success, Failed, Rolled Back
    approver = Column(String, nullable=True)  # "AI Agent" or User Name
    before_state = Column(JSON, nullable=True)
    after_state = Column(JSON, nullable=True)
    execution_log = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    incident = relationship("Incident", back_populates="remediation_runs")
    playbook = relationship("Playbook", back_populates="remediation_runs")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_or_agent = Column(String, nullable=False)
    action = Column(String, nullable=False)
    target = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    previous_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)
    result = Column(String, default="Success")

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True)
    organization_id = Column(String, ForeignKey("organizations.id"))
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="Helpdesk")  # Admin, Engineer, Helpdesk, Viewer
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

def _add_missing_columns():
    """Additive migration for an existing SQLite file.

    `create_all` only creates missing *tables* — it will not add a new column to
    a table that already exists, so a database created by an earlier version
    would break on any newly-added field. This adds them in place, which keeps
    existing demo data intact.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        existing_columns = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing_columns:
                continue
            column_type = column.type.compile(dialect=engine.dialect)
            with engine.begin() as conn:
                conn.execute(text(
                    f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {column_type}'
                ))
            print(f"[migration] {table.name}.{column.name} added")


def init_db():
    Base.metadata.create_all(bind=engine)
    _add_missing_columns()
