#!/bin/bash
# Vercel build script: React app serves at root /
set -euo pipefail

echo "==> Building Nabeeh for Vercel..."

# Build the React app
cd dashboard
npm run build
cd ..

# Move dashboard output to dist/
rm -rf dist
mv dashboard/dist dist

echo "==> Build complete! Output in dist/"
echo "    Landing page: dist/index.html"
echo "    Dashboard:    dist/index.html (SPA routes)"
