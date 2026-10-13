#!/usr/bin/env bash
# Build the macOS arm64 DMG.
#
# Signing:
#   - Formal signing (CSC_LINK / APPLE_ID / CSC_NAME) -> electron-builder signs
#     during packaging (Developer ID).
#   - Otherwise -> disable cert auto-discovery (so a stray keychain cert can't
#     break the build); the afterPack hook then ad-hoc signs the .app.
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm run build:css

if [ -n "${CSC_LINK:-}${APPLE_ID:-}${CSC_NAME:-}" ]; then
  echo "[sign] formal signing configured; electron-builder will sign"
else
  echo "[sign] no formal signing; ad-hoc signing after pack"
  export CSC_IDENTITY_AUTO_DISCOVERY=false
fi

# --publish never: releases are published by CI (softprops/action-gh-release),
# not by electron-builder's implicit CI auto-publish.
exec npx electron-builder --mac --arm64 --publish never
