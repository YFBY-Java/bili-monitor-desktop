"""Synthetic rank network boundary; production Core, HTTPX and parsers remain real."""

import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "src"))
from bmd_workers import bilibili_rank as rank

original_client = httpx.AsyncClient
original_fetch = rank.fetch_live_rank


async def fetch_with_cache_assertion(payload, data_directory):
    assert payload["wbiCacheSeconds"] == -8
    if payload.get("endpoint", "").endswith("queryContributionRank"):
        expected_key = (
            "é"
            if payload["httpConfiguration"]["userAgent"] == "Fixture WBI response String/1"
            else "1"
        )
        assert payload["wbiKeys"] == {"imgKey": expected_key * 32, "subKey": "b" * 32}
    return await original_fetch(payload, data_directory)


rank.fetch_live_rank = fetch_with_cache_assertion
raw_rank_calls = {}
storage_text_fixture = json.loads(
    (
        Path(__file__).resolve().parents[5] / "packages/contracts/fixtures/rank-storage-text.json"
    ).read_text("utf-8")
)
api_response_fixture = json.loads(
    (
        Path(__file__).resolve().parents[5] / "packages/contracts/fixtures/rank-api-responses.json"
    ).read_text("utf-8")
)
response_fields_fixture = json.loads(
    (
        Path(__file__).resolve().parents[5]
        / "packages/contracts/fixtures/rank-response-fields.json"
    ).read_text("utf-8")
)
long64_fixture = json.loads(
    (
        Path(__file__).resolve().parents[5] / "packages/contracts/fixtures/rank-long64.json"
    ).read_text("utf-8")
)
entry_facts_fixture = json.loads(
    (
        Path(__file__).resolve().parents[5] / "packages/contracts/fixtures/rank-entry-facts.json"
    ).read_text("utf-8")
)


def replay(request):
    assert request.url.host in {"api.bilibili.com", "api.live.bilibili.com"}
    assert request.headers["User-Agent"] in {
        "Fixture rank configuration/2",
        "Fixture WBI response String/1",
    }
    assert request.headers["Referer"] == (
        "https://www.bilibili.com/"
        if request.url.path.endswith("/nav")
        else "https://live.bilibili.com/configured-rank"
    )
    assert request.extensions["timeout"] == {
        "connect": 1.25,
        "read": None,
        "write": None,
        "pool": None,
    }
    if request.url.path.endswith("/nav"):
        raise AssertionError("Desktop Rank must use the shared Node WBI owner.")
    elif "/rank/" in request.url.path or "/guardTab/" in request.url.path:
        if request.url.params.get("ruid") == "17":
            sample = "guard" if request.url.path.endswith("topListNew") else "audience"
            return httpx.Response(200, json=entry_facts_fixture[sample]["body"])
        if request.url.params.get("ruid") == "16":
            sample = "guard" if request.url.path.endswith("topListNew") else "audience"
            return httpx.Response(200, json=long64_fixture[sample]["body"])
        if request.url.params.get("ruid") == "15":
            if request.url.path.endswith("topListNew"):
                sample = "guard"
            elif request.url.path.endswith("getOnlineGoldRank"):
                sample = "fallback"
            elif request.url.params.get("switch") == "contribution_rank":
                return httpx.Response(
                    200, json={"code": -101, "message": "synthetic primary unavailable"}
                )
            else:
                assert request.url.params.get("type") == "daily_rank"
                raw_rank_calls["fields-15"] = raw_rank_calls.get("fields-15", 0) + 1
                assert raw_rank_calls["fields-15"] <= 2, "Unexpected extra primary field request"
                sample = (
                    "audiencePresent" if raw_rank_calls["fields-15"] == 1 else "audienceMissing"
                )
            return httpx.Response(200, json=response_fields_fixture[sample]["body"])
        if request.url.params.get("ruid") == "14":
            assert request.url.path.endswith("topListNew")
            raw_rank_calls["api-14"] = raw_rank_calls.get("api-14", 0) + 1
            index = raw_rank_calls["api-14"] - 1
            assert index < len(api_response_fixture), "Unexpected additional rank API request"
            return httpx.Response(200, json=api_response_fixture[index]["body"])
        if request.url.params.get("ruid") == "13":
            key = ("13", request.url.path)
            raw_rank_calls[key] = raw_rank_calls.get(key, 0) + 1
            sample = (
                "audience"
                if request.url.path.endswith("queryContributionRank")
                else "guard" if raw_rank_calls[key] == 1 else "failed"
            )
            return httpx.Response(
                200,
                content=json.dumps(storage_text_fixture[sample]["body"], ensure_ascii=False).encode(
                    "utf-8"
                ),
                headers={"Content-Type": "application/json; charset=UTF-8"},
            )
        if request.url.params.get("ruid") == "12":
            assert request.url.path.endswith("topListNew")
            key = (request.url.params.get("typ"), request.url.params.get("page"))
            raw_rank_calls[key] = raw_rank_calls.get(key, 0) + 1
            data = {
                "info": {"num": 10 + raw_rank_calls[key]},
                "list": [
                    {"rank": 1, "uinfo": {"uid": 91, "base": {"name": "first viewer"}}},
                    {"rank": 2, "uinfo": {"uid": 92, "base": {"name": "second viewer"}}},
                ],
            }
            extra = (
                '{"old":"\\u0000","old":"valid"}'
                if key == ("4", "2") and raw_rank_calls[key] == 1
                else '"valid"'
            )
            raw = '{"code":0,"data":' + json.dumps(data) + ',"unused":' + extra + "}"
            return httpx.Response(200, content=raw.encode("utf-8"))
        if request.url.params.get("ruid") == "4":
            if request.url.path.endswith("queryContributionRank"):
                return httpx.Response(
                    503,
                    content=b"private rank upstream body",
                    headers={"Content-Type": "application/json;charset=not-a-real-charset"},
                )
            if request.url.path.endswith("topListNew"):
                return httpx.Response(
                    200,
                    content=json.dumps(
                        {
                            "code": 0,
                            "data": {
                                "info": {"num": 1},
                                "list": [{"uinfo": {"uid": 9, "base": {"name": " café viewer "}}}],
                            },
                        },
                        ensure_ascii=False,
                    ).encode("iso-8859-1"),
                )
        if (
            request.url.path.endswith("queryContributionRank")
            and request.url.params.get("ruid") == "3"
        ):
            return httpx.Response(500, json={"code": 500})
        data = {
            "count": 1,
            "onlineNum": 1,
            "info": {"num": 1},
            "item": [{"uid": 9, "name": "合成配置榜单观众"}],
            "OnlineRankItem": [{"uid": 9, "name": "合成配置榜单观众"}],
            "list": [{"uinfo": {"uid": 9, "base": {"name": "合成配置榜单观众"}}}],
        }
    else:
        uid = request.url.params.get("uids[]", "2")
        data = {
            "uid": int(uid),
            "room_id": 100 + int(uid),
            "live_status": 0,
            "uname": "合成配置主播",
        }
        if request.url.path.endswith("get_status_info_by_uids"):
            data = {uid: data}
    return httpx.Response(200, json={"code": 0, "data": data})


httpx.AsyncClient = lambda **kwargs: original_client(
    **kwargs, transport=httpx.MockTransport(replay)
)
