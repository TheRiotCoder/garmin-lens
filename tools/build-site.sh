#!/bin/sh
# Builds dist/ = exactly the files a static host (Cloudflare Pages/Workers) should serve: the app + public/_headers. No tests, docs or tools.
# GitHub Pages serves the repo root directly (no build), so this is only needed for a Cloudflare-style deploy.
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist
cp index.html manifest.webmanifest sw.js dist/
cp -R css js icons dist/
cp public/_headers dist/_headers
echo "dist/ ready: $(find dist -type f | wc -l) files"
