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

# Make sure functions are copied if they exist
if [ -d "$ROOT_DIR/functions/private_data" ]; then
    mkdir -p "$OUT_DIR/functions/private_data"
    cp -a "$ROOT_DIR/functions/private_data/." "$OUT_DIR/functions/private_data/"
fi

# Additional static files not explicitly handled by Vite input chunks
# but needed by Cloudflare Pages root
for f in _redirects ads.txt robots.txt sitemap.xml rss.xml; do
    if [ -f "$ROOT_DIR/$f" ]; then
        cp -a "$ROOT_DIR/$f" "$OUT_DIR/"
    fi
done

echo "Done! Ready for Cloudflare Pages deployment."
