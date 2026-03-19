# 2026-03-19 PDF Korean Rendering Fix

## Scope

- Generator PDF output only
- Covered test types: `영한시험`, `한영시험`, `혼합시험`
- Covered Korean text zones: title, meta labels (`이름`, `점수`), question body, answer sheet body

## Symptom

- Korean text in generated PDFs appeared broken or smeared.
- The issue was concentrated anywhere Korean glyphs were drawn.
- With the same `pdf-lib` and `fontkit` versions used by the app, a minimal reproduction of the legacy drawing logic failed during PDF save with:

```json
{"ok":false,"type":"RangeError","message":"\"value\" argument is out of bounds"}
```

## Root Cause

- Korean text was intentionally overdrawn to "boost" legibility.
- Section titles were also overdrawn to imitate bold text.
- For Korean text this meant the same glyphs were emitted multiple times with tiny `x` offsets.
- That overdraw interacted badly with font subsetting in `fontkit`, producing unstable Korean glyph output and, in the local reproduction, a save-time `RangeError`.
- The bundled `assets/fonts/NotoSansKR-Regular.ttf` file was also mislabeled: its internal family/subfamily was actually `Noto Sans KR Thin / Regular`.
- That meant the generator was using an extremely thin Korean font for normal body text, which could look washed out or nearly invisible in some PDF viewers.

## Code Changes

- Added a real Korean regular font asset at `assets/fonts/NotoSansKR-Regular.otf` and switched PDF generation to that file.
- Added loading of `assets/fonts/NotoSansKR-Bold.otf` alongside the existing regular Korean font.
- Replaced fake bold rendering with actual bold font embedding.
- Removed the Korean overdraw pass from PDF text rendering.
- Updated PDF font resolution so regular/bold Korean and Latin text use the correct font variant.
- Updated body text truncation to measure width with the resolved font actually used for drawing.
- Added versioned asset query strings for the PDF font fetch and generator `main.js` include so browsers do not keep serving stale cached PDF assets after deployment.
- Switched the PDF Korean font assets again to `assets/fonts/NanumGothic-Regular.ttf` and `assets/fonts/NanumGothic-Bold.ttf` to cut browser-side PDF generation cost from tens of megabytes per run to roughly 4MB total font payload.
- Fixed blob download handling so the object URL is not revoked immediately after `click()`, which could cancel the start of larger downloads in some browsers.

## Verification

- Syntax check passed:

```bash
node --check main.js
```

- Legacy overdraw reproduction failed as expected with the `RangeError` above.
- Fixed rendering path succeeded for a four-page synthetic PDF covering:
  - `영한시험`
  - `한영시험`
  - `혼합시험`
  - `정답지`

- Uploaded real-world sample PDFs were inspected by decompressing their content streams.
  - Text fill commands were black (`0 0 0 rg`), not white.
  - No invisible text render mode (`3 Tr`) was found.
  - The Korean font embedded by the old path resolved to `NotoSansKR-Thin`, confirming the mislabeled font asset issue.

- After switching to `assets/fonts/NotoSansKR-Regular.otf`, a fresh synthetic PDF embedded:
  - `NotoSansCJKkr-Regular-*`
  - `NotoSansCJKkr-Bold-*`

Result:

```json
{"ok":true,"pages":4,"bytes":91374}
```

- Local verification artifact written during the fix:
  - `output/pdf-korean-verification.pdf`

## Deployment

- This repository deploys to Cloudflare Pages.
- Pushing the fix to `main` triggers the configured deployment workflow.
