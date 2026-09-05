from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field

from .bilibili_follower import (
    BilibiliCrawlerError,
    _decode_json,
    _ensure_success,
    _object,
    _optional_int,
    _optional_text,
    _write_object_sync,
)

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

CHINA_TIMEZONE = timezone(timedelta(hours=8))


class BilibiliLiveRoomRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    task_id: str = Field(alias="taskId", min_length=1)
    attempt: int = Field(ge=1)
    lease_id: str = Field(alias="leaseId", min_length=1)
    room_id: str = Field(alias="roomId", pattern=r"^[1-9]\d*$")


class BilibiliLiveUidRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    task_id: str = Field(alias="taskId", min_length=1)
    attempt: int = Field(ge=1)
    lease_id: str = Field(alias="leaseId", min_length=1)
    uid: str = Field(pattern=r"^[1-9]\d*$")


class BilibiliLiveStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    task_id: str = Field(alias="taskId", min_length=1)
    attempt: int = Field(ge=1)
    lease_id: str = Field(alias="leaseId", min_length=1)
    uids: list[str] = Field(min_length=1, max_length=30)


def _positive_id(value: object) -> str | None:
    number = _optional_int(value)
    return str(number) if number is not None and number > 0 else None


def _live_status(value: object) -> int:
    status = _optional_int(value)
    return status if status in (0, 1, 2) else 0


def _live_time(value: object) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        if value <= 0:
            return None
        return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")
    text = str(value).strip()
    if not text or text.startswith("0000-00-00"):
        return None
    try:
        parsed = datetime.strptime(text, "%Y-%m-%d %H:%M:%S").replace(tzinfo=CHINA_TIMEZONE)
    except ValueError:
        return None
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


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
    _put(result, "shortId", _positive_id(item.get("short_id")))
    _put(result, "uname", _optional_text(item.get("uname")))
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
        _positive_id(item.get("area_v2_id")) or _positive_id(item.get("area_id")),
    )
    _put(
        result,
        "areaName",
        _optional_text(item.get("area_v2_name")) or _optional_text(item.get("area_name")),
    )
    _put(
        result,
        "parentAreaId",
        _positive_id(item.get("area_v2_parent_id")) or _positive_id(item.get("parent_area_id")),
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
            _optional_int(item.get("online")),
            _optional_int(_object(item.get("watched_show")).get("num")),
        ),
    )
    _put(result, "attentionCount", _optional_int(item.get("attention")))
    return result


def parse_status_by_uids_response(raw: str, fetched_at: str) -> list[dict[str, object]]:
    del fetched_at
    root = _decode_json(raw, STATUS_BY_UIDS_ENDPOINT)
    _ensure_success(root, STATUS_BY_UIDS_ENDPOINT)
    data = _object(root.get("data"))
    return [
        _status_item(_object(item), str(uid), STATUS_BY_UIDS_ENDPOINT) for uid, item in data.items()
    ]


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
    _put(result, "shortId", _positive_id(data.get("short_id")))
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
    _put(result, "shortId", _positive_id(data.get("short_id")))
    _put(result, "title", _optional_text(data.get("title")))
    _put(
        result,
        "coverUrl",
        _optional_text(data.get("user_cover"))
        or _optional_text(data.get("cover"))
        or _optional_text(data.get("background")),
    )
    _put(result, "keyframeUrl", _optional_text(data.get("keyframe")))
    _put(result, "areaId", _positive_id(data.get("area_id")))
    _put(result, "areaName", _optional_text(data.get("area_name")))
    _put(result, "parentAreaId", _positive_id(data.get("parent_area_id")))
    _put(result, "parentAreaName", _optional_text(data.get("parent_area_name")))
    _put(result, "liveTime", _live_time(data.get("live_time")))
    _put(result, "onlineCount", _optional_int(data.get("online")))
    _put(result, "attentionCount", _optional_int(data.get("attention")))
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
            data.get("liveStatus")
            if data.get("liveStatus") is not None
            else data.get("live_status")
        ),
    }
    _put(result, "title", _optional_text(data.get("title")))
    _put(result, "coverUrl", _optional_text(data.get("cover")))
    _put(result, "onlineCount", _optional_int(data.get("online")))
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

    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            headers={
                "Accept": "application/json",
                "User-Agent": "BiliMonitorDesktop/0.1 (+low-frequency public Bilibili live monitor)",
                "Referer": "https://live.bilibili.com/",
            },
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
    if response.status_code >= 400:
        code = (
            "BILIBILI_RATE_LIMITED"
            if response.status_code == 429
            else "BILIBILI_SERVER_ERROR" if response.status_code >= 500 else "BILIBILI_HTTP_ERROR"
        )
        raise BilibiliCrawlerError(
            code,
            f"Bilibili HTTP {response.status_code} from {endpoint}",
            retryable=response.status_code == 429 or response.status_code >= 500,
            endpoint=endpoint,
            status_code=response.status_code,
        )

    raw_bytes = response.content
    raw = raw_bytes.decode("utf-8")
    fetched_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    evidence = await asyncio.to_thread(_write_object_sync, data_directory, raw_bytes)
    common = {
        "fetchedAt": fetched_at,
        "sourceEndpoint": endpoint,
        "evidenceObject": evidence,
        "statusCode": response.status_code,
        "durationMs": duration_ms,
    }
    if endpoint == STATUS_BY_UIDS_ENDPOINT:
        return {"snapshots": parse_status_by_uids_response(raw, fetched_at), **common}
    if endpoint == ROOM_INIT_ENDPOINT:
        return {**parse_room_init_response(raw, fetched_at), **common}
    if endpoint == ROOM_INFO_ENDPOINT:
        return {**parse_room_info_response(raw, fetched_at), **common}
    return {
        "snapshot": parse_room_info_old_response(raw, str(payload["uid"]), fetched_at),
        **common,
    }
