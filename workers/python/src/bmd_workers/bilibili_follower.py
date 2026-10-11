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
from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator

from .bilibili_follower_errors import JAVA_BLANK, error_message, response_code
from .bilibili_follower_http import BilibiliFollowerHttpConfiguration, BilibiliFollowerHttpRequest
from .bilibili_follower_json import decode_follower_json
from .bilibili_follower_long import MAX_SAFE_INTEGER, parse_java_long, positive_long_string
from .bilibili_follower_response_text import follower_response_text
from .java_scalar_text import java_scalar_text
from .postgres_jsonb_input import RawPayloadStorageStatus, raw_payload_storage_status

CARD_ENDPOINT = "x/web-interface/card"
RELATION_STAT_ENDPOINT = "x/relation/stat"
CARD_URL = "https://api.bilibili.com/x/web-interface/card"
RELATION_STAT_URL = "https://api.bilibili.com/x/relation/stat"


class BilibiliFollowerFetchRequest(BilibiliFollowerHttpRequest):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    task_id: str = Field(alias="taskId", min_length=1)
    attempt: int = Field(ge=1)
    lease_id: str = Field(alias="leaseId", min_length=1)
    mid: str = Field(pattern=r"^[1-9]\d*$")

    @field_validator("mid")
    @classmethod
    def positive_source_long(cls, value: str) -> str:
        parsed = parse_java_long(value)
        if parsed is None or parsed <= 0:
            raise ValueError("Follower request MID must fit a positive Long64")
        return value


class BilibiliFollowerProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mid: StrictStr = Field(pattern=r"^[1-9]\d*$")
    nickname: StrictStr

    @field_validator("nickname")
    @classmethod
    def nonblank_nickname(cls, value: str) -> str:
        # Rust's length validator rejects isolated UTF-16 units accepted by
        # Jackson StringNode. Keep strict type checks, but check presence here.
        if not value or JAVA_BLANK.fullmatch(value):
            raise ValueError("Follower profile nickname must not be Java blank.")
        return value


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
        raw_bytes: bytes | None = None,
        raw_media_type: str = "application/octet-stream",
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.endpoint = endpoint
        self.status_code = status_code
        self.bili_code = bili_code
        self.raw_bytes = raw_bytes
        self.raw_media_type = raw_media_type


def legacy_follower_result(
    value: dict[str, Any], endpoint: str, *, profile: bool = False
) -> dict[str, Any]:
    """An explicit v1 projection; incompatible values never become rounded JSON numbers."""
    try:
        positive_long_string(value.get("mid"))
        if not profile:
            for field in ("followerCount", "followingCount"):
                if field not in value:
                    continue
                count = value[field]
                if (
                    isinstance(count, bool)
                    or not isinstance(count, int)
                    or not 0 <= count <= MAX_SAFE_INTEGER
                ):
                    raise ValueError("The legacy contract cannot represent this follower count")
    except ValueError as error:
        raise BilibiliCrawlerError(
            "WORKER_CONTRACT_PRECISION_UNSUPPORTED",
            "This follower result requires the Long64 v2 Worker contract.",
            retryable=False,
            endpoint=endpoint,
            status_code=200,
        ) from error
    return value


def _optional_text(value: object) -> str | None:
    # JsonNode.asText(null) has no object/array representation. isBlank checks
    # presence, not normalization: retain nonblank strings exactly as returned.
    text = java_scalar_text(value)
    return None if text is None or JAVA_BLANK.fullmatch(text) else text


def _optional_int(value: object) -> int | None:
    return parse_java_long(value)


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
    code = response_code(root.get("code"))
    if code == 0:
        return
    error_code = {
        -101: "BILIBILI_AUTH_EXPIRED",
        -352: "BILIBILI_RISK_CONTROL",
        -412: "BILIBILI_RISK_CONTROL",
    }.get(code, "BILIBILI_UNKNOWN_ERROR")
    message = error_message(root.get("message"), code)
    raise BilibiliCrawlerError(
        error_code,
        message,
        retryable=code >= 500,
        endpoint=endpoint,
        status_code=200,
        bili_code=code,
    )


def _decode_json(raw: str, endpoint: str) -> dict[str, Any]:
    try:
        decoded = decode_follower_json(raw)
    except json.JSONDecodeError as error:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Unable to parse Bilibili response.",
            retryable=False,
            endpoint=endpoint,
            status_code=200,
        ) from error
    # JsonNode.path on scalar/array/null/MissingNode has no code/data. The
    # existing ensureSuccess gate must classify that as UNKNOWN, not PARSE.
    return _object(decoded)


def parse_card_response(raw: str, fetched_at: str) -> dict[str, object]:
    root = _decode_json(raw, CARD_ENDPOINT)
    _ensure_success(root, CARD_ENDPOINT)
    data = _object(root.get("data"))
    card = _object(data.get("card"))
    mid_value = _optional_int(card.get("mid"))
    nickname = _optional_text(card.get("name"))
    follower_count = _optional_int(data.get("follower"))
    if follower_count is None:
        follower_count = _optional_int(card.get("fans"))
    if mid_value is None:
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
    mid = str(mid_value)
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
    mid_value = _optional_int(data.get("mid"))
    follower_count = _optional_int(data.get("follower"))
    if mid_value is None or follower_count is None:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Missing data.mid or data.follower",
            retryable=False,
            endpoint=RELATION_STAT_ENDPOINT,
            status_code=200,
        )
    mid = str(mid_value)
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


def _write_object_sync(
    data_directory: Path, raw: bytes, media_type: str = "application/json"
) -> dict[str, object]:
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
        "mediaType": media_type,
    }


async def _fetch_follower_response(
    endpoint: str,
    mid: str,
    http_configuration: BilibiliFollowerHttpConfiguration | None = None,
) -> tuple[dict[str, object], bytes, int, int, RawPayloadStorageStatus]:
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

    configuration = http_configuration or BilibiliFollowerHttpConfiguration()
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(
            timeout=configuration.timeout(),
            headers=configuration.headers(),
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
    raw = follower_response_text(response)
    content_types = response.headers.get_list("content-type")
    raw_media_type = (content_types[0] if content_types else "") or "application/octet-stream"
    if response.status_code >= 400:
        if response.status_code == 429:
            code = "BILIBILI_RATE_LIMITED"
            retryable = True
        elif response.status_code >= 500:
            code = "BILIBILI_SERVER_ERROR"
            retryable = True
        else:
            code = "BILIBILI_UNKNOWN_ERROR"
            retryable = False
        raise BilibiliCrawlerError(
            code,
            f"Bilibili HTTP {response.status_code} from {endpoint}",
            retryable=retryable,
            endpoint=endpoint,
            status_code=response.status_code,
            raw_bytes=response.content,
            raw_media_type=raw_media_type,
        )

    raw_bytes = response.content
    if raw is None:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Unable to parse an empty Bilibili response body.",
            retryable=False,
            endpoint=endpoint,
            status_code=200,
        )
    fetched_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    try:
        parsed = (
            parse_card_response(raw, fetched_at)
            if endpoint == CARD_ENDPOINT
            else parse_relation_stat_response(raw, fetched_at)
        )
    except BilibiliCrawlerError as error:
        # Retain bytes internally only. Opt-in callers may archive them; normal
        # monitoring and read-only profiles keep their existing failure path.
        error.raw_bytes = raw_bytes
        error.raw_media_type = raw_media_type
        raise
    return parsed, raw_bytes, response.status_code, duration_ms, raw_payload_storage_status(raw)


async def fetch_follower_profile(
    mid: str, http_configuration: BilibiliFollowerHttpConfiguration | None = None
) -> dict[str, Any]:
    parsed, _, _, _, _ = await _fetch_follower_response(CARD_ENDPOINT, mid, http_configuration)
    # Live name lookup is ephemeral, not a follower snapshot/evidence collection operation.
    legacy_follower_result(parsed, CARD_ENDPOINT, profile=True)
    return BilibiliFollowerProfile.model_validate(
        {"mid": parsed["mid"], "nickname": parsed["nickname"]}
    ).model_dump()


async def fetch_follower_endpoint(
    endpoint: str,
    mid: str,
    data_directory: Path,
    http_configuration: BilibiliFollowerHttpConfiguration | None = None,
) -> dict[str, Any]:
    parsed, raw_bytes, status_code, duration_ms, storage_status = await _fetch_follower_response(
        endpoint, mid, http_configuration
    )
    legacy_follower_result(parsed, endpoint)
    evidence = await asyncio.to_thread(_write_object_sync, data_directory, raw_bytes)
    return {
        **parsed,
        "evidenceObject": evidence,
        "statusCode": status_code,
        "durationMs": duration_ms,
        "rawPayloadStorageStatus": storage_status,
    }
