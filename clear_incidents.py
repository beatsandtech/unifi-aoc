import requests
import sqlite3

# Using direct sqlite3 to clear the incidents, metrics, and remediation_runs
db_path = "unifi_aoc.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Clear incidents
cursor.execute("DELETE FROM incidents")
cursor.execute("DELETE FROM remediation_runs")
cursor.execute("DELETE FROM metrics")

conn.commit()
conn.close()

print("Cleared all incidents, remediation runs, and metrics from the database.")
