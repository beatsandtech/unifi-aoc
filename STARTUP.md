# UniFi Ops Center — Quick Start Guide

## Prerequisites

✓ Python 3.11+  
✓ Node.js + npm  
✓ Dependencies installed (done in setup)

---

## 🚀 Start the App (2 Steps)

### **Step 1: Start Backend** (Terminal 1)

**Option A — Double-click the batch file:**
```
start-backend.bat
```

**Option B — Manual start:**
```powershell
cd "F:\Claude\My Projects\UniFi Autonomous Operations Redesign"
python main.py
```

**✓ Success:** You'll see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete
```

---

### **Step 2: Start Frontend** (Terminal 2)

**Option A — Double-click the batch file:**
```
start-frontend.bat
```

**Option B — Manual start:**
```powershell
cd "F:\Claude\My Projects\UniFi Autonomous Operations Redesign\frontend"
npm run dev
```

**✓ Success:** You'll see:
```
▲ Next.js 16.2.11
  ▼ Local:        http://localhost:3000
```

---

## 🔗 Open in Browser

**Once both are running, open:**
```
http://localhost:3000
```

---

## 🔑 Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@alpha.com` | `admin123` |
| Technician | `tech@alpha.com` | `tech123` |

---

## ✅ Test Workflow

1. **Login** as `admin@alpha.com`
2. Go to **Incident Center** → click any incident
3. Click **"Approve & Run"** button
4. Watch execution progress (2-3 seconds)
5. See incident move to "Resolved" status
6. Toggle to **Technician** role (sidebar)
7. Try approving an L4 incident → button disappears, only "Escalate" available
8. Explore other tabs (Dashboard, Site Explorer, Remediation Center, Reports)

---

## 🔍 Troubleshooting

### **Backend won't start**
- Error: `ModuleNotFoundError: No module named 'sqlalchemy'`
- Fix: Run in project root:
  ```powershell
  python -m pip install -r requirements.txt
  ```

### **Frontend won't start**
- Error: `command not found: npm`
- Fix: Install Node.js from https://nodejs.org
- Then run: `npm install` in the `frontend/` folder

### **Port already in use**
- Backend (8000): Kill existing process:
  ```powershell
  netstat -ano | findstr :8000
  taskkill /PID <PID> /F
  ```
- Frontend (3000): Same steps with port 3000

### **Blank page at localhost:3000**
- Check browser console (F12)
- Check backend logs — if you see 401/403 errors, the token isn't being sent
- Try clearing localStorage: `localStorage.clear()` in browser console, then reload

### **"Waiting for data" never completes**
- Backend may not be running
- Check http://localhost:8000/ in browser (should see JSON)
- Look at backend terminal for errors

---

## 📊 What to Expect

| View | What You'll See |
|------|-----------------|
| **Dashboard** | 6 KPI cards, active incidents list, site health bars |
| **Site Explorer** | Searchable table of all sites, click to drill down |
| **Site Detail** | WAN metrics, devices table, incidents at that site |
| **Incident Center** | Searchable table of incidents, click to see full details |
| **Incident Detail** | Full incident with evidence, diagnosis, plan, approval button |
| **Remediation Center** | Kanban board (Open → Awaiting → Running → Resolved) |
| **Reports** | Summary cards + metrics |

---

## 🛑 Stop the App

**Backend:** Click terminal, press `Ctrl+C`  
**Frontend:** Click terminal, press `Ctrl+C`

---

## 📝 Next Steps (After Testing)

- [x] Trigger simulated incidents (Simulate Incident button in top bar)
- [x] Add loading spinners / connectivity error banner
- [x] Improve error handling
- [ ] Add pagination for large tables
- [ ] Export reports as PDF

See [DEPLOYMENT.md](DEPLOYMENT.md) for pushing to GitHub and deploying to
Render (backend) + Netlify (frontend) for remote testing.

