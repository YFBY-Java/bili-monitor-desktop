import asyncio
import json
from pathlib import Path

import httpx
import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from bmd_workers import bilibili_rank as rank

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
FIXTURES = json.loads((CONTRACTS / "fixtures/live-http-configuration.json").read_text("utf-8"))
ENDPOINTS = [rank.AUDIENCE_RANK_ENDPOINT, rank.ONLINE_GOLD_RANK_ENDPOINT, rank.GUARD_RANK_ENDPOINT]
DEFAULT_UA = "SocialDataMonitor/0.1 (+low-frequency public Bilibili live monitor)"


def rank_request(endpoint=rank.AUDIENCE_RANK_ENDPOINT):
    return {
        "taskId": "t",
        "attempt": 1,
        "leaseId": "l",
        "roomId": "102",
        "ruid": "2",
        "family": "GUARD" if endpoint == rank.GUARD_RANK_ENDPOINT else "AUDIENCE",
        "type": "guard_weekly" if endpoint == rank.GUARD_RANK_ENDPOINT else "online_rank",
        "rankSwitch": "contribution_rank",
        "page": 1,
        "pageSize": 30,
        "endpoint": endpoint,
    }


@pytest.mark.parametrize("fixture", FIXTURES, ids=[f["name"] for f in FIXTURES])
def test_rank_http_shared_configuration(fixture):
    payload = {**rank_request(), "httpConfiguration": fixture["input"]}
    schema = json.loads(
        (CONTRACTS / "schemas/bilibili-live-rank-worker.v1.schema.json").read_text("utf-8")
    )
    assert Draft202012Validator(schema).is_valid(payload) == fixture["valid"]
    if fixture["valid"]:
        rank.BilibiliLiveRankRequest.model_validate(payload)
    else:
        with pytest.raises(ValidationError):
            rank.BilibiliLiveRankRequest.model_validate(payload)


@pytest.mark.parametrize("endpoint", ENDPOINTS)
@pytest.mark.parametrize(
    "configuration",
    [
        None,
        {},
        {
            "connectTimeoutMs": 1250,
            "readTimeoutMs": 2500,
            "userAgent": "Synthetic rank monitor/2",
            "referer": "https://live.bilibili.com/2",
        },
        {"connectTimeoutMs": 0, "readTimeoutMs": 0},
    ],
)
def test_actual_rank_and_wbi_http_configuration(monkeypatch, tmp_path, endpoint, configuration):
    observed = []
    monkeypatch.setattr(rank, "_cached_wbi_keys", None)

    def respond(request):
        observed.append(request)
        if request.url.path.endswith("/nav"):
            return httpx.Response(
                200,
                json={
                    "code": -101,
                    "data": {
                        "wbi_img": {
                            "img_url": "https://i0.hdslb.com/" + "a" * 32 + ".png",
                            "sub_url": "https://i0.hdslb.com/" + "b" * 32 + ".png",
                        }
                    },
                },
            )
        return httpx.Response(
            200,
            json={
                "code": 0,
                "data": {
                    "count": 1,
                    "onlineNum": 1,
                    "info": {"num": 1},
                    "item": [{"uid": 9, "name": "合成榜单观众"}],
                    "OnlineRankItem": [{"uid": 9, "name": "合成榜单观众"}],
                    "list": [{"uinfo": {"uid": 9, "base": {"name": "合成榜单观众"}}}],
                },
            },
        )

    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original_client(**kwargs, transport=httpx.MockTransport(respond)),
    )
    payload = rank_request(endpoint)
    if configuration is not None:
        payload["httpConfiguration"] = configuration
    result = asyncio.run(rank.fetch_live_rank(payload, tmp_path))
    expected = configuration or {}
    assert len(observed) == (2 if endpoint == rank.AUDIENCE_RANK_ENDPOINT else 1)
    for request in observed:
        assert request.extensions["timeout"] == {
            "connect": expected.get("connectTimeoutMs", 5000) / 1000 or None,
            "read": expected.get("readTimeoutMs", 10000) / 1000 or None,
            "write": None,
            "pool": None,
        }
        assert request.headers["User-Agent"] == expected.get("userAgent", DEFAULT_UA)
        assert request.headers["Referer"] == (
            "https://www.bilibili.com/"
            if request.url.path.endswith("/nav")
            else expected.get("referer", "https://live.bilibili.com/")
        )
        assert request.headers["Accept"] == "application/json"
        assert "Cookie" not in request.headers and "Authorization" not in request.headers
        assert str(request.url).split("?")[0] in rank.ENDPOINT_URLS.values()
    assert result["entries"][0]["displayName"] == "合成榜单观众"
    assert "合成榜单观众" in (tmp_path / result["evidenceObject"]["relativePath"]).read_text(
        "utf-8"
    )
    if configuration is None:
        assert "httpConfiguration" not in rank.BilibiliLiveRankRequest.model_validate(
            payload
        ).model_dump(by_alias=True)


def test_explicit_null_configuration_is_not_legacy_omission():
    with pytest.raises(ValidationError):
        rank.BilibiliLiveRankRequest.model_validate({**rank_request(), "httpConfiguration": None})


def test_rank_wbi_cache_uses_success_time_floor_and_force_refresh(monkeypatch, tmp_path):
    monkeypatch.setattr(rank, "_cached_wbi_keys", None)
    now = [1000.0]
    nav_calls = []
    nav_failure = [False]
    monkeypatch.setattr(rank.time, "time", lambda: now[0])

    def respond(request):
        if request.url.path.endswith("/nav"):
            nav_calls.append(request)
            now[0] += 10
            if nav_failure[0]:
                return httpx.Response(
                    200, json={"code": "-352", "message": "ignored original nav message"}
                )
            return httpx.Response(
                200,
                json={
                    "code": "-101",
                    "data": {
                        "wbi_img": {
                            "img_url": "https://i0.hdslb.com/" + "a" * 32 + ".png",
                            "sub_url": "https://i0.hdslb.com/" + "b" * 32 + ".png",
                        }
                    },
                },
            )
        return httpx.Response(200, json={"code": 0, "data": {"item": []}})

    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original_client(**kwargs, transport=httpx.MockTransport(respond)),
    )
    payload = {**rank_request(), "wbiCacheSeconds": -8}
    asyncio.run(rank.fetch_live_rank(payload, tmp_path))
    assert rank._cached_wbi_keys[2] == 1310
    now[0] = 1309
    asyncio.run(rank.fetch_live_rank(payload, tmp_path))
    assert len(nav_calls) == 1
    now[0] = 1310
    asyncio.run(rank.fetch_live_rank(payload, tmp_path))
    assert len(nav_calls) == 2
    assert rank._cached_wbi_keys[2] == 1620
    asyncio.run(rank.fetch_live_rank({**payload, "forceRefreshWbi": True}, tmp_path))
    assert len(nav_calls) == 3
    assert rank._cached_wbi_keys[2] == 1630
    assert rank.BilibiliLiveRankRequest.model_validate(rank_request()).wbi_cache_seconds == 43200
    supplied_keys = {"imgKey": "c" * 32, "subKey": "d" * 32}
    supplied_payload = {**payload, "wbiKeys": supplied_keys, "forceRefreshWbi": True}
    schema = json.loads(
        (CONTRACTS / "schemas/bilibili-live-rank-worker.v1.schema.json").read_text("utf-8")
    )
    Draft202012Validator(schema).validate(supplied_payload)
    asyncio.run(rank.fetch_live_rank(supplied_payload, tmp_path))
    assert len(nav_calls) == 3
    assert rank._cached_wbi_keys == ("a" * 32, "b" * 32, 1630)
    nav_failure[0] = True
    with pytest.raises(rank.BilibiliCrawlerError) as failed:
        asyncio.run(rank.fetch_live_rank({**payload, "forceRefreshWbi": True}, tmp_path))
    assert failed.value.code == "BILIBILI_UNKNOWN_ERROR"
    assert failed.value.retryable is True
    assert failed.value.endpoint == rank.WBI_NAV_ENDPOINT
    assert failed.value.status_code == 200
    assert failed.value.bili_code == -352
    assert str(failed.value) == "Bilibili nav API returned code -352"
    assert rank._cached_wbi_keys == ("a" * 32, "b" * 32, 1630)
    asyncio.run(rank.fetch_live_rank(payload, tmp_path))
    assert len(nav_calls) == 4
