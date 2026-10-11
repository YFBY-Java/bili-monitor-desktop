from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from pydantic import ConfigDict, Field

from .bilibili_follower import (
    BilibiliCrawlerError,
    _decode_json,
    _object,
    _write_object_sync,
)
from .bilibili_follower_long import canonical_long_string, parse_java_long
from .bilibili_follower_response_text import bilibili_response_encoding, bilibili_response_text
from .bilibili_live_contract import PositiveId, PositiveInteger, validate_live_snapshot_data
from .bilibili_live_http import BilibiliLiveHttpConfiguration, BilibiliLiveHttpRequest
from .bilibili_live_values import ensure_success as _ensure_success
from .bilibili_live_values import live_time as _live_time
from .bilibili_live_values import optional_int as _optional_int
from .bilibili_live_values import optional_text as _optional_text
from .postgres_jsonb_input import raw_payload_storage_status

STATUS_BY_UIDS_ENDPOINT = "room/v1/Room/get_status_info_by_uids"
ROOM_INIT_ENDPOINT = "room/v1/Room/room_init"
ROOM_INFO_ENDPOINT = "room/v1/Room/get_info"
ROOM_INFO_OLD_ENDPOINT = "room/v1/Room/getRoomInfoOld"

ENDPOINT_URLS = {
    STATUS_BY_UIDS_ENDPOINT: "https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids",
    ROOM_INIT_ENDPOINT: "https://api.live.bilibili.com/room/v1/Room/room_init",
    ROOM_INFO_ENDPOINT: "https://api.live.bilibili.com/room/v1/Room/get_info",
    ROOM_INFO_OLD_ENDPOINT: "https://api.live.bilibili.com/room/v1/Room/getRoomInfoOld",
}


class BilibiliLiveRoomRequest(BilibiliLiveHttpRequest):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    task_id: str = Field(alias="taskId", min_length=1)
    attempt: PositiveInteger
    lease_id: str = Field(alias="leaseId", min_length=1)
    room_id: PositiveId = Field(alias="roomId")


class BilibiliLiveUidRequest(BilibiliLiveHttpRequest):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    task_id: str = Field(alias="taskId", min_length=1)
    attempt: PositiveInteger
    lease_id: str = Field(alias="leaseId", min_length=1)
    uid: PositiveId


class BilibiliLiveStatusRequest(BilibiliLiveHttpRequest):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    task_id: str = Field(alias="taskId", min_length=1)
    attempt: PositiveInteger
    lease_id: str = Field(alias="leaseId", min_length=1)
    uids: list[PositiveId] = Field(min_length=1)


def _positive_id(value: object) -> str | None:
    number = _optional_int(value)
    return str(number) if number is not None and number > 0 else None


def _live_status(value: object) -> int:
    status = _optional_int(value)
    return status if status in (0, 1, 2) else 0


def _auxiliary_id(value: object) -> str | None:
    number = _optional_int(value)
    return str(number) if number is not None and number >= 0 else None


def _put(result: dict[str, object], key: str, value: object | None) -> None:
    if value is not None:
        result[key] = value


def _first(left: object | None, right: object | None) -> object | None:
    return left if left is not None else right


def _status_item(item: dict[str, Any], fallback_uid: str, endpoint: str) -> dict[str, object]:
    uid = _positive_id(item.get("uid")) or _positive_id(fallback_uid)
    room_id = _positive_id(item.get("room_id"))
    if uid is None or room_id is None:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            f"Missing uid/room_id for uid={fallback_uid}",
            retryable=False,
            endpoint=endpoint,
            status_code=200,
        )
    result: dict[str, object] = {
        "uid": uid,
        "roomId": room_id,
        "liveStatus": _live_status(item.get("live_status")),
    }
    _put(result, "shortId", _auxiliary_id(item.get("short_id")))
    _put(result, "uname", _optional_text(item.get("uname")) or f"UID {uid}")
    _put(result, "faceUrl", _optional_text(item.get("face")))
    _put(result, "title", _optional_text(item.get("title")))
    _put(
        result,
        "coverUrl",
        _optional_text(item.get("cover_from_user")) or _optional_text(item.get("cover")),
    )
    _put(result, "keyframeUrl", _optional_text(item.get("keyframe")))
    _put(
        result,
        "areaId",
        _auxiliary_id(item.get("area_v2_id")) or _auxiliary_id(item.get("area_id")),
    )
    _put(
        result,
        "areaName",
        _optional_text(item.get("area_v2_name")) or _optional_text(item.get("area_name")),
    )
    _put(
        result,
        "parentAreaId",
        _auxiliary_id(item.get("area_v2_parent_id")) or _auxiliary_id(item.get("parent_area_id")),
    )
    _put(
        result,
        "parentAreaName",
        _optional_text(item.get("area_v2_parent_name"))
        or _optional_text(item.get("parent_area_name")),
    )
    _put(result, "liveTime", _live_time(item.get("live_time")))
    _put(
        result,
        "onlineCount",
        _first(
            parse_java_long(item.get("online")),
            parse_java_long(_object(item.get("watched_show")).get("num")),
        ),
    )
    _put(result, "attentionCount", parse_java_long(item.get("attention")))
    return result


def parse_status_by_uids_response(raw: str, fetched_at: str) -> list[dict[str, object]]:
    del fetched_at
    root = _decode_json(raw, STATUS_BY_UIDS_ENDPOINT)
    _ensure_success(root, STATUS_BY_UIDS_ENDPOINT)
    data = _object(root.get("data"))
    snapshots: dict[str, dict[str, object]] = {}
    for key, value in data.items():
        item = _object(value)
        uid = _positive_id(item.get("uid")) or _positive_id(key)
        if uid is not None:
            snapshots[uid] = _status_item(item, uid, STATUS_BY_UIDS_ENDPOINT)
    return list(snapshots.values())


def parse_room_init_response(raw: str, fetched_at: str) -> dict[str, object]:
    del fetched_at
    root = _decode_json(raw, ROOM_INIT_ENDPOINT)
    _ensure_success(root, ROOM_INIT_ENDPOINT)
    data = _object(root.get("data"))
    uid = _positive_id(data.get("uid"))
    room_id = _positive_id(data.get("room_id"))
    if uid is None or room_id is None:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Missing data.uid or data.room_id",
            retryable=False,
            endpoint=ROOM_INIT_ENDPOINT,
            status_code=200,
        )
    result: dict[str, object] = {
        "uid": uid,
        "roomId": room_id,
        "uname": f"UID {uid}",
        "liveStatus": _live_status(data.get("live_status")),
    }
    _put(result, "shortId", _auxiliary_id(data.get("short_id")))
    _put(result, "liveTime", _live_time(data.get("live_time")))
    return result


def parse_room_info_response(raw: str, fetched_at: str) -> dict[str, object]:
    del fetched_at
    root = _decode_json(raw, ROOM_INFO_ENDPOINT)
    _ensure_success(root, ROOM_INFO_ENDPOINT)
    data = _object(root.get("data"))
    uid = _positive_id(data.get("uid"))
    room_id = _positive_id(data.get("room_id"))
    if uid is None or room_id is None:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Missing data.uid or data.room_id",
            retryable=False,
            endpoint=ROOM_INFO_ENDPOINT,
            status_code=200,
        )
    result: dict[str, object] = {
        "uid": uid,
        "roomId": room_id,
        "uname": f"UID {uid}",
        "liveStatus": _live_status(data.get("live_status")),
    }
    _put(result, "shortId", _auxiliary_id(data.get("short_id")))
    _put(result, "title", _optional_text(data.get("title")))
    _put(
        result,
        "coverUrl",
        _optional_text(data.get("user_cover"))
        or _optional_text(data.get("cover"))
        or _optional_text(data.get("background")),
    )
    _put(result, "keyframeUrl", _optional_text(data.get("keyframe")))
    _put(result, "areaId", _auxiliary_id(data.get("area_id")))
    _put(result, "areaName", _optional_text(data.get("area_name")))
    _put(result, "parentAreaId", _auxiliary_id(data.get("parent_area_id")))
    _put(result, "parentAreaName", _optional_text(data.get("parent_area_name")))
    _put(result, "liveTime", _live_time(data.get("live_time")))
    _put(result, "onlineCount", parse_java_long(data.get("online")))
    _put(result, "attentionCount", parse_java_long(data.get("attention")))
    return result


def parse_room_info_old_response(raw: str, uid: str, fetched_at: str) -> dict[str, object] | None:
    del fetched_at
    root = _decode_json(raw, ROOM_INFO_OLD_ENDPOINT)
    _ensure_success(root, ROOM_INFO_OLD_ENDPOINT)
    data = _object(root.get("data"))
    room_id = _positive_id(data.get("roomid"))
    if _optional_int(data.get("roomStatus")) != 1 and room_id is None:
        return None
    if room_id is None:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Missing data.roomid",
            retryable=False,
            endpoint=ROOM_INFO_OLD_ENDPOINT,
            status_code=200,
        )
    result: dict[str, object] = {
        "uid": uid,
        "roomId": room_id,
        "liveStatus": _live_status(
            _first(_optional_int(data.get("liveStatus")), _optional_int(data.get("live_status")))
        ),
    }
    _put(result, "title", _optional_text(data.get("title")))
    _put(result, "coverUrl", _optional_text(data.get("cover")))
    _put(result, "onlineCount", parse_java_long(data.get("online")))
    return result


async def fetch_live_endpoint(
    endpoint: str, payload: dict[str, object], data_directory: Path
) -> dict[str, Any]:
    if endpoint not in ENDPOINT_URLS:
        raise BilibiliCrawlerError(
            "BILIBILI_ENDPOINT_UNSUPPORTED",
            f"Unsupported Bilibili live endpoint: {endpoint}",
            retryable=False,
            endpoint=endpoint,
        )
    if endpoint == STATUS_BY_UIDS_ENDPOINT:
        uids = payload.get("uids")
        if not isinstance(uids, list):
            raise BilibiliCrawlerError(
                "BILIBILI_INPUT_INVALID",
                "uids is required.",
                retryable=False,
                endpoint=endpoint,
            )
        parameters: list[tuple[str, str | int | float | bool | None]] = [
            ("uids[]", str(uid)) for uid in uids
        ]
    elif endpoint == ROOM_INIT_ENDPOINT:
        parameters = [("id", str(payload["roomId"]))]
    elif endpoint == ROOM_INFO_ENDPOINT:
        parameters = [("room_id", str(payload["roomId"]))]
    else:
        parameters = [("mid", str(payload["uid"]))]

    configuration = BilibiliLiveHttpConfiguration.model_validate(
        payload.get("httpConfiguration") or {}
    )
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(
            timeout=configuration.timeout(),
            follow_redirects=True,
            headers=configuration.headers(),
        ) as client:
            response = await client.get(ENDPOINT_URLS[endpoint], params=parameters)
    except httpx.RequestError as error:
        raise BilibiliCrawlerError(
            "BILIBILI_NETWORK_ERROR",
            f"Network error calling Bilibili live API: {error}",
            retryable=True,
            endpoint=endpoint,
        ) from error

    duration_ms = int((time.perf_counter() - started) * 1000)
    # DefaultRestClient resolves MediaType before its status handler; the String
    # converter only decodes a successful body, not an HTTP error response.
    codec = bilibili_response_encoding(response)
    if response.status_code >= 400:
        code = (
            "BILIBILI_RATE_LIMITED"
            if response.status_code == 429
            else (
                "BILIBILI_SERVER_ERROR" if response.status_code >= 500 else "BILIBILI_UNKNOWN_ERROR"
            )
        )
        raise BilibiliCrawlerError(
            code,
            f"Bilibili live HTTP {response.status_code} from {endpoint}",
            retryable=response.status_code == 429 or response.status_code >= 500,
            endpoint=endpoint,
            status_code=response.status_code,
        )

    raw_bytes = response.content
    raw = bilibili_response_text(raw_bytes, codec)
    if raw is None:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Unable to parse an empty Bilibili live response body.",
            retryable=False,
            endpoint=endpoint,
            status_code=response.status_code,
        )
    fetched_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    try:
        if endpoint == STATUS_BY_UIDS_ENDPOINT:
            parsed: dict[str, object] = {
                "snapshots": parse_status_by_uids_response(raw, fetched_at)
            }
        elif endpoint == ROOM_INIT_ENDPOINT:
            parsed = parse_room_init_response(raw, fetched_at)
        elif endpoint == ROOM_INFO_ENDPOINT:
            parsed = parse_room_info_response(raw, fetched_at)
        else:
            snapshot = parse_room_info_old_response(raw, str(payload["uid"]), fetched_at)
            parsed = {"snapshot": snapshot} if snapshot is not None else {}
    except (ValueError, OverflowError, OSError, TypeError, RecursionError) as error:
        # Only parser failures: evidence storage and network failures retain their own meaning.
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Unable to parse Bilibili live response fields.",
            retryable=False,
            endpoint=endpoint,
            status_code=response.status_code,
        ) from error

    exact = payload.get("_long64") is True
    snapshots = (
        parsed.get("snapshots")
        if endpoint == STATUS_BY_UIDS_ENDPOINT
        else (
            [parsed["snapshot"]]
            if "snapshot" in parsed
            else [] if endpoint == ROOM_INFO_OLD_ENDPOINT else [parsed]
        )
    )
    if exact and isinstance(snapshots, list):
        for entry in snapshots:
            if isinstance(entry, dict):
                for key in ("onlineCount", "attentionCount"):
                    if key in entry:
                        entry[key] = canonical_long_string(str(entry[key]))
    validate_live_snapshot_data(endpoint, parsed, exact)
    evidence = await asyncio.to_thread(_write_object_sync, data_directory, raw_bytes)
    return {
        **parsed,
        "fetchedAt": fetched_at,
        "sourceEndpoint": endpoint,
        "evidenceObject": evidence,
        "statusCode": response.status_code,
        "durationMs": duration_ms,
        "rawPayloadStorageStatus": raw_payload_storage_status(raw),
    }
