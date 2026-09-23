#!/usr/bin/env bash
# Ad-hoc sign the built .app so it can run locally when no formal signing is
# configured. If a Developer ID (CSC_LINK / APPLE_ID / CSC_NAME) is configured,
# electron-builder signs during packaging, so we skip here to avoid overwriting.
set -euo pipefail

APP_PATH="${1:?usage: adhoc-sign.sh <path-to-app>}"

if [ -z "${CSC_LINK:-}" ] && [ -z "${APPLE_ID:-}" ] && [ -z "${CSC_NAME:-}" ]; then
  echo "codesign (ad-hoc): $APP_PATH"
  CODE_SIGN_IDENTITY="" codesign --force --deep --sign - "$APP_PATH"
  codesign --verify --deep --strict "$APP_PATH"
else
  echo "codesign: skip ad-hoc (formal signing configured)"
fi
