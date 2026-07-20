#!/usr/bin/env bash
set -e
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

# ─── Config ─────────────────────────────────────────────────────
RELEASE_DIR="$PROJECT_ROOT/dist-release"
BUILD_TYPE="${1:-release}"   # "release" or "debug"
SKIP_FRONTEND="${SKIP_FRONTEND:-}"
VERSION="$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')"

# ─── Detect OS ─────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Linux*)  PLATFORM="linux" ;;
  Darwin*) PLATFORM="macos" ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
  *)       echo "Unknown OS: $OS"; exit 1 ;;
esac

echo "═══════════════════════════════════════════════════════════════"
echo "  Dingo v$VERSION — Build All ($BUILD_TYPE)"
echo "  Platform: $PLATFORM"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─── Prerequisites ──────────────────────────────────────────────
command -v node  >/dev/null 2>&1 || { echo "ERROR: Node.js required"; exit 1; }
command -v rustc >/dev/null 2>&1 || { echo "ERROR: Rust required"; exit 1; }
command -v pnpm >/dev/null 2>&1  || { echo "Installing pnpm..."; npm install -g pnpm; }

export PATH="$HOME/.cargo/bin:$PATH"
mkdir -p "$RELEASE_DIR"

# ─── Step 1: Frontend ──────────────────────────────────────────
if [ -z "$SKIP_FRONTEND" ]; then
  echo "[1/4] Installing frontend dependencies..."
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install

  echo "[2/4] Building frontend..."
  pnpm build
  echo "       → dist/"
else
  echo "[1/4] [SKIP] Frontend build"
fi

# ─── Helpers ────────────────────────────────────────────────────
build_desktop() {
  local bundles="$1"
  echo "[3/4] Building desktop ($PLATFORM)..."
  cd "$PROJECT_ROOT/src-tauri"
  if [ "$BUILD_TYPE" = "release" ]; then
    if [ -n "$bundles" ]; then
      pnpm tauri build --bundles "$bundles"
    else
      pnpm tauri build
    fi
  else
    cargo build
    echo "       (debug — no bundle created)"
  fi
  cd "$PROJECT_ROOT"
}

copy_desktop_artifacts() {
  local bundle_dir="$PROJECT_ROOT/src-tauri/target/release/bundle"
  if [ -d "$bundle_dir" ]; then
    find "$bundle_dir" -type f \( -name "*.deb" -o -name "*.AppImage" -o -name "*.dmg" -o -name "*.exe" -o -name "*.msi" \) \
      -exec cp {} "$RELEASE_DIR/" \;
    echo "       → $(ls -1 "$RELEASE_DIR" 2>/dev/null | wc -l) artifact(s) copied to $RELEASE_DIR"
    ls -1h "$RELEASE_DIR" 2>/dev/null | sed 's/^/         /'
  fi
}

build_android() {
  if ! command -v cargo-ndk &>/dev/null; then
    echo "       cargo-ndk not found — installing..."
    cargo install cargo-ndk
  fi

  # Auto-detect NDK if not set
  if [ -z "$ANDROID_NDK_HOME" ]; then
    local ndk_root
    case "$PLATFORM" in
      windows) ndk_root="$HOME/Android/Sdk/ndk" ;;
      linux)   ndk_root="$HOME/Android/Sdk/ndk" ;;
      macos)   ndk_root="$HOME/Library/Android/Sdk/ndk" ;;
    esac
    local ndk_dir
    ndk_dir="$(ls -1d "$ndk_root"/*/ 2>/dev/null | sort -V | tail -1 | sed 's/\/$//')"
    if [ -n "$ndk_dir" ]; then
      export ANDROID_NDK_HOME="$ndk_dir"
      echo "       Detected NDK: $ANDROID_NDK_HOME"
    else
      echo "       WARNING: ANDROID_NDK_HOME not set and no NDK found at $ndk_root"
    fi
  fi
  # Also ensure ANDROID_HOME
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"

  local build_flag=""
  local build_type_dir="debug"
  if [ "$BUILD_TYPE" = "release" ]; then
    build_flag="--release"
    build_type_dir="release"
  fi

  echo "[4/4] Building Android .so ($BUILD_TYPE)..."
  cd "$PROJECT_ROOT/src-tauri"
  cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -t x86 build --lib $build_flag
  echo "       .so files built for all 4 ABIs"

  # Copy frontend assets
  echo "       Copying frontend assets..."
  cp -r "$PROJECT_ROOT/dist/"* "$PROJECT_ROOT/src-tauri/gen/android/app/src/main/assets/"

  # Build APK
  echo "       Building APK..."
  cd "$PROJECT_ROOT/src-tauri/gen/android"
  if [ "$BUILD_TYPE" = "release" ]; then
    ./gradlew assembleRelease 2>&1 | tail -5 || {
      echo "       Release build failed — falling back to debug"
      ./gradlew assembleDebug 2>&1 | tail -5
    }
  else
    ./gradlew assembleDebug 2>&1 | tail -5
  fi

  # Copy APK to release dir
  find "$PROJECT_ROOT/src-tauri/gen/android/app/build/outputs/apk" \
    -name "*.apk" -exec cp {} "$RELEASE_DIR/" \;
  echo "       APK(s) copied to $RELEASE_DIR"
  ls -1h "$RELEASE_DIR"/*.apk 2>/dev/null | sed 's/^/         /'

  cd "$PROJECT_ROOT"
}

# ═══════════════════════════════════════════════════════════════
#  Platform-specific builds
# ═══════════════════════════════════════════════════════════════

case "$PLATFORM" in
  linux)
    build_desktop "appimage"
    copy_desktop_artifacts
    ;;

  macos)
    build_desktop ""
    copy_desktop_artifacts
    ;;

  windows)
    # ── Windows Desktop ──
    build_desktop "nsis"
    copy_desktop_artifacts

    # ── Android ──
    if [ -d "$PROJECT_ROOT/src-tauri/gen/android" ]; then
      build_android
    else
      echo "[4/4] [SKIP] No Android project found at src-tauri/gen/android"
    fi
    ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Build complete."
echo "  Artifacts in: $RELEASE_DIR"
ls -1h "$RELEASE_DIR" 2>/dev/null | sed 's/^/    /'
echo "═══════════════════════════════════════════════════════════════"