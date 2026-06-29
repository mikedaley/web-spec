#!/usr/bin/env bash
# ============================================================================
#  release-tauri.sh — Build, sign, notarize, and package SpectrEm.app into a
#                     signed + stapled DMG for distribution outside the App Store.
# ----------------------------------------------------------------------------
#  Reuses the existing notarytool keychain profile (default: "mmr-notary"),
#  which is account/team-level and works for any of your apps.
#
#  ONE-TIME SETUP (already done on this Mac via the MMR project):
#    - "Developer ID Application" certificate installed in the keychain.
#    - Notarytool credentials stored:
#        xcrun notarytool store-credentials "mmr-notary" \
#          --apple-id <apple-id> --team-id PJNBHRUE79 --password <app-specific-pw>
#
#  USAGE:
#    ./scripts/release-tauri.sh
#
#  OVERRIDABLE ENV VARS (defaults shown):
#    NOTARY_PROFILE=mmr-notary   # keychain profile from `notarytool store-credentials`
#    SKIP_NOTARIZE=0             # set to 1 to build + sign + DMG only (smoke test;
#                                # result will NOT pass Gatekeeper when downloaded)
#    TARGET=                     # set to "universal-apple-darwin" for a universal
#                                # binary (needs both rust targets installed)
# ============================================================================
set -euo pipefail

# --- Project ---------------------------------------------------------------
APP_NAME="SpectrEm"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- Configurable ----------------------------------------------------------
NOTARY_PROFILE="${NOTARY_PROFILE:-mmr-notary}"
SKIP_NOTARIZE="${SKIP_NOTARIZE:-0}"
TARGET="${TARGET:-}"

# --- Computed paths --------------------------------------------------------
if [ -n "${TARGET}" ]; then
    BUNDLE_DIR="${PROJECT_DIR}/src-tauri/target/${TARGET}/release/bundle"
else
    BUNDLE_DIR="${PROJECT_DIR}/src-tauri/target/release/bundle"
fi
APP_PATH="${BUNDLE_DIR}/macos/${APP_NAME}.app"
OUT_DIR="${PROJECT_DIR}/src-tauri/target/dist"
NOTARY_ZIP="${OUT_DIR}/${APP_NAME}-notarize.zip"
DMG_STAGING="${OUT_DIR}/dmg-staging"
DMG_PATH="${OUT_DIR}/${APP_NAME}.dmg"

# --- Output helpers --------------------------------------------------------
log()  { printf "\n\033[1;34m▸ %s\033[0m\n" "$*"; }
ok()   { printf "\033[1;32m  ✓ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m  ! %s\033[0m\n" "$*"; }
err()  { printf "\n\033[1;31m✗ %s\033[0m\n" "$*" >&2; }

# --- Prerequisite checks ---------------------------------------------------
log "Checking prerequisites"
for cmd in npm xcrun hdiutil codesign security ditto; do
    command -v "$cmd" >/dev/null || { err "Missing required command: $cmd"; exit 1; }
done
ok "All required tools present"

if ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
    err "No 'Developer ID Application' certificate in the keychain."
    exit 1
fi
SIGNING_IDENTITY="$(security find-identity -v -p codesigning \
    | grep "Developer ID Application" | head -1 \
    | sed -E 's/.*"(.*)".*/\1/')"
ok "Signing identity: ${SIGNING_IDENTITY}"

if [ "${SKIP_NOTARIZE}" = "0" ]; then
    if ! xcrun notarytool history --keychain-profile "${NOTARY_PROFILE}" >/dev/null 2>&1; then
        err "Notarytool profile '${NOTARY_PROFILE}' not found."
        err "Create it with:"
        err "  xcrun notarytool store-credentials \"${NOTARY_PROFILE}\" \\"
        err "    --apple-id <apple-id> --team-id PJNBHRUE79 --password <app-specific-pw>"
        exit 1
    fi
    ok "Notarytool profile '${NOTARY_PROFILE}' is configured"
fi

# --- Build + sign the .app (Tauri signs via bundle.macOS.signingIdentity) --
log "Building & signing ${APP_NAME}.app (release)"
BUILD_ARGS=(build --bundles app)
[ -n "${TARGET}" ] && BUILD_ARGS+=(--target "${TARGET}")
( cd "${PROJECT_DIR}" && npm run tauri -- "${BUILD_ARGS[@]}" )

[ -d "${APP_PATH}" ] || { err "App not found at ${APP_PATH}"; exit 1; }
ok "Built: ${APP_PATH}"

# --- Verify signature + hardened runtime -----------------------------------
log "Verifying code signature"
codesign --verify --deep --strict --verbose=2 "${APP_PATH}" 2>&1 | sed 's/^/  /'
# Capture first (avoids pipefail + grep -q SIGPIPE false-negative).
CODESIGN_INFO="$(codesign -d --verbose=4 "${APP_PATH}" 2>&1)"
if ! grep -q "flags=.*runtime" <<<"${CODESIGN_INFO}"; then
    err "App is NOT signed with the hardened runtime — notarization will be rejected."
    err "Check that bundle.macOS.signingIdentity is set to a Developer ID in tauri.conf.json."
    exit 1
fi
ok "Signature valid, hardened runtime enabled"

# --- Notarize + staple the .app --------------------------------------------
mkdir -p "${OUT_DIR}"
if [ "${SKIP_NOTARIZE}" = "0" ]; then
    log "Zipping app for notarization"
    rm -f "${NOTARY_ZIP}"
    ditto -c -k --keepParent "${APP_PATH}" "${NOTARY_ZIP}"
    ok "Created: ${NOTARY_ZIP}"

    log "Submitting app to Apple Notary Service (1–5 min)"
    xcrun notarytool submit "${NOTARY_ZIP}" \
        --keychain-profile "${NOTARY_PROFILE}" --wait \
        | tee "${OUT_DIR}/notary-app.log"
    if ! grep -q "status: Accepted" "${OUT_DIR}/notary-app.log"; then
        SUBMISSION_ID="$(grep -Eo 'id: [0-9a-f-]+' "${OUT_DIR}/notary-app.log" | head -1 | awk '{print $2}')"
        err "App notarization failed. Inspect with:"
        err "  xcrun notarytool log ${SUBMISSION_ID} --keychain-profile ${NOTARY_PROFILE}"
        exit 1
    fi
    ok "App notarization accepted"

    log "Stapling ticket to the app"
    xcrun stapler staple "${APP_PATH}"
    xcrun stapler validate "${APP_PATH}"
    ok "App stapled and validated"
else
    warn "Skipping notarization (SKIP_NOTARIZE=1)"
fi

# --- Build DMG from the (stapled) app --------------------------------------
log "Staging DMG contents"
rm -rf "${DMG_STAGING}"
mkdir -p "${DMG_STAGING}"
cp -R "${APP_PATH}" "${DMG_STAGING}/"
ln -s /Applications "${DMG_STAGING}/Applications"
ok "Staged: ${DMG_STAGING}"

log "Building DMG"
APP_VERSION="$(defaults read "${APP_PATH}/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo "1.0")"
rm -f "${DMG_PATH}"
hdiutil create \
    -volname "${APP_NAME} ${APP_VERSION}" \
    -srcfolder "${DMG_STAGING}" \
    -fs HFS+ -format UDBZ -ov \
    "${DMG_PATH}" | sed 's/^/  /'
ok "DMG created: ${DMG_PATH}"

# --- Sign DMG --------------------------------------------------------------
log "Signing DMG"
codesign --force --sign "${SIGNING_IDENTITY}" --timestamp "${DMG_PATH}"
codesign --verify --verbose=2 "${DMG_PATH}" 2>&1 | sed 's/^/  /'
ok "DMG signed"

# --- Notarize + staple DMG -------------------------------------------------
if [ "${SKIP_NOTARIZE}" = "0" ]; then
    log "Notarizing DMG"
    xcrun notarytool submit "${DMG_PATH}" \
        --keychain-profile "${NOTARY_PROFILE}" --wait \
        | tee "${OUT_DIR}/notary-dmg.log"
    if ! grep -q "status: Accepted" "${OUT_DIR}/notary-dmg.log"; then
        err "DMG notarization failed. Inspect the log above."
        exit 1
    fi
    ok "DMG notarization accepted"

    log "Stapling DMG"
    xcrun stapler staple "${DMG_PATH}"
    xcrun stapler validate "${DMG_PATH}"
    ok "DMG stapled and validated"
fi

# --- Done ------------------------------------------------------------------
printf "\n\033[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m\n"
printf "\033[1;32m Build complete.\033[0m\n\n"
printf "   App: %s\n" "${APP_PATH}"
printf "   DMG: %s\n" "${DMG_PATH}"
printf "\033[1;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m\n"
