#!/usr/bin/env bash
# Rebuild dist/DeadWaves-<version>-portable.exe (one exe, no install, no Godot).
# The Electron build runs in C:\Users\<you>\dead-waves-build (outside OneDrive, node_modules is big).
# First run copies node_modules from ~/boxer-drift-build when it exists (same Electron + steamworks.js),
# otherwise it runs npm install.
set -e
GAME="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$HOME/dead-waves-build"
mkdir -p "$BUILD/build"
cp "$GAME/tools/electron-main.js" "$BUILD/electron-main.js"
cp "$GAME/tools/steam-preload.js" "$BUILD/steam-preload.js"
cp "$GAME/tools/electron-package.json" "$BUILD/package.json"
[ -f "$GAME/icon.png" ] || node "$GAME/tools/make-icon.js"
cp "$GAME/icon.png" "$BUILD/build/icon.png"
cd "$BUILD"
if [ ! -d node_modules/electron-builder ]; then
  if [ -d "$HOME/boxer-drift-build/node_modules/electron-builder" ]; then
    cp -r "$HOME/boxer-drift-build/node_modules" "$BUILD/node_modules"
  else
    npm install --no-audit --no-fund
  fi
fi
rm -rf game && mkdir game && cp -r "$GAME/index.html" "$GAME/js" game/
npx electron-builder --win portable
VER=$(node -p "require('./package.json').version")
mkdir -p "$GAME/dist" && cp "dist/DeadWaves-$VER-portable.exe" "$GAME/dist/"
echo "built: $GAME/dist/DeadWaves-$VER-portable.exe"
