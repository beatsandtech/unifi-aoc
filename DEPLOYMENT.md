# Deploying for testing (GitHub + Render + Netlify)

The app is two services: the FastAPI backend (SQLite, stateful, needs a
persistent process) and the Next.js frontend (static/SSR, fine on Netlify).
Netlify cannot run the backend — no long-lived process, no writable disk for
the `.db` file — so the backend goes to Render and the frontend points at it
over an environment variable.

## 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <YOUR_REPO_URL>
git push -u origin main
```

## 2. Deploy the backend to Render

1. [render.com](https://render.com) → **New +** → **Blueprint**.
2. Connect the GitHub repo. Render reads [render.yaml](render.yaml) at the
   repo root and proposes a free web service named `unifi-aoc-backend`.
3. Click **Apply**. First deploy takes a few minutes (installs
   `requirements.txt`, then runs `python run-backend.py`).
4. Once live, copy the service URL — something like
   `https://unifi-aoc-backend.onrender.com`.
5. **Free-tier note:** the service spins down after ~15 minutes idle. The
   first request after that takes 30–60s to cold-start — expect a slow
   initial load, not a broken deploy, if the tester is the first hit in a while.
6. The database is SQLite on the instance's local disk, which is **ephemeral
   on the free tier** — it resets on redeploy or restart. This is expected:
   the frontend already calls `POST /api/seed` on every load, and seeding is
   idempotent, so the demo data reappears automatically.

## 3. Deploy the frontend to Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import
   an existing project** → connect the same GitHub repo.
2. Netlify should detect [netlify.toml](netlify.toml) (base directory
   `frontend`, `@netlify/plugin-nextjs`). If it doesn't, set manually:
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `frontend/.next`
3. **Before the first deploy**, go to **Site configuration → Environment
   variables** and add:
   - `NEXT_PUBLIC_API_URL` = the Render URL from step 2 (no trailing slash)

   This is required, not optional — Next.js inlines `NEXT_PUBLIC_*` values at
   build time, so the frontend won't pick up a Render URL set *after* the
   build. If you set it late, trigger **Deploys → Trigger deploy → Clear
   cache and deploy site**.
4. Deploy. Once live, open the Netlify URL — it should reach the Render
   backend and land on the login screen. The database starts empty; see
   "Getting data in" below.

## 4. Test login

| Role | Email | Password |
|---|---|---|
| Admin | `admin@alpha.com` | `admin123` |
| Technician | `tech@alpha.com` | `tech123` |

These work either way — with demo data seeded, or with live data, since
`/api/connector/sync` creates the same admin account automatically on first
sync.

## 5. Getting data in

**Demo data:** seeding is no longer automatic, so trigger it explicitly once:
`curl -X POST https://<your-render-url>/api/seed`.

**Live UniFi Cloud data:** set `UI_CLOUD_API_KEY` in the Render dashboard
(**Environment** tab — [render.yaml](render.yaml) declares it as a secret so
it won't prompt during blueprint apply, you add it after), then run
`connector.py` somewhere with outbound internet, pointed at the Render URL:

```bash
AOC_API_URL=https://<your-render-url>/api UI_CLOUD_API_KEY=<your key> python connector.py
```

This syncs real site/device inventory every 15s and raises real incidents
when a device goes offline — pure outbound HTTPS, works from anywhere
(a laptop, a small always-on VM, etc.).

**What doesn't work purely in the cloud:** real syslog-based detection.
UniFi devices push syslog via UDP to a fixed IP you configure on the
console — Render and Netlify are HTTP-only routing layers with no public
UDP ingress, so devices can't reach a Render-hosted `connector.py` for this.
If you want that later, it needs `connector.py` on a real VM with a public
IP (not a PaaS), or `connector.py` running on the same network as the UniFi
console with syslog pointed at its local IP. The offline-detection above
doesn't depend on this at all.

## Notes on this being a *test* deployment, not production

- CORS on the backend is wide open (`allow_origins=["*"]`) — fine for a
  shared test link, not for a real deployment with real customer data.
- Auth is a bearer token equal to the user's DB id, and passwords are stored
  in plaintext (`main.py`'s `verify_password` does a direct string compare).
  This was already true locally; it just matters more once the URL is public.
- The private GitHub repo keeps the source itself from being publicly
  browsable, but the *deployed app* is reachable by anyone with the Netlify
  URL unless you add Netlify's password-protection (available on paid plans)
  or an allowlist.
