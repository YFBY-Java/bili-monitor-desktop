from __future__ import annotations

import asyncio
import hashlib
import importlib
import importlib.util
import json
from pathlib import Path

import httpx
import pytest

from bmd_workers.bilibili_follower import (
    CARD_ENDPOINT,
    RELATION_STAT_ENDPOINT,
    BilibiliCrawlerError,
    fetch_follower_endpoint,
    parse_card_response,
    parse_relation_stat_response,
)


def load_module():
    spec = importlib.util.find_spec("bmd_workers.bilibili_follower")
    assert spec is not None, "Bilibili follower connector module must exist"
    return importlib.import_module("bmd_workers.bilibili_follower")


def test_parses_the_same_public_card_fields_as_original_bilimonitor() -> None:
    module = load_module()
    raw = """
    {
      "code": 0,
      "message": "OK",
      "data": {
        "card": {
          "mid": "2",
          "name": "碧诗",
          "face": "https://i2.hdslb.com/bfs/face/example.jpg",
          "fans": 1395836,
          "attention": 423
        },
        "follower": 1395836
      }
    }
    """

    snapshot = module.parse_card_response(raw, "2026-08-29T12:00:00.000Z")

    assert snapshot == {
        "mid": "2",
        "nickname": "碧诗",
        "avatarUrl": "https://i2.hdslb.com/bfs/face/example.jpg",
        "profileUrl": "https://space.bilibili.com/2",
        "followerCount": 1395836,
        "followingCount": 423,
        "fetchedAt": "2026-08-29T12:00:00.000Z",
        "sourceEndpoint": "x/web-interface/card",
    }


def test_rejects_a_success_response_without_follower_count() -> None:
    module = load_module()
    raw = '{"code":0,"data":{"card":{"mid":"2","name":"碧诗"}}}'

    with pytest.raises(module.BilibiliCrawlerError) as raised:
        module.parse_card_response(raw, "2026-08-29T12:00:00.000Z")

    assert raised.value.code == "BILIBILI_PARSE_ERROR"
    assert raised.value.retryable is False


def test_card_uses_fans_and_friend_only_when_primary_counts_are_unavailable() -> None:
    raw = {
        "code": 0,
        "data": {"card": {"mid": "2", "name": "合成用户", "fans": "12", "friend": "3"}},
    }
    snapshot = parse_card_response(json.dumps(raw), "2026-09-13T04:00:00.000001Z")
    assert snapshot["followerCount"] == 12
    assert snapshot["followingCount"] == 3
    raw["data"]["follower"] = 0
    raw["data"]["card"]["attention"] = 0
    snapshot = parse_card_response(json.dumps(raw), "2026-09-13T04:00:00.000001Z")
    assert snapshot["followerCount"] == 0
    assert snapshot["followingCount"] == 0


def test_relation_snapshot_does_not_invent_profile_fields_or_missing_counts() -> None:
    snapshot = parse_relation_stat_response(
        '{"code":0,"data":{"mid":2,"follower":0}}', "2026-09-13T04:00:00.000001Z"
    )
    assert snapshot["mid"] == "2"
    assert snapshot["followerCount"] == 0
    assert "followingCount" not in snapshot
    assert "nickname" not in snapshot
    assert "avatarUrl" not in snapshot


@pytest.mark.parametrize(
    ("payload", "code", "retryable"),
    [
        ({"code": 0, "data": {"v_voucher": "synthetic"}}, "BILIBILI_RISK_CONTROL", False),
        ({"code": -352}, "BILIBILI_RISK_CONTROL", False),
        ({"code": -412}, "BILIBILI_RISK_CONTROL", False),
        ({"code": -101}, "BILIBILI_AUTH_EXPIRED", False),
        ({"code": 500}, "BILIBILI_API_ERROR", True),
    ],
)
def test_original_api_error_categories(payload: dict, code: str, retryable: bool) -> None:
    with pytest.raises(BilibiliCrawlerError) as raised:
        parse_card_response(json.dumps(payload), "2026-09-13T04:00:00.000Z")
    assert raised.value.code == code
    assert raised.value.retryable is retryable
    assert raised.value.endpoint == CARD_ENDPOINT


@pytest.mark.parametrize(
    ("endpoint", "parameter", "payload"),
    [
        (
            CARD_ENDPOINT,
            "mid",
            {"code": 0, "data": {"card": {"mid": "2", "name": "合成用户", "fans": 12}}},
        ),
        (RELATION_STAT_ENDPOINT, "vmid", {"code": 0, "data": {"mid": "2", "follower": 12}}),
    ],
)
def test_http_request_and_raw_evidence_stay_local(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, endpoint: str, parameter: str, payload: dict
) -> None:
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    requests: list[httpx.Request] = []
    original_client = httpx.AsyncClient

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, content=raw)

    def client_factory(**options):
        assert options["timeout"].connect == 5
        assert options["timeout"].read == 10
        return original_client(**options, transport=httpx.MockTransport(handle))

    monkeypatch.setattr(httpx, "AsyncClient", client_factory)
    result = asyncio.run(fetch_follower_endpoint(endpoint, "2", tmp_path))
    assert len(requests) == 1
    assert requests[0].url.path == f"/{endpoint}"
    assert requests[0].url.params[parameter] == "2"
    if endpoint == CARD_ENDPOINT:
        assert requests[0].url.params["photo"] == "true"
    assert requests[0].headers["Referer"] == "https://www.bilibili.com/"
    assert result["followerCount"] == 12
    evidence = result["evidenceObject"]
    assert (tmp_path / evidence["relativePath"]).read_bytes() == raw
    assert evidence["sha256"] == hashlib.sha256(raw).hexdigest()


@pytest.mark.parametrize(
    ("status", "code", "retryable"),
    [
        (429, "BILIBILI_RATE_LIMITED", True),
        (503, "BILIBILI_SERVER_ERROR", True),
        (403, "BILIBILI_HTTP_ERROR", False),
    ],
)
def test_original_http_error_categories(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, status: int, code: str, retryable: bool
) -> None:
    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **options: original_client(
            **options, transport=httpx.MockTransport(lambda request: httpx.Response(status))
        ),
    )
    with pytest.raises(BilibiliCrawlerError) as raised:
        asyncio.run(fetch_follower_endpoint(CARD_ENDPOINT, "2", tmp_path))
    assert raised.value.code == code
    assert raised.value.retryable is retryable
    assert raised.value.status_code == status
    assert list(tmp_path.iterdir()) == []
