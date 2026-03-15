from __future__ import annotations

import os
import socket
from typing import Any, Mapping


DEFAULT_API_SERVICE_NAME = "eurbanizam-api.service"
DEFAULT_WEB_SERVICE_NAME = "eurbanizam-web.service"
DEFAULT_BOT_SERVICE_NAME = "eurbanizam-bot.service"


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def get_hostname() -> str:
    try:
        hostname = socket.gethostname().strip()
    except Exception:
        hostname = ""
    return hostname or "unknown-host"


def get_runtime_identity(
    settings_raw: Mapping[str, Any] | None = None,
    env: Mapping[str, str] | None = None,
) -> dict[str, str]:
    settings_raw = settings_raw or {}
    env = env or os.environ
    hostname = get_hostname()
    label = (
        _clean_text(env.get("DEPLOYMENT_LABEL"))
        or _clean_text(settings_raw.get("deployment_label"))
        or hostname
    )
    source = label if label == hostname else f"{label} ({hostname})"
    return {
        "label": label,
        "hostname": hostname,
        "source": source,
    }


def get_service_units(
    settings_raw: Mapping[str, Any] | None = None,
) -> dict[str, str]:
    settings_raw = settings_raw or {}
    return {
        "api": _clean_text(settings_raw.get("api_service_name"))
        or DEFAULT_API_SERVICE_NAME,
        "web": _clean_text(settings_raw.get("web_service_name"))
        or DEFAULT_WEB_SERVICE_NAME,
        "bot": _clean_text(settings_raw.get("bot_service_name"))
        or DEFAULT_BOT_SERVICE_NAME,
    }
