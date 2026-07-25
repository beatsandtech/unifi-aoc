import requests, time, json
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Get the latest incident
res = requests.get("http://localhost:8000/api/incidents")
incidents = res.json()
if not incidents:
    print("No incidents")
    exit()

incident = incidents[0]
print(f"Incident: {incident['id']}")

# Login to get a token
login_data = {"username": "admin@alpha.com", "password": "admin123"}
r_login = requests.post("http://localhost:8000/api/auth/login", data=login_data)
token = r_login.json().get("access_token")

# Approve it
res = requests.post(
    f"http://localhost:8000/api/incidents/{incident['id']}/approve",
    headers={"Authorization": f"Bearer {token}"}
)
print("Approve response:", res.status_code, res.json())
if res.status_code != 200:
    exit()

run_id = res.json()["run_id"]

# Poll for run log
for _ in range(5):
    time.sleep(1)
    r_run = requests.get(f"http://localhost:8000/api/remediations/{run_id}")
    run = r_run.json()
    print("\n--- Log ---")
    print(run["execution_log"])
    if run["status"] == "Success":
        break
