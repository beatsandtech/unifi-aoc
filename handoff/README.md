# Nocturne reskin — drop-in replacement

These files replace the same paths in `beatsandtech/unifi-aoc` (frontend only). Every fetch call, state variable, handler, and API route is untouched — only the visual layer (Tailwind classes → Nocturne tokens/components) changed.

## Files
- `frontend/src/app/globals.css` — Nocturne color/type/spacing tokens + `.btn` `.tag` `.card` `.input` `.table-nc` classes (mirrors the Nocturne design system used for the earlier prototype)
- `frontend/src/app/layout.tsx` — body now uses the Nocturne bg/text
- `frontend/src/app/login/page.tsx` — reskinned, same `/api/auth/login` flow
- `frontend/src/app/page.tsx` — reskinned, same 5 tabs (Operations, Topology, Playbooks, Reports, Access) wired to the same `/api/*` endpoints on `http://localhost:8000`

## Apply
Copy these four files over the matching paths in your repo, then `npm run dev` as usual — no backend changes needed.

## Design notes
- Severity/status color-coding was translated from red/amber/emerald/purple into the Nocturne mono-accent system: `tag-accent` (critical/resolved/active), `tag-outline` (warning/awaiting/escalated), `tag-neutral` (default/muted) — this keeps the app inside the bound design system instead of inventing new colors.
- Primary actions (Approve, Authorize, Diagnose) are now outlined-accent buttons per Nocturne's button spec, not filled.
- If you'd rather keep filled/colored severity buttons for faster NOC scanning, say so and I'll adjust — that's a one-file change now that it's all token-driven.
