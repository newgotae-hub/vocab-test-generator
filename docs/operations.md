# Operations

## Local Preview
Run a local static server from the repo root:

```bash
python -m http.server 4173
```

Important preview URLs:
- `http://localhost:4173/`
- `http://localhost:4173/game/?preview=1`
- `http://localhost:4173/ranked/?preview=1`
- `http://localhost:4173/mypage/?preview=1`

`mypage` preview is local-only. It exists so we can verify the protected-page card layout without changing the real production auth flow.

## Syntax Checks
Run the minimum safety checks before deploy:

```bash
node --check src/app.js
node --check src/pages/game.js
node --check src/pages/mypage.js
node --check src/lib/authGuard.js
node --check src/lib/previewMode.js
node --check src/lib/vocabApi.js
```

## Cloudflare Pages Bundle
Prepare the deploy bundle:

```bash
"C:\Program Files\Git\bin\bash.exe" ./scripts/prepare_cloudflare_pages.sh
```

Preview the bundle locally:

```bash
python -m http.server 4337 --directory .cloudflare-pages
```

Bundle verification URLs:
- `http://localhost:4337/game/?preview=1`
- `http://localhost:4337/ranked/?preview=1`
- `http://localhost:4337/mypage/?preview=1`

## MyPage -> Game Verification
Before deploy, manually verify this exact flow:

1. Open `/mypage/?preview=1`.
2. Confirm the card area shows:
   - `랭킹 스프린트`
   - `생존 모드`
3. Confirm each card shows a one-line explanation.
4. Click a game card and confirm it opens `/game/?mode=...`.
5. Confirm the game page does not ask for mode again.
6. Confirm only the simple pre-start controls remain:
   - 교재
   - 범위(전체 범위 또는 DAY)
   - 파생어 ON/OFF for Basic / Advanced only
7. Confirm `Etymology` is selectable.
8. Press `Start` and confirm the first question appears.
9. Confirm there is no fatal console/runtime error.

## ranked_runs Supabase Note
Live ranking depends on `public.ranked_runs`.

Migration files:
- `supabase/migrations/20260322093000_create_ranked_runs.sql`
- `supabase/migrations/20260322113000_expand_ranked_runs_modes.sql`

If the table is missing, rankings can fall back locally but shared ranking will not be live.

## Auto Deploy Rule
Production deploy is automatic on push to `main`.

Workflow:
- `.github/workflows/deploy-cloudflare-pages.yml`

Safe release path:
1. verify locally
2. stage only relevant source/doc files
3. commit
4. `git push origin HEAD:main`
5. GitHub Actions deploys Cloudflare Pages automatically

## Do Not Commit
Do not commit local tool artifacts unless absolutely needed:
- `.playwright-cli/`
- `.wrangler/`
- `.cloudflare-pages/`
- `output/`
- `progress.md`
