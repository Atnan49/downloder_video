#!/bin/sh
set -e

echo "=== Starting Video Downloader Service ==="

# Check and start bgutil-pot PO Token Provider if installed
if command -v bgutil-pot >/dev/null 2>&1; then
    echo "[PO-TOKEN] Starting bgutil-pot server on port 4416 in background..."
    bgutil-pot &
elif [ -x /usr/bin/bgutil-pot ]; then
    echo "[PO-TOKEN] Starting /usr/bin/bgutil-pot server on port 4416 in background..."
    /usr/bin/bgutil-pot &
fi

# Give bgutil-pot a moment to bind port 4416
sleep 1

# Execute Node.js server
echo "[SERVER] Starting Node.js Express Application..."
exec node server/index.js
