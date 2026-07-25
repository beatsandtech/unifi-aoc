import requests, time
time.sleep(3)
r = requests.post("http://localhost:8000/api/connector/reset")
print("Reset result:", r.status_code, r.json())
