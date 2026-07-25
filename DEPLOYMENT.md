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
   backend, auto-seed, and land on the login screen.

## 4. Test login

| Role | Email | Password |
|---|---|---|
| Admin | `admin@alpha.com` | `admin123` |
| Technician | `tech@alpha.com` | `tech123` |

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
