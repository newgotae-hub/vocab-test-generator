#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/.cloudflare-pages"

copy_path() {
    local relative_path="$1"
    if [ ! -e "$ROOT_DIR/$relative_path" ]; then
        return 0
    fi
    mkdir -p "$(dirname "$OUT_DIR/$relative_path")"
    cp -a "$ROOT_DIR/$relative_path" "$OUT_DIR/$relative_path"
}

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/assets"

for relative_path in \
    functions/private_data \
    auth \
    author \
    blog \
    cards \
    contact \
    dashboard \
    game \
    generator \
    mypage \
    ranked \
    signup \
    travel \
    src \
    stats \
    test
do
    copy_path "$relative_path"
done

for relative_path in \
    assets/docx \
    assets/fonts \
    assets/images
do
    copy_path "$relative_path"
done

for relative_path in \
    _redirects \
    ads.txt \
    favicon.svg \
    index.html \
    main.js \
    oxbridge-partners-black-on-white.svg \
    robots.txt \
    rss.xml \
    sitemap.xml \
    style.css
do
    copy_path "$relative_path"
done
