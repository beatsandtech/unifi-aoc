import requests, json
r = requests.get("http://localhost:8000/api/sites")
print("Sites:", json.dumps(r.json(), indent=2))
r2 = requests.get("http://localhost:8000/api/sites/" + r.json()[0]["id"])
print("\nFirst site details:", json.dumps(r2.json(), indent=2))
