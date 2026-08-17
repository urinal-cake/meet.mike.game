#!/bin/bash
# Build script: assembles the static site into dist/ for Cloudflare Pages.
# The site is fully static; this just copies templates and assets.

set -e

echo ""
echo "========================================"
echo "Building Personal Scheduler (static)"
echo "========================================"
echo ""

rm -rf dist
mkdir -p dist

echo "Copying index.html..."
cp templates/index.html dist/index.html

echo "Copying static assets..."
cp -r static dist/

echo "Copying admin pages..."
mkdir -p dist/admin
cp -r templates/admin/* dist/admin/

echo "Copying cancel page..."
cp templates/cancel.html dist/

echo "Copying reschedule page..."
cp templates/reschedule.html dist/

echo "Copying Cloudflare configuration..."
if [ -f _headers ]; then cp _headers dist/; fi
if [ -f _redirects ]; then cp _redirects dist/; fi
if [ -f _routes.json ]; then cp _routes.json dist/; fi

echo ""
echo "========================================"
echo "Build successful!"
echo "========================================"
echo ""
echo "Output directory: dist/"
