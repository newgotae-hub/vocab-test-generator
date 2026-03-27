#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/.cloudflare-pages"

echo "Installing node modules..."
npm install

echo "Building with Vite..."
npm run build

echo "Setting up Cloudflare Pages output directory..."
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Copy Vite build output to Cloudflare Pages directory
cp -a "$ROOT_DIR/dist/." "$OUT_DIR/"

# Make sure Pages Functions are copied if they exist
if [ -d "$ROOT_DIR/functions" ]; then
    mkdir -p "$OUT_DIR/functions"
    cp -a "$ROOT_DIR/functions/." "$OUT_DIR/functions/"
fi

if [ -f "$ROOT_DIR/src/data/vocabCsvData.js" ]; then
    mkdir -p "$OUT_DIR/src/data"
    cp -a "$ROOT_DIR/src/data/vocabCsvData.js" "$OUT_DIR/src/data/vocabCsvData.js"
fi

# Additional static files not explicitly handled by Vite input chunks
# but needed by Cloudflare Pages root
for f in _redirects ads.txt robots.txt sitemap.xml rss.xml; do
    if [ -f "$ROOT_DIR/$f" ]; then
        cp -a "$ROOT_DIR/$f" "$OUT_DIR/"
    fi
done

if [ -d "$ROOT_DIR/assets/images" ]; then
    mkdir -p "$OUT_DIR/assets/images"
    cp -a "$ROOT_DIR/assets/images/." "$OUT_DIR/assets/images/"
fi

echo "Done! Ready for Cloudflare Pages deployment."
