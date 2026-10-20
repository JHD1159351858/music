#!/bin/bash
set -Eeuo pipefail

CODER_PROJECTS_PATH="${CODER_PROJECTS_PATH:-$(pwd)}"


PORT=5000
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"


start_service() {
    cd "${CODER_PROJECTS_PATH}" || {
        echo "ERROR: 工作目录不存在 -> ${CODER_PROJECTS_PATH}" >&2
        exit 1
    }

    # 运行时堆内存配置，默认 1024MB
    MAX_HEAP_MB="${MAX_HEAP_MB:-1024}"

    # 合法性校验：内存必须是数字，最低 512MB
    if ! [[ "${MAX_HEAP_MB}" =~ ^[0-9]+$ ]] || [[ "${MAX_HEAP_MB}" -lt 512 ]]; then
        echo "ERROR: MAX_HEAP_MB 必须为数字，最小值不能低于 512" >&2
        exit 1
    fi

    # 端口合法性校验
    if ! [[ "${DEPLOY_RUN_PORT}" =~ ^[0-9]+$ ]] || [[ "${DEPLOY_RUN_PORT}" -lt 1 ]] || [[ "${DEPLOY_RUN_PORT}" -gt 65535 ]]; then
        echo "ERROR: DEPLOY_RUN_PORT 端口非法，必须 1~65535" >&2
        exit 1
    fi

    echo "========================================"
    echo "Service start config:"
    echo "Workdir:    ${CODER_PROJECTS_PATH}"
    echo "Listen Port:${DEPLOY_RUN_PORT}"
    echo "Node Heap:  ${MAX_HEAP_MB} MB"
    echo "========================================"
    echo "Starting HTTP service..."

    # 组装环境变量启动服务
    CODER_PROJECT_ENV=PROD NODE_ENV=production PORT="${DEPLOY_RUN_PORT}" NODE_OPTIONS="--max-old-space-size=${MAX_HEAP_MB}" exec node dist/server.js
}

# 启动入口
start_service
