#!/usr/bin/env bash
# Boilerplate App — iOS build script (macOS bash)
#
# Produces:
#   - Release IPA → store-releases/ios/build/BoilerplateApp.ipa
#
# Prerequisites:
#   - macOS host with Xcode 15+ installed
#   - Apple Developer account; distribution certificate + provisioning profile installed in Keychain
#   - Frontend already built: npm run build --workspace=frontend
#   - Capacitor ios platform added: cd frontend && npx cap add ios
#
# Usage:
#   ./store-releases/ios/build-ios.sh
#   ./store-releases/ios/build-ios.sh --allow-dirty

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
ALLOW_DIRTY=0

for arg in "$@"; do
  case $arg in
    --allow-dirty) ALLOW_DIRTY=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

echo "==> Building iOS artifacts"
echo "    Repo root: $ROOT"

# Working-tree check
cd "$ROOT"
if [ "$ALLOW_DIRTY" -eq 0 ] && [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: Working tree is dirty. Commit or stash, or pass --allow-dirty." >&2
  exit 1
fi

SHA="$(git rev-parse HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BUILD_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "    Building from $BRANCH @ $SHA"

# Frontend build
echo "==> Building frontend dist"
(cd "$ROOT/frontend" && npm run build)

# Capacitor sync
echo "==> Syncing Capacitor ios platform"
(cd "$ROOT/frontend" && npx cap sync ios)

# Version bump
VERSION_NAME="$(node -p "require('$ROOT/frontend/package.json').version")"
BUILD_NUM="$(date +%s)"  # seconds since epoch — monotonic, large but acceptable
echo "    versionName=$VERSION_NAME  buildNum=$BUILD_NUM"

# Patch Info.plist
PLIST="$ROOT/frontend/ios/App/App/Info.plist"
if [ -f "$PLIST" ]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION_NAME" "$PLIST"
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUM" "$PLIST"
fi

# Build archive
mkdir -p "$BUILD_DIR"
WORKSPACE="$ROOT/frontend/ios/App/App.xcworkspace"
ARCHIVE_PATH="$BUILD_DIR/BoilerplateApp.xcarchive"

echo "==> Archiving"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme App \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  -destination "generic/platform=iOS" \
  archive

# Export IPA
EXPORT_OPTIONS="$SCRIPT_DIR/ExportOptions.plist"
if [ ! -f "$EXPORT_OPTIONS" ]; then
  echo "ERROR: Missing $EXPORT_OPTIONS. Create one with your team ID and provisioning profile name." >&2
  exit 1
fi

echo "==> Exporting IPA"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$BUILD_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS"

# Manifest
cat > "$SCRIPT_DIR/last-build.json" <<EOF
{
  "target": "ios",
  "versionName": "$VERSION_NAME",
  "buildNum": $BUILD_NUM,
  "gitSha": "$SHA",
  "gitBranch": "$BRANCH",
  "builtAt": "$BUILD_TIME",
  "builtBy": "$USER on $(hostname)",
  "ipaPath": "store-releases/ios/build/BoilerplateApp.ipa"
}
EOF

echo ""
echo "==> Done."
echo "    IPA:      $BUILD_DIR/BoilerplateApp.ipa"
echo "    Manifest: $SCRIPT_DIR/last-build.json"
echo ""
echo "Next: see store-releases/ios/PUBLISH_CHECKLIST.md before uploading to App Store Connect."
