"""LiveApiClient value semantics, intentionally separate from follower/auth parsing."""

import calendar
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from .bilibili_follower import BilibiliCrawlerError

CHINA_TIMEZONE = timezone(timedelta(hours=8))
JAVA_BLANK = re.compile(
    r"[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]*"
)


def optional_text(value: object) -> str | None:
    if isinstance(value, bool):
        text = "true" if value else "false"
    elif isinstance(value, (str, int, float)):
        text = str(value)
    else:
        return None
    return None if JAVA_BLANK.fullmatch(text) else text


def optional_int(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    if isinstance(value, str) and not re.fullmatch(r"[+-]?\d+", value):
        return None
    try:
        number = int(value)
    except (ValueError, OverflowError):
        return None
    return number if -(2**63) <= number < 2**63 else None


def ensure_success(root: dict[str, Any], endpoint: str) -> None:
    value = root.get("code")
    try:
        # JsonNode.asInt permits a trimmed numeric string, unlike parseLongText for fields.
        if isinstance(value, str):
            code = int(float(value.strip()))
        elif isinstance(value, (int, float)):
            code = int(value)
        else:
            code = -(2**31)
        code = (code + 2**31) % 2**32 - 2**31
    except (ValueError, TypeError, OverflowError):
        code = -(2**31)
    if code == 0:
        return
    error_code = {
        -101: "BILIBILI_AUTH_EXPIRED",
        -352: "BILIBILI_RISK_CONTROL",
        -412: "BILIBILI_RISK_CONTROL",
    }.get(code, "BILIBILI_UNKNOWN_ERROR")
    raise BilibiliCrawlerError(
        error_code,
        optional_text(root.get("message")) or f"Bilibili live API error: {code}",
        retryable=code >= 500 or code == -500,
        endpoint=endpoint,
        status_code=200,
        bili_code=code,
    )


def live_time(value: object) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        seconds = optional_int(value)
        if seconds is None or seconds <= 0:
            return None
        return datetime.fromtimestamp(seconds, timezone.utc).isoformat().replace("+00:00", "Z")
    if not isinstance(value, str):
        return None
    match = re.fullmatch(
        r"([0-9]{4})-([0-9]{2})-([0-9]{2}) ([0-9]{2}):([0-9]{2}):([0-9]{2})", value
    )
    if not match:
        return None
    year, month, day, hour, minute, second = map(int, match.groups())
    if not 1 <= day <= 31:
        return None
    try:
        # DateTimeFormatter.ofPattern uses SMART: clamp month end, resolve 24:00 to next day.
        last_day = calendar.monthrange(year, month)[1]
        midnight_next_day = hour == 24 and minute == 0 and second == 0
        parsed = datetime(
            year,
            month,
            min(day, last_day),
            0 if midnight_next_day else hour,
            minute,
            second,
            tzinfo=CHINA_TIMEZONE,
        )
        if midnight_next_day:
            parsed += timedelta(days=1)
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except (ValueError, OverflowError):
        return None
