import requests, json
r = requests.get("http://localhost:8000/api/sites")
sites = r.json()
site_id = next((s["id"] for s in sites if s["name"] == "Calloway Gateway"), sites[0]["id"])

print(f"Simulating incident on site {site_id} (Calloway Gateway)")
r_sim = requests.post("http://localhost:8000/api/simulate/incident", json={"type": "switch_flap", "site_id": site_id})
print("Simulate result:", r_sim.status_code, r_sim.json())

r_incidents = requests.get("http://localhost:8000/api/incidents")
print("\nActive Incidents:", json.dumps(r_incidents.json()[:1], indent=2))
