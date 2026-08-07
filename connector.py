import time
import os
import random
import socket
import threading
import requests
import urllib3
from dotenv import load_dotenv

# Load configuration from local .env file
load_dotenv()

# Suppress self-signed cert warnings commonly found on local consoles
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

API_URL = os.environ.get("AOC_API_URL", "http://localhost:8000/api")
CONNECTOR_INTERVAL = int(os.environ.get("CONNECTOR_INTERVAL", "15"))
CONNECTOR_API_KEY = os.environ.get("CONNECTOR_API_KEY", "aoc-connector-local-key")

# UniFi Cloud Site Manager API Key
UI_CLOUD_API_KEY = os.environ.get("UI_CLOUD_API_KEY", "demo_key_override_me")

CLOUD_API_BASE = "https://api.ui.com/v1"


def classify_device_type(model: str, shortname: str) -> str:
    """Classify a device as gateway, switch, or ap based on model/shortname."""
    m = (shortname or model or "").upper()
    # Access Points
    if any(x in m for x in ["UAP", "U6", "U7", "NANO", "MESH", "BEACON", "INSTANT"]):
        return "ap"
    if "AC" in m and any(x in m for x in ["PRO", "LR", "IW", "LITE", "MESH", "EDU", "M2", "M5"]):
        return "ap"
    # Switches
    if any(x in m for x in ["USW", "USMINI", "USC8", "US24", "US48", "US16", "US8"]):
        return "switch"
    # Gateways / Routers
    if any(x in m for x in ["UDM", "UDR", "UXG", "UCG", "USG", "URF"]):
        return "gateway"
    # Fallback heuristics
    if "SWITCH" in m or "SW" in m:
        return "switch"
    if "AP" in m or "WIRELESS" in m:
        return "ap"
    return "gateway"


def format_mac(raw_mac: str) -> str:
    """Convert raw MAC like '1C0B8B4C834F' to '1C:0B:8B:4C:83:4F'."""
    raw = raw_mac.replace(":", "").replace("-", "").upper()
    if len(raw) == 12:
        return ":".join(raw[i:i+2] for i in range(0, 12, 2))
    return raw_mac


class UniFiAPIClient:
    """
    Fetches real device inventory from all managed sites via the UniFi Cloud API.
    Uses /v1/devices which returns per-device data grouped by host/console.
    """
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": UI_CLOUD_API_KEY,
            "Accept": "application/json"
        })

    def get_all_hosts_with_devices(self):
        """
        Fetch all devices grouped by host (console/site) from /v1/devices.
        Returns list of host objects each containing a 'devices' array.
        """
        try:
            res = self.session.get(f"{CLOUD_API_BASE}/devices", timeout=15)
            if res.status_code == 200:
                return res.json().get("data", [])
            else:
                print(f"[UniFi Cloud API] Failed. HTTP {res.status_code}: {res.text[:200]}")
                return []
        except Exception as e:
            print(f"[UniFi Cloud API] Error fetching devices: {e}")
            return []

    def cycle_poe_port(self, site_id: str, switch_mac: str, port_idx: int) -> bool:
        """Executes switch PoE power cycle command via Cloud Proxy."""
        try:
            payload = {"mac": switch_mac, "port_idx": port_idx}
            res = self.session.post(
                f"{CLOUD_API_BASE}/sites/{site_id}/devices/{switch_mac}/commands/poe-cycle",
                json=payload, timeout=10
            )
            print(f"[UniFi Cloud API] PoE cycle on {switch_mac} port {port_idx} -> HTTP {res.status_code}")
            return res.status_code == 200
        except Exception as e:
            print(f"[UniFi Cloud API] Error sending PoE command: {e}")
            return False


def start_syslog_receiver():
    """Background UDP Syslog Receiver on port 5140."""
    syslog_port = 5140
    print(f"[Syslog Ingestion] Starting background UDP listener on port {syslog_port}...")
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", syslog_port))
    while True:
        try:
            data, addr = sock.recvfrom(2048)
            msg = data.decode("utf-8", errors="ignore")
            print(f"[Syslog Ingestion] Received from {addr[0]}: {msg}")
            requests.post(f"{API_URL}/connector/syslog", json={
                "ip": addr[0], "message": msg
            }, headers={"X-Connector-Key": CONNECTOR_API_KEY}, timeout=3)
        except Exception:
            time.sleep(1)


def run_telemetry_loop():
    client = UniFiAPIClient()
    print("[Connector] UniFi Cloud API Connector service loop active.")

    is_live_configured = bool(UI_CLOUD_API_KEY) and UI_CLOUD_API_KEY != "demo_key_override_me"
    if is_live_configured:
        print("[Connector] Detected live Cloud API key. Fetching real device inventory...")

    while True:
        try:
            synced_sites = []
            aggregated_devices = []

            if is_live_configured:
                hosts = client.get_all_hosts_with_devices()

                if hosts:
                    print(f"[Connector] Discovered {len(hosts)} managed consoles/sites.")
                    for host in hosts:
                        host_id = host.get("hostId", "")
                        # hostName is the real customer/site name (e.g. "Calloway Gateway", "1st Choice Home Health Care")
                        site_name = host.get("hostName", "Unknown Site")
                        # Derive a stable site_id from the hostId prefix
                        site_id = f"site_{host_id[:12].replace(':', '').lower()}"

                        synced_sites.append({"id": site_id, "name": site_name})

                        devices = host.get("devices", [])
                        print(f"  [{site_name}] {len(devices)} device(s)")

                        for d in devices:
                            raw_mac = d.get("mac", "")
                            mac = format_mac(raw_mac)
                            model = d.get("model", "Unknown")
                            shortname = d.get("shortname", model)
                            dev_type = classify_device_type(model, shortname)
                            status_raw = d.get("status", "unknown").lower()
                            status = "Online" if status_raw == "online" else "Offline"

                            device_record = {
                                "mac": mac,
                                "name": d.get("name") or f"{model} ({mac})",
                                "model": model,
                                "type": dev_type,
                                "status": status,
                                "site_id": site_id,
                                "ip": d.get("ip", ""),
                                "firmware": d.get("version", ""),
                                "firmware_status": d.get("firmwareStatus", ""),
                                "is_console": d.get("isConsole", False),
                                "uptime_since": d.get("startupTime", ""),
                                "adopted": d.get("adoptionTime", ""),
                                "note": d.get("note", ""),
                            }
                            aggregated_devices.append(device_record)
                            print(f"    [{dev_type:8}] {device_record['name']:<30} | {model:<20} | {mac} | {d.get('ip','?'):<16} | {status} | FW {d.get('version','?')}")
                else:
                    print("[Connector] WARNING: No managed devices returned. Check API key scope.")

            # Fallback to simulation if no live data
            if not synced_sites:
                if not is_live_configured:
                    print("[Connector] No live Cloud API Key configured. Using simulation data.")
                synced_sites = [
                    {"id": "site_acme_hq", "name": "Acme HQ"},
                    {"id": "site_stark_tower", "name": "Stark Tower"}
                ]
                aggregated_devices = [
                    {"mac": "00:11:22:33:44:77", "name": "Lobby AP", "model": "U6-Pro", "type": "ap",
                     "status": "Online", "site_id": "site_acme_hq", "ip": "192.168.1.10",
                     "firmware": "6.5.28", "firmware_status": "upToDate"},
                    {"mac": "AA:BB:CC:DD:EE:33", "name": "Exec AP", "model": "U6-Pro", "type": "ap",
                     "status": "Offline", "site_id": "site_stark_tower", "ip": "192.168.1.11",
                     "firmware": "6.5.28", "firmware_status": "upToDate"},
                ]

            # Push full inventory to backend
            res = requests.post(f"{API_URL}/connector/sync", json={
                "sites": synced_sites,
                "devices": aggregated_devices
            }, headers={"X-Connector-Key": CONNECTOR_API_KEY}, timeout=10)
            if res.status_code == 200:
                r = res.json()
                print(f"[Connector] Synced {r.get('synced_sites', 0)} sites, {r.get('synced_devices', 0)} devices -> AOC backend.")
            else:
                print(f"[Connector] Error syncing: HTTP {res.status_code}")

        except Exception as e:
            print(f"[Connector] Loop error: {e}")
        time.sleep(CONNECTOR_INTERVAL)


if __name__ == "__main__":
    syslog_thread = threading.Thread(target=start_syslog_receiver, daemon=True)
    syslog_thread.start()
    run_telemetry_loop()
