# VOCA Plus (Phase 1)

## Local Run (Static Server)
Use a static server (do not use `file://`).

```bash
python3 -m http.server 4173
```

Open:
- `http://localhost:4173/`
- `http://localhost:4173/auth/`
- `http://localhost:4173/dashboard/`
- `http://localhost:4173/generator/`
- `http://localhost:4173/game/`
- `http://localhost:4173/ranked/`
- `http://localhost:4173/cards/`
- `http://localhost:4173/stats/`

## Supabase Auth
This project uses Supabase email/password auth for signup/login.

Reference:
- `https://supabase.com/docs/guides/local-development/cli/getting-started`

Client initialization is hardcoded in `src/lib/supabaseClient.js` using:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`)

For local Supabase CLI testing:
1. Start Supabase locally:

```bash
npx supabase start
```

2. Read local API URL and publishable/anon key:

```bash
npx supabase status -o env
```

3. Replace `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `src/lib/supabaseClient.js` for that local stack.
4. Run static server and open auth page:

```bash
python3 -m http.server 4173
```

- Open `http://localhost:4173/auth/`
- Sign up / sign in

Protected pages (`/dashboard/`, `/generator/`, `/test/`, `/cards/`, `/ranked/`, `/stats/`, `/game/`) require login and redirect to `/auth/` if no session exists.

## Static Hosting Notes (No Rewrites)
This MVP uses folder-based routes with `index.html` files:
- `/index.html`
- `/auth/index.html`
- `/dashboard/index.html`
- `/generator/index.html`
- `/game/index.html`
- `/ranked/index.html`
- `/cards/index.html`
- `/stats/index.html`

Because each route is a real folder page, direct access and browser refresh do not require History API rewrites.

## Deployment
Deploy as a plain static site from repository root.

If using Firebase Hosting:
- Set `public` to this project root (or a copied build folder containing the same files).
- Keep default static file serving for folder indexes.
- No rewrite rules are required for these routes.

## Assumptions
- Existing generator logic remains in `/main.js` and is loaded only on `/generator/`.
- Path-only compatibility fixes were applied in `/main.js` to use absolute paths (`/data/...`, `/assets/...`) so generator behavior is preserved after route split.
- No service worker is currently used in this repository.
