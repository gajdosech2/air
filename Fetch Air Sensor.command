#!/bin/bash
# ─────────────────────────────────────────────
#  Tuya Air Sensor — Fetch & Upload
#  Double-click this file to run.
# ─────────────────────────────────────────────

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🌬️  Tuya Air Sensor — Fetch & Upload"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Activate virtual environment
source "$DIR/bin/activate"

# Run the fetch script
python3 "$DIR/tuya_fetch.py"
STATUS=$?

echo ""
if [ $STATUS -eq 0 ]; then
  echo "✅ Success!"
else
  echo "❌ Failed (exit code $STATUS)"
fi

echo ""
echo "Press any key to close..."
read -n 1 -s
