#!/usr/bin/env python
"""
End-to-end test of backend: seed + login
"""
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import requests
import time

BASE_URL = "http://localhost:8000"

print("=" * 60)
print("UniFi Ops Center - Backend Test Suite")
print("=" * 60)
print()

# Test 1: Basic connectivity
print("[1/4] Testing basic connectivity...")
try:
    resp = requests.get(f"{BASE_URL}/", timeout=5)
    print(f"[OK] Backend responding (HTTP {resp.status_code})")
    print(f"  Service: {resp.json()['service']}")
except Exception as e:
    print(f"[FAIL] Backend not responding: {e}")
    exit(1)

print()

# Test 2: Seed data
print("[2/4] Seeding database...")
try:
    resp = requests.post(f"{BASE_URL}/api/seed", timeout=5)
    data = resp.json()
    print(f"[OK] Seed endpoint called")
    print(f"  Response: {data['message']}")
except Exception as e:
    print(f"[FAIL] Seed failed: {e}")
    exit(1)

print()
time.sleep(1)

# Test 3: Login with admin credentials
print("[3/4] Testing login with admin@alpha.com...")
try:
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        data={"username": "admin@alpha.com", "password": "admin123"},
        timeout=5
    )

    if resp.status_code == 200:
        data = resp.json()
        print(f"[OK] LOGIN SUCCESSFUL!")
        print(f"  Token: {data['access_token']}")
        print(f"  Role: {data['role']}")
        admin_token = data['access_token']
    else:
        print(f"[FAIL] Login failed (HTTP {resp.status_code})")
        print(f"  Response: {resp.text}")
        exit(1)
except Exception as e:
    print(f"[FAIL] Login request failed: {e}")
    exit(1)

print()

# Test 4: Test authenticated API call
print("[4/4] Testing authenticated API call...")
try:
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.get(f"{BASE_URL}/api/dashboard", headers=headers, timeout=5)

    if resp.status_code == 200:
        data = resp.json()
        print(f"[OK] Authenticated API call successful!")
        print(f"  Sites: {data['sites']['total']} total, {data['sites']['online']} online")
        print(f"  Incidents: {data['incidents']['open']} open, {data['incidents']['remediated']} resolved")
    else:
        print(f"[FAIL] API call failed (HTTP {resp.status_code})")
        print(f"  Response: {resp.text}")
        exit(1)
except Exception as e:
    print(f"[FAIL] API call failed: {e}")
    exit(1)

print()
print("=" * 60)
print("ALL TESTS PASSED - System is ready!")
print("=" * 60)
print()
print("Next steps:")
print("1. Open browser: http://localhost:3000")
print("2. Login with: admin@alpha.com / admin123")
print("3. Or use tech@alpha.com / tech123 for technician role")
print()
