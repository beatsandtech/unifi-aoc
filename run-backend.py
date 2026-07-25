#!/usr/bin/env python
"""
Simple backend launcher that ensures output is visible
"""
import sys
import os

# Force UTF-8 output so Windows' default cp1252 console encoding doesn't
# crash on non-ASCII characters (happens especially when output is
# redirected, e.g. double-clicking the .bat launcher).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
os.environ['PYTHONUNBUFFERED'] = '1'

# Load a local .env file (e.g. UI_CLOUD_API_KEY) before main.py/agents.py read
# os.environ — a no-op if .env doesn't exist, and on Render the platform sets
# real env vars directly so this has nothing to load.
from dotenv import load_dotenv
load_dotenv()

try:
    print("=" * 60)
    print("UniFi Autonomous Operations Center - Backend Startup")
    print("=" * 60)
    print()

    print("[1/3] Initializing database...")
    from models import init_db
    init_db()
    print("[OK] Database initialized")
    print()

    print("[2/3] Creating FastAPI app...")
    from main import app
    print("[OK] FastAPI app created")
    print()

    print("[3/3] Starting Uvicorn server...")
    print("-" * 60)
    import uvicorn
    # Render (and most PaaS hosts) inject PORT and expect a bind on 0.0.0.0;
    # local dev keeps the old 127.0.0.1:8000 defaults.
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
    )

except KeyboardInterrupt:
    print("\n\n[*] Server stopped by user")
    sys.exit(0)
except Exception as e:
    print(f"\n\n[ERROR] STARTUP ERROR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
