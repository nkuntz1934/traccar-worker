#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Clone traccar-web if not already present
if [ ! -d "frontend/traccar-web" ]; then
  echo "Cloning traccar-web..."
  mkdir -p frontend
  git clone --depth 1 https://github.com/traccar/traccar-web.git frontend/traccar-web
fi

cd frontend/traccar-web

# Install dependencies and build
echo "Installing dependencies..."
npm ci

echo "Building traccar-web..."
npm run build

# Copy build output
echo "Copying build output..."
cd "$SCRIPT_DIR"
rm -rf frontend/build
cp -r frontend/traccar-web/build frontend/build

# Replace server-side template variables that Traccar's Java backend normally injects
echo "Replacing template variables..."
sed -i '' 's/\${title}/Traccar/g' frontend/build/index.html
sed -i '' 's/\${description}/Traccar GPS Tracking System/g' frontend/build/index.html
sed -i '' 's/\${colorPrimary}/#1a237e/g' frontend/build/index.html
sed -i '' 's/\${title}/Traccar/g' frontend/build/manifest.webmanifest
sed -i '' 's/\${description}/Traccar GPS Tracking System/g' frontend/build/manifest.webmanifest
sed -i '' 's/\${colorPrimary}/#1a237e/g' frontend/build/manifest.webmanifest

echo "Frontend build complete: frontend/build/"
ls -la frontend/build/
