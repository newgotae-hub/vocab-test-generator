# VOCA Plus (Phase 1)

## Local Run
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
4. Start static server and open auth page:

```bash
python3 -m http.server 4173
```

- Open `http://localhost:4173/auth/`
- Sign up / sign in

Protected pages (`/dashboard/`, `/generator/`, `/test/`, `/cards/`, `/ranked/`, `/stats/`, `/game/`) require login and redirect to `/auth/` if no session exists.

## Static Hosting Notes
This MVP uses folder-based routes with `index.html` files:
- `/index.html`
- `/auth/index.html`
- `/dashboard/index.html`
- `/generator/index.html`
- `/game/index.html`
- `/ranked/index.html`
- `/cards/index.html`
- `/stats/index.html`

Because each route is a real folder page, direct access and browser refresh do not require SPA rewrites.

## Cloudflare Pages Functions
- API route is implemented at `functions/api/vocab/book.js`.
- The route path is `/api/vocab/book`.
- Vocabulary source data is bundled in `functions/private_data/vocabCsvData.js` and is not served as public static assets.

## Deployment
Deploy only to Cloudflare Pages.
- Production: custom domain `voca.plus`
- Optional preview: `*.pages.dev`
- Do not use Firebase Hosting deployment for this repository.

## Assumptions
- Existing generator logic remains in `/main.js` and is loaded only on `/generator/`.
- Vocabulary CSV rows are served only through authenticated endpoint `/api/vocab/book`.
- No service worker is currently used in this repository.
