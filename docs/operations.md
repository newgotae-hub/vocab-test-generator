# Operations

## Local Preview
Run the site with a static server from the repo root:

```bash
python -m http.server 4173
```

Then open:
- `http://localhost:4173/`
- `http://localhost:4173/auth/`
- `http://localhost:4173/dashboard/`
- `http://localhost:4173/game/`
- `http://localhost:4173/ranked/`
- `http://localhost:4173/mypage/`

On Windows PowerShell, use `cmd /c npx ...` if direct `npx` is blocked by execution policy.

## Important Verification Commands
Syntax checks:

```bash
node --check src/app.js
node --check src/pages/dashboard.js
node --check src/pages/game.js
node --check src/pages/ranked.js
node --check src/lib/authGuard.js
node --check src/lib/vocabApi.js
node --check src/lib/leaderboard.js
node --check src/lib/previewMode.js
```

Prepare the Cloudflare Pages bundle:

```bash
bash ./scripts/prepare_cloudflare_pages.sh
```

Quick bundle smoke check:

```bash
python -m http.server 4337 --directory .cloudflare-pages
```

Open:
- `http://localhost:4337/`
- `http://localhost:4337/dashboard/`
- `http://localhost:4337/game/?preview=1`
- `http://localhost:4337/ranked/?preview=1`

## Dashboard and Game Verification
Minimum manual checks before deploy:

1. Confirm the protected-page nav shows `대시보드` and `게임`.
2. Confirm `/dashboard/` shows game hub CTAs without changing the existing site tone.
3. Confirm dashboard CTAs open:
   - `/game/`
   - `/game/?mode=survival_ladder`
   - `/ranked/`
4. Confirm `/game/` shows the pre-start selector before gameplay:
   - 모드 선택
   - 교재 선택
   - Basic / Advanced일 때만 파생어 ON/OFF
   - DAY 또는 범위 선택
5. Confirm starting a game reflects the selected 교재 / DAY / 파생어 범위.
6. Confirm `/game/` still links to `/ranked/`.
7. Confirm `/ranked/` still links back to `/game/`.

## ranked_runs Supabase Setup
The ranking backend depends on `public.ranked_runs`.

Migration files:
- [`supabase/migrations/20260322093000_create_ranked_runs.sql`](../supabase/migrations/20260322093000_create_ranked_runs.sql)
- [`supabase/migrations/20260322113000_expand_ranked_runs_modes.sql`](../supabase/migrations/20260322113000_expand_ranked_runs_modes.sql)

Recommended CLI flow:

```bash
cmd /c npx supabase login
cmd /c npx supabase link --project-ref ymzygbjihhttszijdkei
cmd /c npx supabase db push
cmd /c npx supabase migration list
```

Manual fallback:
- Open Supabase SQL Editor
- Run `20260322093000_create_ranked_runs.sql`
- Run `20260322113000_expand_ranked_runs_modes.sql`

Verification query:

```sql
select mode, count(*) as runs
from public.ranked_runs
group by mode
order by mode;
```

## Auto Deploy Rule
Production deploy is automatic.

- Workflow: [`.github/workflows/deploy-cloudflare-pages.yml`](../.github/workflows/deploy-cloudflare-pages.yml)
- Trigger: push to `main`
- Deploy command: `pages deploy .cloudflare-pages --branch=main`

That means the safe production path for this repo is:

1. verify locally
2. commit only relevant source/doc files
3. push to `main`
4. GitHub Actions deploys Cloudflare Pages automatically

## Files Not To Commit
Do not commit local tool artifacts unless there is a specific reason:
- `.playwright-cli/`
- `.wrangler/`
- `.cloudflare-pages/`
- `output/`
- `progress.md`
