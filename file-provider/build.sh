#!/usr/bin/env bash
# Builds the Sunkiss File Provider extension (build/SunkissFiles.appex) with the command-line
# Swift compiler: no Xcode project needed. The packaged app carries it inside, in
# Contents/PlugIns (see "macOS" > "files" in src-tauri/tauri.conf.json).
#
#   file-provider/build.sh                     for the app dev.sunkiss.editor, signed ad hoc
#   file-provider/build.sh some.other.app.id   for another app
#   SIGN_IDENTITY="Apple Development: …" file-provider/build.sh   signed with a real identity
#
# macOS only runs File Provider extensions that are properly signed, so ad hoc ("-") is for
# building and checking it compiles; see PROJECT.md for what a working one needs.
set -euo pipefail
cd "$(dirname "$0")"

APP_ID=${1:-dev.sunkiss.editor}
IDENTITY=${SIGN_IDENTITY:--}
OUT=build/SunkissFiles.appex

rm -rf "$OUT"
mkdir -p "$OUT/Contents/MacOS"
sed "s/APP_ID/$APP_ID/" Info.plist > "$OUT/Contents/Info.plist"

# An extension starts in NSExtensionMain (Foundation), not in a main() of its own.
# Plain `xcrun` picks the default SDK, the one made for this Swift compiler (the newest SDK
# can be ahead of the compiler that came with it).
xcrun swiftc -swift-version 5 -O \
  -module-name SunkissFiles \
  -target "$(uname -m)-apple-macos13.0" \
  -application-extension -parse-as-library \
  -Xlinker -e -Xlinker _NSExtensionMain \
  Sources/*.swift -o "$OUT/Contents/MacOS/SunkissFiles"

codesign --force --sign "$IDENTITY" --entitlements Entitlements.plist "$OUT"
echo "Built $OUT for $APP_ID (signed: $IDENTITY)"
