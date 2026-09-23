#!/usr/bin/env bash
# Build the macOS arm64 DMG and sign it automatically:
#   - If CSC_LINK is set (CI), let electron-builder import and use that cert.
#   - Else if a "Developer ID Application" identity exists in the keychain, use it.
#   - Else build unsigned (disable auto-discovery so a stray cert can't break the build).
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm run build:css

IDENTITY="${CSC_NAME:-}"
if [ -z "$IDENTITY" ] && [ -z "${CSC_LINK:-}" ]; then
  IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null \
    | grep "Developer ID Application" \
    | head -1 \
    | sed -E 's/^[^"]*"([^"]+)".*$/\1/')" || true
fi

if [ -n "$IDENTITY" ]; then
  echo "[sign] using identity: $IDENTITY"
  export CSC_NAME="$IDENTITY"
else
  echo "[sign] no Developer ID found; building unsigned"
  export CSC_IDENTITY_AUTO_DISCOVERY=false
fi

exec npx electron-builder --mac --arm64
