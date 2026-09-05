from __future__ import annotations

import asyncio
import hashlib
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlencode

import httpx
from pydantic import BaseModel, ConfigDict, Field

from .bilibili_follower import (
    BilibiliCrawlerError,
    _decode_json,
    _object,
    _optional_int,
    _optional_text,
    _write_object_sync,
)

AUDIENCE_RANK_ENDPOINT = "xlive/general-interface/v1/rank/queryContributionRank"
ONLINE_GOLD_RANK_ENDPOINT = "xlive/general-interface/v1/rank/getOnlineGoldRank"
GUARD_RANK_ENDPOINT = "xlive/app-room/v2/guardTab/topListNew"
WBI_NAV_ENDPOINT = "x/web-interface/nav"

ENDPOINT_URLS = {
    AUDIENCE_RANK_ENDPOINT: (
        "https://api.live.bilibili.com/xlive/general-interface/v1/rank/queryContributionRank"
    ),
    ONLINE_GOLD_RANK_ENDPOINT: (
        "https://api.live.bilibili.com/xlive/general-interface/v1/rank/getOnlineGoldRank"
    ),
    GUARD_RANK_ENDPOINT: "https://api.live.bilibili.com/xlive/app-room/v2/guardTab/topListNew",
    WBI_NAV_ENDPOINT: "https://api.bilibili.com/x/web-interface/nav",
}

MIXIN_KEY_ENC_TAB = (
    46,
    47,
    18,
    2,
    53,
    8,
    23,
    32,
    15,
    50,
    10,
    31,
    58,
    3,
    45,
    35,
    27,
    43,
    5,
    49,
    33,
    9,
    42,
    19,
    29,
    28,
    14,
    39,
    12,
    38,
    41,
    13,
    37,
    48,
    7,
    16,
    24,
    55,
    40,
    61,
    26,
    17,
    0,
    1,
    60,
    51,
    30,
    4,
    22,
    25,
    54,
    21,
    56,
    59,
    6,
    63,
    57,
    62,
    11,
    36,
    20,
    34,
    44,
    52,
)
WBI_FILTER = re.compile(r"[!'()*]")
WBI_KEY_PATTERN = re.compile(r"/([^/]+)\.png(?:\?.*)?$")
_cached_wbi_keys: tuple[str, str, float] | None = None


class BilibiliLiveRankRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    task_id: str = Field(alias="taskId", min_length=1)
    attempt: int = Field(ge=1)
    lease_id: str = Field(alias="leaseId", min_length=1)
    room_id: str = Field(alias="roomId", pattern=r"^[1-9]\d*$")
    ruid: str = Field(pattern=r"^[1-9]\d*$")
    family: Literal["AUDIENCE", "GUARD"]
    type: str = Field(min_length=1, max_length=64)
    rank_switch: str | None = Field(default=None, alias="rankSwitch", max_length=64)
    period_scope: str | None = Field(default=None, alias="periodScope", max_length=32)
    guard_typ: int | None = Field(default=None, alias="guardTyp", ge=1, le=4)
    page: int = Field(ge=1, le=5)
    page_size: int = Field(alias="pageSize", ge=1, le=100)
    endpoint: (
        Literal[
            "xlive/general-interface/v1/rank/queryContributionRank",
            "xlive/general-interface/v1/rank/getOnlineGoldRank",
            "xlive/app-room/v2/guardTab/topListNew",
        ]
        | None
    ) = None
    force_refresh_wbi: bool = Field(default=False, alias="forceRefreshWbi")


def _put(result: dict[str, object], key: str, value: object | None) -> None:
    if value is not None:
        result[key] = value


def _positive_id(value: object) -> str | None:
    number = _optional_int(value)
    return str(number) if number is not None and number > 0 else None


def _positive_int(value: object) -> int | None:
    number = _optional_int(value)
    return number if number is not None and number > 0 else None


def _first_int(*values: object) -> int | None:
    for value in values:
        number = _optional_int(value)
        if number is not None:
            return number
    return None


def _first_object(*values: object) -> dict[str, Any]:
    for value in values:
        candidate = _object(value)
        if candidate:
            return candidate
    return {}


def _audience_entry(value: object, entry_kind: str = "LIST") -> dict[str, object]:
    item = _object(value)
    uinfo = _object(item.get("uinfo"))
    medal = _first_object(item.get("medal_info"), item.get("medalInfo"), uinfo.get("medal"))
    guard = _first_object(uinfo.get("guard"), item.get("guard"))
    result: dict[str, object] = {"entryKind": entry_kind}
    _put(result, "userUid", _positive_id(item.get("uid")))
    _put(result, "rankNo", _positive_int(item.get("rank")))
    _put(
        result, "displayName", _optional_text(item.get("name")) or _optional_text(item.get("uname"))
    )
    _put(result, "faceUrl", _optional_text(item.get("face")))
    _put(result, "score", _optional_int(item.get("score")))
    _put(result, "guardLevel", _first_int(item.get("guard_level"), guard.get("level")))
    _put(result, "wealthLevel", _optional_int(item.get("wealth_level")))
    _put(
        result,
        "medalName",
        _optional_text(medal.get("medal_name")) or _optional_text(medal.get("name")),
    )
    _put(result, "medalLevel", _first_int(medal.get("medal_level"), medal.get("level")))
    _put(result, "guardExpiredText", _optional_text(guard.get("expired_str")))
    return result


def _guard_entry(value: object, entry_kind: str) -> dict[str, object]:
    item = _object(value)
    uinfo = _object(item.get("uinfo"))
    base = _object(uinfo.get("base"))
    medal = _object(uinfo.get("medal"))
    guard = _object(uinfo.get("guard"))
    wealth = _object(uinfo.get("wealth"))
    result: dict[str, object] = {"entryKind": entry_kind}
    _put(result, "userUid", _positive_id(uinfo.get("uid")) or _positive_id(item.get("uid")))
    _put(result, "rankNo", _positive_int(item.get("rank")))
    _put(
        result,
        "displayName",
        _optional_text(base.get("name")) or _optional_text(item.get("username")),
    )
    _put(result, "faceUrl", _optional_text(base.get("face")) or _optional_text(item.get("face")))
    _put(result, "score", _optional_int(item.get("score")))
    _put(result, "guardLevel", _first_int(guard.get("level"), item.get("guard_level")))
    _put(result, "wealthLevel", _optional_int(wealth.get("level")))
    _put(
        result,
        "medalName",
        _optional_text(medal.get("name")) or _optional_text(medal.get("medal_name")),
    )
    _put(result, "medalLevel", _first_int(medal.get("level"), medal.get("medal_level")))
    _put(result, "guardExpiredText", _optional_text(guard.get("expired_str")))
    _put(result, "accompanyDays", _optional_int(item.get("accompany")))
    return result


def _ensure_rank_success(root: dict[str, Any], endpoint: str) -> None:
    code = root.get("code")
    if code == 0:
        return
    bili_code = int(code) if isinstance(code, int) and not isinstance(code, bool) else None
    risk_control = bili_code in (-352, -412)
    raise BilibiliCrawlerError(
        "BILIBILI_RISK_CONTROL" if risk_control else "BILIBILI_API_ERROR",
        _optional_text(root.get("message")) or f"Bilibili rank API error: {code}",
        retryable=risk_control or (bili_code is not None and bili_code >= 500),
        endpoint=endpoint,
        status_code=200,
        bili_code=bili_code,
    )


def parse_audience_rank_response(
    raw: str,
    *,
    rank_type: str,
    rank_switch: str,
    period_scope: str,
    page: int,
    page_size: int,
    endpoint: str,
    signed_required: bool,
    captured_at: str,
) -> dict[str, object]:
    root = _decode_json(raw, endpoint)
    _ensure_rank_success(root, endpoint)
    data = _object(root.get("data"))
    config = _object(data.get("config"))
    raw_entries = data.get("item")
    if not isinstance(raw_entries, list):
        raw_entries = data.get("OnlineRankItem")
    entries = (
        [_audience_entry(item) for item in raw_entries] if isinstance(raw_entries, list) else []
    )
    result: dict[str, object] = {
        "rankFamily": "AUDIENCE",
        "rankType": rank_type,
        "rankSwitch": rank_switch,
        "periodScope": period_scope,
        "pageNo": page,
        "pageSize": page_size,
        "sourceEndpoint": endpoint,
        "signedRequired": signed_required,
        "capturedAt": captured_at,
        "entries": entries,
    }
    _put(result, "totalCount", _first_int(data.get("count"), data.get("onlineNum")))
    _put(
        result,
        "countText",
        _optional_text(data.get("count_text")) or _optional_text(data.get("onlineNumText")),
    )
    _put(
        result,
        "valueText",
        _optional_text(config.get("value_text"))
        or ("贡献值" if endpoint == ONLINE_GOLD_RANK_ENDPOINT else None),
    )
    _put(
        result,
        "remindMsg",
        _optional_text(config.get("title"))
        or ("在线贡献榜备用接口" if endpoint == ONLINE_GOLD_RANK_ENDPOINT else None),
    )
    return result


def parse_guard_rank_response(
    raw: str,
    *,
    rank_type: str,
    period_scope: str,
    page: int,
    page_size: int,
    captured_at: str,
) -> dict[str, object]:
    root = _decode_json(raw, GUARD_RANK_ENDPOINT)
    _ensure_rank_success(root, GUARD_RANK_ENDPOINT)
    data = _object(root.get("data"))
    info = _object(data.get("info"))
    entries: list[dict[str, object]] = []
    for key, kind in (("top3", "TOP3"), ("list", "LIST"), ("extop", "EXTOP")):
        values = data.get(key)
        if isinstance(values, list):
            entries.extend(_guard_entry(item, kind) for item in values)
    result: dict[str, object] = {
        "rankFamily": "GUARD",
        "rankType": rank_type,
        "periodScope": period_scope,
        "pageNo": page,
        "pageSize": page_size,
        "sourceEndpoint": GUARD_RANK_ENDPOINT,
        "signedRequired": False,
        "capturedAt": captured_at,
        "entries": entries,
    }
    _put(result, "totalCount", _optional_int(info.get("num")))
    _put(
        result, "countText", _optional_text(info.get("num_text")) or _optional_text(info.get("num"))
    )
    _put(result, "remindMsg", _optional_text(data.get("remind_msg")))
    return result


def sign_wbi_params(
    params: dict[str, str], *, img_key: str, sub_key: str, timestamp: int
) -> dict[str, str]:
    combined = img_key + sub_key
    mixin_key = "".join(combined[index] for index in MIXIN_KEY_ENC_TAB[:32])
    sorted_params = {**params, "wts": str(timestamp)}
    filtered = {
        key: WBI_FILTER.sub("", value)
        for key, value in sorted(sorted_params.items(), key=lambda item: item[0])
    }
    query = urlencode(filtered)
    result = dict(params)
    result["wts"] = str(timestamp)
    result["w_rid"] = hashlib.md5((query + mixin_key).encode("utf-8")).hexdigest()
    return result


async def _get(client: httpx.AsyncClient, endpoint: str, params: dict[str, str]) -> httpx.Response:
    try:
        response = await client.get(ENDPOINT_URLS[endpoint], params=params)
    except httpx.RequestError as error:
        raise BilibiliCrawlerError(
            "BILIBILI_NETWORK_ERROR",
            f"Network error calling Bilibili live rank API: {error}",
            retryable=True,
            endpoint=endpoint,
        ) from error
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
    return response


async def _wbi_keys(client: httpx.AsyncClient, force_refresh: bool) -> tuple[str, str]:
    global _cached_wbi_keys
    now = time.time()
    if not force_refresh and _cached_wbi_keys is not None and _cached_wbi_keys[2] > now:
        return _cached_wbi_keys[0], _cached_wbi_keys[1]
    response = await _get(client, WBI_NAV_ENDPOINT, {})
    root = _decode_json(response.text, WBI_NAV_ENDPOINT)
    code = root.get("code")
    if code not in (0, -101):
        _ensure_rank_success(root, WBI_NAV_ENDPOINT)
    wbi_img = _object(_object(root.get("data")).get("wbi_img"))
    img_match = WBI_KEY_PATTERN.search(_optional_text(wbi_img.get("img_url")) or "")
    sub_match = WBI_KEY_PATTERN.search(_optional_text(wbi_img.get("sub_url")) or "")
    if img_match is None or sub_match is None:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Bilibili WBI response missing img_key/sub_key.",
            retryable=True,
            endpoint=WBI_NAV_ENDPOINT,
            status_code=response.status_code,
        )
    _cached_wbi_keys = (img_match.group(1), sub_match.group(1), now + 3600)
    return _cached_wbi_keys[0], _cached_wbi_keys[1]


async def fetch_live_rank(payload: dict[str, object], data_directory: Path) -> dict[str, Any]:
    request = BilibiliLiveRankRequest.model_validate(payload)
    endpoint = request.endpoint or (
        GUARD_RANK_ENDPOINT if request.family == "GUARD" else AUDIENCE_RANK_ENDPOINT
    )
    started = time.perf_counter()
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(10.0, connect=5.0),
        headers={
            "Accept": "application/json",
            "User-Agent": "BiliMonitorDesktop/0.1 (+low-frequency public Bilibili live rank monitor)",
            "Referer": "https://live.bilibili.com/",
        },
    ) as client:
        if endpoint == GUARD_RANK_ENDPOINT:
            parameters = {
                "roomid": request.room_id,
                "ruid": request.ruid,
                "page": str(request.page),
                "page_size": str(min(request.page_size, 30)),
                "typ": str(request.guard_typ or 4),
            }
        elif endpoint == ONLINE_GOLD_RANK_ENDPOINT:
            parameters = {
                "roomId": request.room_id,
                "ruid": request.ruid,
                "page": str(request.page),
                "pageSize": str(min(request.page_size, 50)),
            }
        else:
            img_key, sub_key = await _wbi_keys(client, request.force_refresh_wbi)
            parameters = sign_wbi_params(
                {
                    "ruid": request.ruid,
                    "room_id": request.room_id,
                    "page": str(request.page),
                    "page_size": str(request.page_size),
                    "type": request.type,
                    "switch": request.rank_switch or "",
                    "platform": "web",
                    "web_location": "444.8",
                },
                img_key=img_key,
                sub_key=sub_key,
                timestamp=int(time.time()),
            )
        response = await _get(client, endpoint, parameters)

    duration_ms = int((time.perf_counter() - started) * 1000)
    captured_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if endpoint == GUARD_RANK_ENDPOINT:
        parsed = parse_guard_rank_response(
            response.text,
            rank_type=request.type,
            period_scope=request.period_scope or "CURRENT",
            page=request.page,
            page_size=min(request.page_size, 30),
            captured_at=captured_at,
        )
    else:
        parsed = parse_audience_rank_response(
            response.text,
            rank_type="online_rank" if endpoint == ONLINE_GOLD_RANK_ENDPOINT else request.type,
            rank_switch=(
                "contribution_rank"
                if endpoint == ONLINE_GOLD_RANK_ENDPOINT
                else request.rank_switch or "contribution_rank"
            ),
            period_scope=request.period_scope or "REALTIME",
            page=request.page,
            page_size=(
                min(request.page_size, 50)
                if endpoint == ONLINE_GOLD_RANK_ENDPOINT
                else request.page_size
            ),
            endpoint=endpoint,
            signed_required=endpoint == AUDIENCE_RANK_ENDPOINT,
            captured_at=captured_at,
        )
    evidence = await asyncio.to_thread(_write_object_sync, data_directory, response.content)
    return {
        **parsed,
        "evidenceObject": evidence,
        "statusCode": response.status_code,
        "durationMs": duration_ms,
    }
