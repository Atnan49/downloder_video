#!/bin/sh
set -e

echo "=== Starting Video Downloader Service ==="

# Tentukan binary bgutil-pot yang tersedia
if command -v bgutil-pot >/dev/null 2>&1; then
    BGUTIL_BIN="bgutil-pot"
elif [ -x /usr/bin/bgutil-pot ]; then
    BGUTIL_BIN="/usr/bin/bgutil-pot"
else
    BGUTIL_BIN=""
fi

if [ -n "$BGUTIL_BIN" ]; then
    echo "[PO-TOKEN] Starting $BGUTIL_BIN server on 127.0.0.1:4416..."
    # WAJIB pakai subcommand 'server' - tanpa ini binary jalan di mode CLI dan langsung exit
    "$BGUTIL_BIN" server --host 127.0.0.1 --port 4416 &
    BGUTIL_PID=$!

    # Poll sampai server beneran siap, bukan blind sleep
    i=0
    until wget -q -O- http://127.0.0.1:4416/ping >/dev/null 2>&1; do
        i=$((i + 1))
        if [ "$i" -ge 10 ]; then
            echo "[PO-TOKEN] WARNING: server belum merespons setelah 10 detik. Cek proses (PID $BGUTIL_PID):"
            kill -0 "$BGUTIL_PID" 2>/dev/null && echo "  -> proses masih jalan, mungkin cuma lambat start" || echo "  -> proses SUDAH MATI, cek log di atas untuk error"
            break
        fi
        sleep 1
    done

    if [ "$i" -lt 10 ]; then
        echo "[PO-TOKEN] Server siap setelah ${i}s."
    fi
else
    echo "[PO-TOKEN] WARNING: binary bgutil-pot tidak ditemukan di image. yt-dlp akan jalan tanpa PO Token (download YouTube berisiko gagal)."
fi

# Jalankan server utama. exec supaya sinyal SIGTERM dari Render diteruskan langsung ke node.
echo "[SERVER] Starting Node.js Express Application..."
exec node server/index.js