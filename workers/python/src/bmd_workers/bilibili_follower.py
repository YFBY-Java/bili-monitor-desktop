from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field

CARD_ENDPOINT = "x/web-interface/card"
RELATION_STAT_ENDPOINT = "x/relation/stat"
CARD_URL = "https://api.bilibili.com/x/web-interface/card"
RELATION_STAT_URL = "https://api.bilibili.com/x/relation/stat"


class BilibiliFollowerFetchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    task_id: str = Field(alias="taskId", min_length=1)
    attempt: int = Field(ge=1)
    lease_id: str = Field(alias="leaseId", min_length=1)
    mid: str = Field(pattern=r"^[1-9]\d*$")


class BilibiliCrawlerError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        retryable: bool,
        endpoint: str,
        status_code: int | None = None,
        bili_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.endpoint = endpoint
        self.status_code = status_code
        self.bili_code = bili_code


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _optional_int(value: object) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    if not isinstance(value, (int, float, str)):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if number >= 0 else None


def _object(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _ensure_success(root: dict[str, Any], endpoint: str) -> None:
    data = _object(root.get("data"))
    if data.get("v_voucher") is not None:
        raise BilibiliCrawlerError(
            "BILIBILI_RISK_CONTROL",
            "Bilibili returned v_voucher risk-control response.",
            retryable=False,
            endpoint=endpoint,
            status_code=200,
            bili_code=0,
        )
    code = root.get("code")
    if code == 0:
        return
    bili_code = int(code) if isinstance(code, int) and not isinstance(code, bool) else None
    error_code = (
        "BILIBILI_API_ERROR"
        if bili_code is None
        else {
            -101: "BILIBILI_AUTH_EXPIRED",
            -352: "BILIBILI_RISK_CONTROL",
            -412: "BILIBILI_RISK_CONTROL",
        }.get(bili_code, "BILIBILI_API_ERROR")
    )
    message = _optional_text(root.get("message")) or f"Bilibili API error: {code}"
    raise BilibiliCrawlerError(
        error_code,
        message,
        retryable=bili_code is not None and bili_code >= 500,
        endpoint=endpoint,
        status_code=200,
        bili_code=bili_code,
    )


def _decode_json(raw: str, endpoint: str) -> dict[str, Any]:
    try:
        decoded = json.loads(raw)
    except json.JSONDecodeError as error:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            f"Unable to parse Bilibili response: {error.msg}",
            retryable=False,
            endpoint=endpoint,
            status_code=200,
        ) from error
    if not isinstance(decoded, dict):
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Bilibili response root must be an object.",
            retryable=False,
            endpoint=endpoint,
            status_code=200,
        )
    return decoded


def parse_card_response(raw: str, fetched_at: str) -> dict[str, object]:
    root = _decode_json(raw, CARD_ENDPOINT)
    _ensure_success(root, CARD_ENDPOINT)
    data = _object(root.get("data"))
    card = _object(data.get("card"))
    mid = _optional_text(card.get("mid"))
    nickname = _optional_text(card.get("name"))
    follower_count = _optional_int(data.get("follower"))
    if follower_count is None:
        follower_count = _optional_int(card.get("fans"))
    if mid is None or not mid.isdigit() or int(mid) <= 0:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Missing card.mid",
            retryable=False,
            endpoint=CARD_ENDPOINT,
            status_code=200,
        )
    if nickname is None:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Missing card.name",
            retryable=False,
            endpoint=CARD_ENDPOINT,
            status_code=200,
        )
    if follower_count is None:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Missing follower count in data.follower/card.fans",
            retryable=False,
            endpoint=CARD_ENDPOINT,
            status_code=200,
        )
    result: dict[str, object] = {
        "mid": mid,
        "nickname": nickname,
        "profileUrl": f"https://space.bilibili.com/{mid}",
        "followerCount": follower_count,
        "fetchedAt": fetched_at,
        "sourceEndpoint": CARD_ENDPOINT,
    }
    avatar_url = _optional_text(card.get("face"))
    following_count = _optional_int(card.get("attention"))
    if following_count is None:
        following_count = _optional_int(card.get("friend"))
    if avatar_url is not None:
        result["avatarUrl"] = avatar_url
    if following_count is not None:
        result["followingCount"] = following_count
    return result


def parse_relation_stat_response(raw: str, fetched_at: str) -> dict[str, object]:
    root = _decode_json(raw, RELATION_STAT_ENDPOINT)
    _ensure_success(root, RELATION_STAT_ENDPOINT)
    data = _object(root.get("data"))
    mid = _optional_text(data.get("mid"))
    follower_count = _optional_int(data.get("follower"))
    if mid is None or not mid.isdigit() or int(mid) <= 0 or follower_count is None:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Missing data.mid or data.follower",
            retryable=False,
            endpoint=RELATION_STAT_ENDPOINT,
            status_code=200,
        )
    result: dict[str, object] = {
        "mid": mid,
        "profileUrl": f"https://space.bilibili.com/{mid}",
        "followerCount": follower_count,
        "fetchedAt": fetched_at,
        "sourceEndpoint": RELATION_STAT_ENDPOINT,
    }
    following_count = _optional_int(data.get("following"))
    if following_count is not None:
        result["followingCount"] = following_count
    return result


def _write_object_sync(data_directory: Path, raw: bytes) -> dict[str, object]:
    digest = hashlib.sha256(raw).hexdigest()
    relative = Path("cas") / "sha256" / digest[:2] / f"{digest}.json"
    target = data_directory / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        temporary = target.with_suffix(f".tmp-{os.getpid()}")
        temporary.write_bytes(raw)
        os.replace(temporary, target)
    return {
        "objectId": f"sha256:{digest}",
        "relativePath": relative.as_posix(),
        "sha256": digest,
        "sizeBytes": len(raw),
        "mediaType": "application/json",
    }


async def fetch_follower_endpoint(
    endpoint: str,
    mid: str,
    data_directory: Path,
) -> dict[str, Any]:
    if endpoint == CARD_ENDPOINT:
        url = CARD_URL
        parameters = {"mid": mid, "photo": "true"}
    elif endpoint == RELATION_STAT_ENDPOINT:
        url = RELATION_STAT_URL
        parameters = {"vmid": mid}
    else:
        raise BilibiliCrawlerError(
            "BILIBILI_ENDPOINT_UNSUPPORTED",
            f"Unsupported Bilibili follower endpoint: {endpoint}",
            retryable=False,
            endpoint=endpoint,
        )

    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            headers={
                "Accept": "application/json",
                "User-Agent": "BiliMonitorDesktop/0.1 (+low-frequency public Bilibili follower monitor)",
                "Referer": "https://www.bilibili.com/",
            },
        ) as client:
            response = await client.get(url, params=parameters)
    except httpx.RequestError as error:
        raise BilibiliCrawlerError(
            "BILIBILI_NETWORK_ERROR",
            f"Network error calling Bilibili: {error}",
            retryable=True,
            endpoint=endpoint,
        ) from error

    duration_ms = int((time.perf_counter() - started) * 1000)
    if response.status_code >= 400:
        if response.status_code == 429:
            code = "BILIBILI_RATE_LIMITED"
            retryable = True
        elif response.status_code >= 500:
            code = "BILIBILI_SERVER_ERROR"
            retryable = True
        else:
            code = "BILIBILI_HTTP_ERROR"
            retryable = False
        raise BilibiliCrawlerError(
            code,
            f"Bilibili HTTP {response.status_code} from {endpoint}",
            retryable=retryable,
            endpoint=endpoint,
            status_code=response.status_code,
        )

    raw_bytes = response.content
    raw = raw_bytes.decode("utf-8")
    fetched_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    parsed = (
        parse_card_response(raw, fetched_at)
        if endpoint == CARD_ENDPOINT
        else parse_relation_stat_response(raw, fetched_at)
    )
    evidence = await asyncio.to_thread(_write_object_sync, data_directory, raw_bytes)
    return {
        **parsed,
        "evidenceObject": evidence,
        "statusCode": response.status_code,
        "durationMs": duration_ms,
    }
