from __future__ import annotations

import asyncio
import hashlib
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any, Literal
from urllib.parse import urlencode

import httpx
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, field_validator

from .bilibili_follower import (
    BilibiliCrawlerError,
    _decode_json,
    _object,
    _optional_text,
    _write_object_sync,
)
from .bilibili_follower_errors import response_code
from .bilibili_follower_long import parse_java_long
from .bilibili_follower_response_text import bilibili_response_encoding, bilibili_response_text
from .bilibili_live_http import BilibiliLiveHttpConfiguration, BilibiliLiveHttpRequest
from .jackson_tree_json import jackson_tree_json
from .postgres_jsonb_input import raw_payload_storage_status

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


class BilibiliWbiKeys(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    img_key: StrictStr = Field(alias="imgKey", min_length=1)
    sub_key: StrictStr = Field(alias="subKey", min_length=1)


class BilibiliLiveRankRequest(BilibiliLiveHttpRequest):
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
    web_location: StrictStr = Field(default="444.8", alias="webLocation")
    wbi_cache_seconds: Annotated[StrictInt, Field(ge=-2147483648, le=2147483647)] = Field(
        default=43200, alias="wbiCacheSeconds"
    )
    wbi_keys: BilibiliWbiKeys | None = Field(
        default=None, alias="wbiKeys", exclude_if=lambda value: value is None
    )

    @field_validator("wbi_keys", mode="before")
    @classmethod
    def provided_wbi_keys_must_be_object(cls, value: object) -> object:
        if value is None:
            raise ValueError("wbiKeys must be an object when provided")
        return value


def _put(result: dict[str, object], key: str, value: object | None) -> None:
    if value is not None:
        result[key] = value


def _optional_int(value: object) -> int | None:
    return parse_java_long(value.replace(",", "") if isinstance(value, str) else value)


def _response_id(value: object) -> str | None:
    number = _optional_int(value)
    return str(number) if number is not None else None


def _rank_integer(value: object) -> int | None:
    number = _optional_int(value)
    return (number + 2**31) % (2**32) - 2**31 if number is not None else None


def _first_int(*values: object) -> int | None:
    for value in values:
        number = _rank_integer(value)
        if number is not None:
            return number
    return None


def _first_present_object(*values: object) -> dict[str, Any]:
    for value in values:
        # JsonNode.firstPresent selects empty objects and scalars too. Their
        # child paths are missing; only null/missing permits the next candidate.
        if value is not None:
            return _object(value)
    return {}


def _entry_facts(result: dict[str, object], value: object, medal: dict[str, Any]) -> None:
    _put(result, "medalRuid", _response_id(medal.get("ruid")))
    _put(result, "medalIsLight", _rank_integer(medal.get("is_light")))
    raw = jackson_tree_json(value)
    result["rawEntryJson"] = raw
    # JsonNode's String writer leaves isolated UTF16 raw; pgjdbc encodes it as '?'
    # before PostgreSQL validates JSONB. Original HTTP bytes remain in CAS.
    result["rawEntryStorageStatus"] = raw_payload_storage_status(
        raw.encode("utf-8", "replace").decode("utf-8")
    )


def _audience_entry(
    value: object, entry_kind: str = "LIST", with_entry_facts: bool = False
) -> dict[str, object]:
    item = _object(value)
    uinfo = _object(item.get("uinfo"))
    medal = _first_present_object(item.get("medal_info"), item.get("medalInfo"), uinfo.get("medal"))
    guard = _first_present_object(uinfo.get("guard"), item.get("guard"))
    result: dict[str, object] = {"entryKind": entry_kind}
    _put(result, "userUid", _response_id(item.get("uid")))
    _put(result, "rankNo", _rank_integer(item.get("rank")))
    _put(
        result, "displayName", _optional_text(item.get("name")) or _optional_text(item.get("uname"))
    )
    _put(result, "faceUrl", _optional_text(item.get("face")))
    _put(result, "score", _optional_int(item.get("score")))
    _put(result, "guardLevel", _first_int(item.get("guard_level"), guard.get("level")))
    _put(result, "wealthLevel", _rank_integer(item.get("wealth_level")))
    _put(
        result,
        "medalName",
        _optional_text(medal.get("medal_name")) or _optional_text(medal.get("name")),
    )
    _put(result, "medalLevel", _first_int(medal.get("medal_level"), medal.get("level")))
    _put(result, "guardExpiredText", _optional_text(guard.get("expired_str")))
    if with_entry_facts:
        _entry_facts(result, value, medal)
    return result


def _guard_entry(
    value: object, entry_kind: str, with_entry_facts: bool = False
) -> dict[str, object]:
    item = _object(value)
    uinfo = _object(item.get("uinfo"))
    base = _object(uinfo.get("base"))
    medal = _object(uinfo.get("medal"))
    guard = _object(uinfo.get("guard"))
    wealth = _object(uinfo.get("wealth"))
    result: dict[str, object] = {"entryKind": entry_kind}
    _put(result, "userUid", _response_id(uinfo.get("uid")) or _response_id(item.get("uid")))
    _put(result, "rankNo", _rank_integer(item.get("rank")))
    _put(
        result,
        "displayName",
        _optional_text(base.get("name")) or _optional_text(item.get("username")),
    )
    _put(result, "faceUrl", _optional_text(base.get("face")) or _optional_text(item.get("face")))
    _put(result, "score", _optional_int(item.get("score")))
    _put(result, "guardLevel", _first_int(guard.get("level"), item.get("guard_level")))
    _put(result, "wealthLevel", _rank_integer(wealth.get("level")))
    _put(
        result,
        "medalName",
        _optional_text(medal.get("name")) or _optional_text(medal.get("medal_name")),
    )
    _put(result, "medalLevel", _first_int(medal.get("level"), medal.get("medal_level")))
    _put(result, "guardExpiredText", _optional_text(guard.get("expired_str")))
    _put(result, "accompanyDays", _rank_integer(item.get("accompany")))
    if with_entry_facts:
        _entry_facts(result, value, medal)
    return result


def _ensure_rank_success(root: dict[str, Any], endpoint: str) -> None:
    code = response_code(root.get("code"))
    if code == 0:
        return
    error_type = {
        -101: "BILIBILI_AUTH_EXPIRED",
        -352: "BILIBILI_RISK_CONTROL",
        -412: "BILIBILI_RISK_CONTROL",
    }.get(code, "BILIBILI_UNKNOWN_ERROR")
    raise BilibiliCrawlerError(
        error_type,
        _optional_text(root.get("message")) or f"Bilibili live rank API error: {code}",
        retryable=code in (-352, -412, -500) or code >= 500,
        endpoint=endpoint,
        status_code=200,
        bili_code=code,
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
    with_entry_facts: bool = False,
) -> dict[str, object]:
    root = _decode_json(raw, endpoint)
    _ensure_rank_success(root, endpoint)
    data = _object(root.get("data"))
    config = _object(data.get("config"))
    fallback = endpoint == ONLINE_GOLD_RANK_ENDPOINT
    raw_entries = data.get("OnlineRankItem" if fallback else "item")
    entries = (
        [_audience_entry(item, with_entry_facts=with_entry_facts) for item in raw_entries]
        if isinstance(raw_entries, list)
        else []
    )
    result: dict[str, object] = {
        "rankFamily": "AUDIENCE",
        "rankType": "online_rank" if fallback else rank_type,
        "rankSwitch": "contribution_rank" if fallback else rank_switch,
        "periodScope": "REALTIME" if fallback else period_scope,
        "pageNo": page,
        "pageSize": page_size,
        "sourceEndpoint": endpoint,
        "signedRequired": False if fallback else signed_required,
        "capturedAt": captured_at,
        "entries": entries,
    }
    _put(result, "totalCount", _optional_int(data.get("onlineNum" if fallback else "count")))
    _put(
        result,
        "countText",
        _optional_text(data.get("onlineNumText" if fallback else "count_text")),
    )
    _put(
        result,
        "valueText",
        "贡献值" if fallback else _optional_text(config.get("value_text")),
    )
    _put(
        result,
        "remindMsg",
        "在线贡献榜备用接口" if fallback else _optional_text(config.get("title")),
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
    with_entry_facts: bool = False,
) -> dict[str, object]:
    root = _decode_json(raw, GUARD_RANK_ENDPOINT)
    _ensure_rank_success(root, GUARD_RANK_ENDPOINT)
    data = _object(root.get("data"))
    info = _object(data.get("info"))
    entries: list[dict[str, object]] = []
    for key, kind in (("top3", "TOP3"), ("list", "LIST"), ("extop", "EXTOP")):
        values = data.get(key)
        if isinstance(values, list):
            entries.extend(_guard_entry(item, kind, with_entry_facts) for item in values)
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
    total_count = _optional_int(info.get("num"))
    _put(result, "totalCount", total_count)
    _put(
        result,
        "countText",
        _optional_text(info.get("num_text"))
        or (str(total_count) if total_count is not None else None),
    )
    _put(result, "remindMsg", _optional_text(data.get("remind_msg")))
    return result


def _wbi_mixin_key(img_key: str, sub_key: str) -> str:
    combined = (img_key + sub_key).encode("utf-16-le", errors="surrogatepass")
    selected = bytearray()
    for index in MIXIN_KEY_ENC_TAB[:32]:
        # Java String.charAt indexes UTF-16 units, including isolated surrogates.
        selected.extend((combined[index * 2], combined[index * 2 + 1]))
    return selected.decode("utf-16-le", errors="surrogatepass")


def sign_wbi_params(
    params: dict[str, str], *, img_key: str, sub_key: str, timestamp: int
) -> dict[str, str]:
    mixin_key = _wbi_mixin_key(img_key, sub_key)
    sorted_params = {**params, "wts": str(timestamp)}
    filtered = {
        key: WBI_FILTER.sub("", value)
        for key, value in sorted(sorted_params.items(), key=lambda item: item[0])
    }
    query = urlencode(filtered)
    result = dict(params)
    result["wts"] = str(timestamp)
    result["w_rid"] = hashlib.md5((query + mixin_key).encode("utf-8", errors="replace")).hexdigest()
    return result


async def _get(client: httpx.AsyncClient, endpoint: str, params: dict[str, str]) -> httpx.Response:
    try:
        response = await client.get(
            ENDPOINT_URLS[endpoint],
            params=params,
            headers=(
                {"Referer": "https://www.bilibili.com/"} if endpoint == WBI_NAV_ENDPOINT else None
            ),
        )
    except httpx.RequestError as error:
        raise BilibiliCrawlerError(
            "BILIBILI_NETWORK_ERROR",
            f"Network error calling Bilibili live rank API: {error}",
            retryable=True,
            endpoint=endpoint,
        ) from error
    is_rank = endpoint != WBI_NAV_ENDPOINT
    # Both the original RankApiClient and WbiSigner use RestClient String.
    bilibili_response_encoding(response)
    if response.status_code >= 400:
        if not is_rank:
            raise BilibiliCrawlerError(
                "BILIBILI_UNKNOWN_ERROR",
                f"Bilibili WBI key request failed with HTTP {response.status_code}",
                retryable=True,
                endpoint=endpoint,
                status_code=response.status_code,
            )
        code = (
            "BILIBILI_RATE_LIMITED"
            if response.status_code == 429
            else (
                "BILIBILI_SERVER_ERROR"
                if response.status_code >= 500
                else "BILIBILI_UNKNOWN_ERROR" if is_rank else "BILIBILI_HTTP_ERROR"
            )
        )
        raise BilibiliCrawlerError(
            code,
            (
                f"Bilibili live rank HTTP {response.status_code} from {endpoint}"
                if is_rank
                else f"Bilibili HTTP {response.status_code} from {endpoint}"
            ),
            retryable=response.status_code == 429 or response.status_code >= 500,
            endpoint=endpoint,
            status_code=response.status_code,
        )
    return response


async def _wbi_keys(
    client: httpx.AsyncClient, force_refresh: bool, wbi_cache_seconds: int = 43200
) -> tuple[str, str]:
    global _cached_wbi_keys
    now = time.time()
    if not force_refresh and _cached_wbi_keys is not None and _cached_wbi_keys[2] > now:
        return _cached_wbi_keys[0], _cached_wbi_keys[1]
    response = await _get(client, WBI_NAV_ENDPOINT, {})
    raw = bilibili_response_text(response.content, bilibili_response_encoding(response))
    if raw is None:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Unable to parse Bilibili WBI key response.",
            retryable=True,
            endpoint=WBI_NAV_ENDPOINT,
            status_code=response.status_code,
        )
    root = _decode_json(raw, WBI_NAV_ENDPOINT)
    code = response_code(root.get("code"))
    if code not in (0, -101):
        raise BilibiliCrawlerError(
            "BILIBILI_UNKNOWN_ERROR",
            f"Bilibili nav API returned code {code}",
            retryable=True,
            endpoint=WBI_NAV_ENDPOINT,
            status_code=200,
            bili_code=code,
        )
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
    img_key, sub_key = img_match.group(1), sub_match.group(1)
    try:
        # The original signer derives the mixin inside fetchKeys, before cache
        # publication. Do not publish unusable keys and fail later in signing.
        _wbi_mixin_key(img_key, sub_key)
    except IndexError as error:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Unable to parse Bilibili WBI key response: WBI key is too short.",
            retryable=True,
            endpoint=WBI_NAV_ENDPOINT,
            status_code=200,
        ) from error
    _cached_wbi_keys = (
        img_key,
        sub_key,
        time.time() + max(300, wbi_cache_seconds),
    )
    return _cached_wbi_keys[0], _cached_wbi_keys[1]


async def fetch_live_rank(payload: dict[str, object], data_directory: Path) -> dict[str, Any]:
    request = BilibiliLiveRankRequest.model_validate(payload)
    configuration = request.http_configuration or BilibiliLiveHttpConfiguration()
    endpoint = request.endpoint or (
        GUARD_RANK_ENDPOINT if request.family == "GUARD" else AUDIENCE_RANK_ENDPOINT
    )
    started = time.perf_counter()
    async with httpx.AsyncClient(
        timeout=configuration.timeout(),
        headers=configuration.headers(),
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
            if request.wbi_keys is not None:
                img_key, sub_key = request.wbi_keys.img_key, request.wbi_keys.sub_key
            else:
                img_key, sub_key = await _wbi_keys(
                    client, request.force_refresh_wbi, request.wbi_cache_seconds
                )
            parameters = sign_wbi_params(
                {
                    "ruid": request.ruid,
                    "room_id": request.room_id,
                    "page": str(request.page),
                    "page_size": str(request.page_size),
                    "type": request.type,
                    "switch": request.rank_switch or "",
                    "platform": "web",
                    "web_location": request.web_location,
                },
                img_key=img_key,
                sub_key=sub_key,
                timestamp=int(time.time()),
            )
        response = await _get(client, endpoint, parameters)

    duration_ms = int((time.perf_counter() - started) * 1000)
    raw = bilibili_response_text(response.content, bilibili_response_encoding(response))
    if raw is None:
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Unable to parse an empty Bilibili live rank response body.",
            retryable=False,
            endpoint=endpoint,
            status_code=response.status_code,
        )
    captured_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if endpoint == GUARD_RANK_ENDPOINT:
        parsed = parse_guard_rank_response(
            raw,
            rank_type=request.type,
            period_scope=request.period_scope or "CURRENT",
            page=request.page,
            page_size=min(request.page_size, 30),
            captured_at=captured_at,
            with_entry_facts=True,
        )
    else:
        parsed = parse_audience_rank_response(
            raw,
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
            with_entry_facts=True,
        )
    evidence = await asyncio.to_thread(_write_object_sync, data_directory, response.content)
    return {
        **parsed,
        "evidenceObject": evidence,
        "statusCode": response.status_code,
        "durationMs": duration_ms,
        "rawPayloadStorageStatus": raw_payload_storage_status(raw),
    }
