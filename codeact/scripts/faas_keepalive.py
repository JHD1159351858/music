#!/usr/bin/env python3
"""FaaS 保活脚本 - 对多个端点发送 HTTP GET 请求，防止容器闲置回收导致冷启动。
由外部日程每 5 分钟触发一次，脚本本身单次执行。

用法: python faas_keepalive.py <result_mode>
  result_mode  - auto | display_only | no_reply | notify
"""

import sys
import os
import time
import requests
from datetime import datetime, timezone, timedelta

# ── CodeAct SDK ───────────────────────────────────────────
from codeact_sdk import CodeActSDK

sdk = CodeActSDK()

# ── 参数解析 ──────────────────────────────────────────────
result_mode = sys.argv[1] if len(sys.argv) > 1 else "auto"
if result_mode == "auto":
    result_mode = "no_reply"  # 保活任务不需要上屏打扰用户

LOG_PATH = "./codeact/output/keepalive.log"
MAX_LOG_LINES = 500
REQUEST_TIMEOUT = 10  # 秒

# ── 保活端点配置 ──────────────────────────────────────────
ENDPOINTS = [
    {"name": "知音平台",   "url": "https://zzj2nrzrmf.coze.site/api/auth/session"},
    {"name": "认证中心",   "url": "https://sdtqvk3ybm.coze.site/"},
]


def ping_endpoint(ep: dict) -> dict:
    """对单个端点发 GET，返回 {name, status, latency_ms, ok, error}"""
    t0 = time.monotonic()
    try:
        resp = requests.get(ep["url"], timeout=REQUEST_TIMEOUT, allow_redirects=True)
        latency_ms = round((time.monotonic() - t0) * 1000)
        return {
            "name": ep["name"],
            "status": resp.status_code,
            "latency_ms": latency_ms,
            "ok": resp.status_code < 400,
            "error": None,
        }
    except Exception as e:
        latency_ms = round((time.monotonic() - t0) * 1000)
        return {
            "name": ep["name"],
            "status": 0,
            "latency_ms": latency_ms,
            "ok": False,
            "error": str(e),
        }


def rotate_log(max_lines: int):
    """日志超过 max_lines 行时只保留最后 max_lines 行"""
    try:
        if not os.path.exists(LOG_PATH):
            return
        with open(LOG_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()
        if len(lines) > max_lines:
            with open(LOG_PATH, "w", encoding="utf-8") as f:
                f.writelines(lines[-max_lines:])
    except Exception:
        pass


def main():
    os.makedirs(os.path.dirname(LOG_PATH) or ".", exist_ok=True)

    now = datetime.now(timezone(timedelta(hours=8)))
    ts = now.strftime("%Y-%m-%d %H:%M:%S")

    results = [ping_endpoint(ep) for ep in ENDPOINTS]
    all_ok = all(r["ok"] for r in results)

    # 构建日志行
    parts = [f"[{ts}]"]
    for r in results:
        if r["ok"]:
            parts.append(f"{r['name']}: {r['status']} ({r['latency_ms']}ms)")
        else:
            parts.append(f"{r['name']}: FAIL status={r['status']} {r['latency_ms']}ms err={r['error']}")
    log_line = " | ".join(parts)

    # 追加写入
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(log_line + "\n")

    rotate_log(MAX_LOG_LINES)

    # stdout 日志（被沙箱捕获）
    status_word = "OK" if all_ok else "FAIL"
    print(f"Keepalive {status_word}: {log_line}")

    # 提交结果 —— 保活任务静默不上屏
    fail_names = [r["name"] for r in results if not r["ok"]]
    msg = f"FaaS保活{'成功' if all_ok else '部分失败'}: {', '.join(fail_names) if fail_names else '全部正常'}"
    sdk.submit_result(
        status="success" if all_ok else "error",
        message=msg,
        result_mode="no_reply",
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Keepalive FATAL: {e}")
        try:
            sdk.submit_result(status="error", message=f"FaaS保活脚本异常: {e}", result_mode="no_reply")
        except Exception:
            pass
        sys.exit(1)
