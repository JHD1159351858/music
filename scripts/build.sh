#!/bin/bash
set -Eeuo pipefail

CODER_PROJECTS_PATH="${CODER_PROJECTS_PATH:-$(pwd)}"
echo "Working directory: ${CODER_PROJECTS_PATH}"
cd "${CODER_PROJECTS_PATH}" || { echo "ERROR: 目录不存在 ${CODER_PROJECTS_PATH}" >&2; exit 1; }

# 构建堆内存配置
MAX_HEAP_MB="${MAX_HEAP_MB:-3072}"
if ! [[ "${MAX_HEAP_MB}" =~ ^[0-9]+$ ]] || [[ "${MAX_HEAP_MB}" -lt 1024 ]]; then
  echo "ERROR: MAX_HEAP_MB 必须为数字，最小值建议 1024" >&2
  exit 1
fi
BUILD_ENV="NODE_OPTIONS=--max-old-space-size=${MAX_HEAP_MB}"
echo "Build Node heap size: ${MAX_HEAP_MB}MB"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only

echo "Building the Next.js project..."
env ${BUILD_ENV} pnpm next build

echo "Bundling server with tsup..."
env ${BUILD_ENV} pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

echo "Build completed successfully!"