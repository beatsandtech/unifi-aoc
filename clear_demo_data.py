#!/usr/bin/env python
"""
Clear all demo/seed data from the database, keeping only the admin user and empty data structures.
Real data will be populated by the connector from UniFi Cloud API.
"""
import os
from dotenv import load_dotenv
from models import SessionLocal, Organization, Customer, Site, Device, Incident, RemediationRun, AuditLog, Playbook, Metric, User

load_dotenv()

db = SessionLocal()

try:
    print("Clearing demo data from database...")
    print()

    # Count before
    org_count = db.query(Organization).count()
    cust_count = db.query(Customer).count()
    site_count = db.query(Site).count()
    device_count = db.query(Device).count()
    incident_count = db.query(Incident).count()
    remediation_count = db.query(RemediationRun).count()
    audit_count = db.query(AuditLog).count()

    print(f"Before cleanup:")
    print(f"  Organizations: {org_count}")
    print(f"  Customers: {cust_count}")
    print(f"  Sites: {site_count}")
    print(f"  Devices: {device_count}")
    print(f"  Incidents: {incident_count}")
    print(f"  Remediations: {remediation_count}")
    print(f"  Audit logs: {audit_count}")
    print()

    # Clear all demo data (keep users)
    db.query(RemediationRun).delete()
    db.query(AuditLog).delete()
    db.query(Metric).delete()
    db.query(Incident).delete()
    db.query(Device).delete()
    db.query(Site).delete()
    db.query(Customer).delete()
    db.query(Organization).delete()
    db.query(Playbook).delete()
    db.commit()

    print(f"After cleanup:")
    print(f"  Organizations: {db.query(Organization).count()}")
    print(f"  Customers: {db.query(Customer).count()}")
    print(f"  Sites: {db.query(Site).count()}")
    print(f"  Devices: {db.query(Device).count()}")
    print(f"  Incidents: {db.query(Incident).count()}")
    print(f"  Remediations: {db.query(RemediationRun).count()}")
    print(f"  Audit logs: {db.query(AuditLog).count()}")
    print(f"  Users: {db.query(User).count()}")
    print()
    print("✅ All demo data cleared. Real data will be populated by the connector.")

except Exception as e:
    print(f"❌ Error: {e}")
    db.rollback()
finally:
    db.close()
