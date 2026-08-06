#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/infra/.build"
rm -rf "$BUILD"
mkdir -p "$BUILD"

npm run build --workspaces --if-present

bundle() {
  local name=$1
  local dir=$2
  local out="$BUILD/$name"
  mkdir -p "$out"
  cp -R "$dir/dist/"* "$out/"
  cp "$dir/package.json" "$out/"
  (cd "$out" && npm install --omit=dev --no-package-lock 2>/dev/null || true)
  (cd "$BUILD" && zip -r "$name.zip" "$name")
}

bundle command-api "$ROOT/services/command-api"
bundle query-api "$ROOT/services/query-api"
bundle validate-worker "$ROOT/services/activity-workers/validate-worker"
bundle ocr-worker "$ROOT/services/activity-workers/ocr-worker"
bundle classify-worker "$ROOT/services/activity-workers/classify-worker"
bundle execution-projection "$ROOT/services/event-projections/execution-projection"

echo "Lambda bundles written to $BUILD"
