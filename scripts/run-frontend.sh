#!/usr/bin/env bash
# Run from project root.
set -e
cd "$(dirname "$0")/../frontend"
if [ ! -d node_modules ]; then
  echo "Installing frontend deps..."
  npm install
fi
exec npm run dev
