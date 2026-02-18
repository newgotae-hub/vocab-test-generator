# VOCA Plus (Phase 1)

## Local Run (Static Server)
Use a static server (do not use `file://`).

```bash
python3 -m http.server 4173
```

Open:
- `http://localhost:4173/`
- `http://localhost:4173/dashboard/`
- `http://localhost:4173/generator/`
- `http://localhost:4173/game/`
- `http://localhost:4173/ranked/`
- `http://localhost:4173/cards/`
- `http://localhost:4173/stats/`

## Static Hosting Notes (No Rewrites)
This MVP uses folder-based routes with `index.html` files:
- `/index.html`
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
