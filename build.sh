#!/bin/bash
# Build script for Linux/macOS
# Generates static files and prepares for Cloudflare Pages deployment

echo ""
echo "========================================"
echo "Building Personal Scheduler"
echo "========================================"
echo ""

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "Error: Go is not installed"
    exit 1
fi

# Create dist directory
rm -rf dist
mkdir -p dist

echo "[1/3] Building Go binary..."
go build -o main

if [ $? -ne 0 ]; then
    echo "Error: Go build failed"
    exit 1
fi

echo "[2/3] Generating static files..."

# Start the server in background with timeout
timeout 8 ./main &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Generate static HTML using curl
echo "Generating index.html..."
curl -s http://localhost:3001 > dist/index.html 2>/dev/null || echo "Warning: Could not generate index.html"

# Copy static assets
echo "Copying static assets..."
cp -r static dist/

# Copy Cloudflare config files
echo "Copying Cloudflare configuration..."
[ -f _headers ] && cp _headers dist/
[ -f _redirects ] && cp _redirects dist/

# Kill the server process if still running
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

echo ""
echo "========================================"
echo "Build successful!"
echo "========================================"
echo ""
echo "Output directory: dist/"
