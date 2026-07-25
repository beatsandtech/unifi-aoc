import os, requests, json

KEY = os.environ.get("UI_CLOUD_API_KEY", "")
if not KEY:
    raise SystemExit("Set UI_CLOUD_API_KEY in the environment before running this script.")
HEADERS = {"X-API-Key": KEY, "Accept": "application/json"}
BASE = "https://api.ui.com/v1"

# Fetch sites to get the siteId->hostId mapping
sites_r = requests.get(f"{BASE}/sites", headers=HEADERS, timeout=10)
sites = sites_r.json().get("data", [])

# Build hostId->siteId map
host_to_site = {}
for s in sites:
    host_to_site[s.get("hostId")] = {
        "siteId": s.get("siteId"),
        "siteName": s.get("meta", {}).get("desc") or s.get("meta", {}).get("name", "Unknown"),
    }

print(f"Sites ({len(sites)}):")
for s in sites:
    print(f"  {s['siteId']} -> name={s.get('meta',{}).get('name')} desc={s.get('meta',{}).get('desc')}")

# Fetch real devices
devices_r = requests.get(f"{BASE}/devices", headers=HEADERS, timeout=10)
device_hosts = devices_r.json().get("data", [])

print(f"\nDevice Hosts ({len(device_hosts)}):")
for h in device_hosts:
    host_id = h.get("hostId")
    site_info = host_to_site.get(host_id, {})
    print(f"  Host: {h.get('hostName')} | Site: {site_info.get('siteName','?')} | Devices: {len(h.get('devices',[]))}")
    for d in h.get("devices", []):
        shortname = d.get("shortname", d.get("model", "?"))
        # Determine type from shortname/model
        m = shortname.upper()
        if any(x in m for x in ["UAP","U6","U7","U6L","U6E","U6PRO","U6PLUS","NANO"]):
            dev_type = "ap"
        elif any(x in m for x in ["USW","US","USMINI","USC8","SWITCH","US24","US48"]):
            dev_type = "switch"
        else:
            dev_type = "gateway"
        mac_fmt = ":".join(d["mac"][i:i+2] for i in range(0, 12, 2))
        print(f"    [{dev_type}] {d.get('name')} | {d.get('model')} | MAC={mac_fmt} | IP={d.get('ip')} | {d.get('status')} | FW={d.get('version')}")
