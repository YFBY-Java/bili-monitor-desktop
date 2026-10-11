from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import pytest
from jsonschema import Draft202012Validator

from bmd_workers import bilibili_rank
from bmd_workers.bilibili_follower import BilibiliCrawlerError
from bmd_workers.bilibili_rank_v2_contract import rank_wire_result
from bmd_workers.protocol import RuntimeEnvelope
from bmd_workers.runtime import WorkerRuntime


def test_rank_configured_web_location_reaches_signed_http_request(monkeypatch, tmp_path):
    contracts = Path(__file__).resolve().parents[3] / "packages" / "contracts"
    cases = json.loads((contracts / "fixtures/live-rank-configuration.json").read_text("utf-8"))
    settings = next(case["input"] for case in cases if case["name"] == "configured")
    requests = []
    original = httpx.AsyncClient

    def respond(request):
        requests.append(request)
        return httpx.Response(200, json={"code": 0, "data": {"item": []}})

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **options: original(**options, transport=httpx.MockTransport(respond)),
    )
    result = asyncio.run(
        bilibili_rank.fetch_live_rank(
            {
                "taskId": "synthetic-config",
                "attempt": 1,
                "leaseId": "synthetic-config",
                "roomId": "104",
                "ruid": "4",
                "family": "AUDIENCE",
                "type": "daily_rank",
                "page": 1,
                "pageSize": settings["pageSize"],
                "webLocation": settings["webLocation"],
                "wbiKeys": {"imgKey": "a" * 32, "subKey": "b" * 32},
            },
            tmp_path,
        )
    )
    assert result["pageSize"] == settings["pageSize"]
    assert requests[0].url.params["web_location"] == settings["webLocation"]
    assert requests[0].url.params["page_size"] == str(settings["pageSize"])
    assert "w_rid" in requests[0].url.params
    schema = json.loads(
        (contracts / "schemas/bilibili-live-rank-configuration.v1.schema.json").read_text("utf-8")
    )
    for case in cases:
        assert Draft202012Validator(schema).is_valid(case["input"]) == case["valid"]
    for version in (1, 2):
        worker_schema = json.loads(
            (contracts / f"schemas/bilibili-live-rank-worker.v{version}.schema.json").read_text(
                "utf-8"
            )
        )
        Draft202012Validator(worker_schema).validate(
            {
                "taskId": "synthetic-config",
                "attempt": 1,
                "leaseId": "synthetic-config",
                "roomId": "104",
                "ruid": "4",
                "family": "AUDIENCE",
                "type": "daily_rank",
                "page": 1,
                "pageSize": settings["pageSize"],
                "webLocation": settings["webLocation"],
            }
        )


def test_rank_http_string_default_keeps_original_bytes(monkeypatch, tmp_path):
    body = json.dumps(
        {
            "code": 0,
            "data": {
                "info": {"num": 1},
                "list": [{"uinfo": {"uid": 9, "base": {"name": " café viewer "}}}],
            },
        },
        ensure_ascii=False,
    ).encode("iso-8859-1")
    headers = {}
    original = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **options: original(
            **options,
            transport=httpx.MockTransport(
                lambda _: httpx.Response(200, content=body, headers=headers)
            ),
        ),
    )
    result = asyncio.run(
        bilibili_rank.fetch_live_rank(
            {
                "taskId": "synthetic-task",
                "attempt": 1,
                "leaseId": "synthetic-lease",
                "roomId": "104",
                "ruid": "4",
                "family": "GUARD",
                "type": "guard_weekly",
                "page": 1,
                "pageSize": 30,
            },
            tmp_path,
        )
    )
    assert result["entries"][0]["displayName"] == " café viewer "
    assert (tmp_path / result["evidenceObject"]["relativePath"]).read_bytes() == body
    contracts = Path(__file__).resolve().parents[3] / "packages" / "contracts"
    cases = json.loads(
        (contracts / "fixtures/follower-raw-payload-storage.json").read_text("utf-8")
    )
    schema = json.loads(
        (contracts / "schemas/bilibili-live-rank-worker.v1.schema.json").read_text("utf-8")
    )
    validator = Draft202012Validator({"$ref": "#/$defs/FetchedSnapshot", "$defs": schema["$defs"]})
    for case in cases:
        body = (
            '{"code":0,"data":{"info":{"num":1}},"unused":' + case["extra"] + "}" + case["trailing"]
        ).encode("utf-8")
        result = asyncio.run(
            bilibili_rank.fetch_live_rank(
                {
                    "taskId": "synthetic-task",
                    "attempt": 1,
                    "leaseId": "synthetic-lease",
                    "roomId": "104",
                    "ruid": "4",
                    "family": "GUARD",
                    "type": "guard_weekly",
                    "page": 1,
                    "pageSize": 30,
                },
                tmp_path,
            )
        )
        assert result["rawPayloadStorageStatus"] == case["status"]
        validator.validate(rank_wire_result(result, False))
        assert (tmp_path / result["evidenceObject"]["relativePath"]).read_bytes() == body

    text_samples = json.loads((contracts / "fixtures/rank-storage-text.json").read_text("utf-8"))
    headers = {"Content-Type": "application/json; charset=UTF-8"}
    for name, sample in text_samples.items():
        body = json.dumps(sample["body"], ensure_ascii=False).encode("utf-8")
        family = "AUDIENCE" if name == "audience" else "GUARD"
        result = asyncio.run(
            bilibili_rank.fetch_live_rank(
                {
                    "taskId": "synthetic-task",
                    "attempt": 1,
                    "leaseId": "synthetic-lease",
                    "roomId": "113",
                    "ruid": "13",
                    "family": family,
                    "type": "online_rank" if family == "AUDIENCE" else "guard_weekly",
                    "rankSwitch": "contribution_rank",
                    "page": 1,
                    "pageSize": 30,
                    "wbiKeys": {"imgKey": "1" * 32, "subKey": "b" * 32},
                },
                tmp_path,
            )
        )
        validator.validate(rank_wire_result(result, False))
        assert result["rawPayloadStorageStatus"] == "ACCEPTED"
        assert len(result["entries"][0]["displayName"]) > 512
        assert (tmp_path / result["evidenceObject"]["relativePath"]).read_bytes() == body


def test_wbi_nav_string_failure_preserves_cache_and_worker_recovery(monkeypatch, tmp_path):
    monkeypatch.setattr(bilibili_rank, "_cached_wbi_keys", None)
    monkeypatch.setattr(bilibili_rank.time, "time", lambda: 1700000000)
    response = httpx.Response(
        503,
        content=b"private nav body",
        headers={"Content-Type": "application/json;charset=not-a-real-charset"},
    )
    requests = []
    original = httpx.AsyncClient

    def respond(request):
        requests.append(request)
        if request.url.path.endswith("/nav"):
            assert request.headers["Referer"] == "https://www.bilibili.com/"
            assert "Cookie" not in request.headers
            return response
        return httpx.Response(200, json={"code": 0, "data": {"item": [{"uid": 9, "name": "观众"}]}})

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **options: original(**options, transport=httpx.MockTransport(respond)),
    )
    runtime = WorkerRuntime(role="crawler", data_directory=tmp_path)
    request = RuntimeEnvelope.create(
        message_id="synthetic-nav-text",
        message_type="bilibili.live.rank.fetch",
        payload={
            "taskId": "task",
            "attempt": 1,
            "leaseId": "lease",
            "roomId": "102",
            "ruid": "2",
            "family": "AUDIENCE",
            "type": "daily_rank",
            "rankSwitch": "today_rank",
            "page": 1,
            "pageSize": 50,
        },
        correlation_id="correlation",
        trace_id="trace",
    )
    result = asyncio.run(runtime.handle(request))
    assert result.payload == {
        "code": "BILIBILI_RESPONSE_CONVERSION_ERROR",
        "message": "Unable to convert Bilibili response content type or charset.",
        "retryable": False,
    }
    assert bilibili_rank._cached_wbi_keys is None
    assert len(requests) == 1 and not (tmp_path / "cas").exists()

    response = httpx.Response(
        403, content=b"private nav body", headers={"Content-Type": "application/json"}
    )
    result = asyncio.run(runtime.handle(request))
    assert result.payload == {
        "code": "BILIBILI_UNKNOWN_ERROR",
        "retryable": True,
        "endpoint": bilibili_rank.WBI_NAV_ENDPOINT,
        "statusCode": 403,
        "message": "Bilibili WBI key request failed with HTTP 403",
    }
    body = json.dumps(
        {
            "code": -101,
            "data": {
                "wbi_img": {
                    "img_url": f"https://fixture.test/{'é' * 32}.png",
                    "sub_url": f"https://fixture.test/{'b' * 32}.png",
                }
            },
        },
        ensure_ascii=False,
    ).encode("iso-8859-1")
    response = httpx.Response(200, content=body)
    result = asyncio.run(runtime.handle(request))
    assert result.type == "bilibili.live.rank.fetch.result"
    assert result.payload["entries"][0]["displayName"] == "观众"
    cached = bilibili_rank._cached_wbi_keys
    assert cached is not None
    assert cached[:2] == ("é" * 32, "b" * 32)
    nav_count = sum(item.url.path.endswith("/nav") for item in requests)
    response = httpx.Response(
        503, headers={"Content-Type": "application/json;charset=not-a-real-charset"}
    )
    request.payload["forceRefreshWbi"] = True
    result = asyncio.run(runtime.handle(request))
    assert result.payload["code"] == "BILIBILI_RESPONSE_CONVERSION_ERROR"
    assert bilibili_rank._cached_wbi_keys == cached
    request.payload["forceRefreshWbi"] = False
    assert asyncio.run(runtime.handle(request)).type == "bilibili.live.rank.fetch.result"
    assert sum(item.url.path.endswith("/nav") for item in requests) == nav_count + 1

    # Java derives the 32-character mixin before publishing fetched keys.
    # A short response must not replace a previous successful cache or escape
    # the runtime as an IndexError while signing the downstream request.
    response = httpx.Response(
        200,
        json={
            "code": -101,
            "data": {
                "wbi_img": {
                    "img_url": f"https://fixture.test/{'a' * 29}.png",
                    "sub_url": f"https://fixture.test/{'b' * 29}.png",
                }
            },
        },
    )
    request.payload["forceRefreshWbi"] = True
    before_short_response = len(requests)
    result = asyncio.run(runtime.handle(request))
    assert result.type == "worker.error"
    assert result.payload["code"] == "BILIBILI_PARSE_ERROR"
    assert result.payload["retryable"] is True
    assert result.payload["endpoint"] == bilibili_rank.WBI_NAV_ENDPOINT
    assert result.payload["statusCode"] == 200
    assert str(result.payload["message"]).startswith("Unable to parse Bilibili WBI key response")
    assert bilibili_rank._cached_wbi_keys == cached
    assert len(requests) == before_short_response + 1
    request.payload["forceRefreshWbi"] = False
    assert asyncio.run(runtime.handle(request)).type == "bilibili.live.rank.fetch.result"
    assert sum(item.url.path.endswith("/nav") for item in requests) == nav_count + 2

    # Only the first 32 permutation indices are used, so 59 characters suffice;
    # imposing a 64-character/hex-only rule would narrow the original domain.
    response = httpx.Response(
        200,
        json={
            "code": -101,
            "data": {
                "wbi_img": {
                    "img_url": f"https://fixture.test/{'a' * 29}.png",
                    "sub_url": f"https://fixture.test/{'b' * 30}.png",
                }
            },
        },
    )
    request.payload["forceRefreshWbi"] = True
    assert asyncio.run(runtime.handle(request)).type == "bilibili.live.rank.fetch.result"
    assert bilibili_rank._cached_wbi_keys[:2] == ("a" * 29, "b" * 30)

    # Java indexes UTF-16 units, not Python code points: these keys still have
    # 59 units, and must not be rejected by the short-key recovery check.
    response = httpx.Response(
        200,
        json={
            "code": -101,
            "data": {
                "wbi_img": {
                    "img_url": f"https://fixture.test/{'😀' * 29}.png",
                    "sub_url": "https://fixture.test/b.png",
                }
            },
        },
    )
    assert asyncio.run(runtime.handle(request)).type == "bilibili.live.rank.fetch.result"
    assert bilibili_rank._cached_wbi_keys[:2] == ("😀" * 29, "b")
    # Independently derived from the original charAt table and UTF-8 '?' rule,
    # not calculated using the implementation under test.
    assert requests[-1].url.params["w_rid"] == "a002dcec9569047244f356fb3b4603d3"


def test_rank_runtime_keeps_invalid_header_internal_and_original_http_errors(monkeypatch, tmp_path):
    original = httpx.AsyncClient
    response = None
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **options: original(**options, transport=httpx.MockTransport(lambda _: response)),
    )
    runtime = WorkerRuntime(role="crawler", data_directory=tmp_path)
    request = RuntimeEnvelope.create(
        message_id="synthetic-rank-text",
        message_type="bilibili.live.rank.fetch",
        payload={
            "taskId": "synthetic-task",
            "attempt": 1,
            "leaseId": "synthetic-lease",
            "roomId": "104",
            "ruid": "4",
            "family": "GUARD",
            "type": "guard_weekly",
            "page": 1,
            "pageSize": 30,
        },
        correlation_id="synthetic-correlation",
        trace_id="synthetic-trace",
    )
    response = httpx.Response(
        503,
        content=b"private rank body",
        headers={"Content-Type": "application/json;charset=not-a-real-charset"},
    )
    result = asyncio.run(runtime.handle(request))
    assert result.payload == {
        "code": "BILIBILI_RESPONSE_CONVERSION_ERROR",
        "message": "Unable to convert Bilibili response content type or charset.",
        "retryable": False,
    }
    for status, code, retryable in [
        (403, "BILIBILI_UNKNOWN_ERROR", False),
        (503, "BILIBILI_SERVER_ERROR", True),
    ]:
        response = httpx.Response(
            status, content=b"\xff", headers={"Content-Type": "application/json"}
        )
        result = asyncio.run(runtime.handle(request))
        assert result.payload == {
            "code": code,
            "message": f"Bilibili live rank HTTP {status} from {bilibili_rank.GUARD_RANK_ENDPOINT}",
            "retryable": retryable,
            "endpoint": bilibili_rank.GUARD_RANK_ENDPOINT,
            "statusCode": status,
        }
    response = httpx.Response(200, content=b"", headers={"Content-Type": "application/json"})
    result = asyncio.run(runtime.handle(request))
    assert result.payload["code"] == "BILIBILI_PARSE_ERROR"
    assert not (tmp_path / "cas").exists()

    contracts = Path(__file__).resolve().parents[3] / "packages" / "contracts"
    samples = json.loads((contracts / "fixtures/rank-api-responses.json").read_text("utf-8"))
    for sample in samples[1:] + samples[:1]:
        response = httpx.Response(200, json=sample["body"])
        result = asyncio.run(runtime.handle(request))
        if sample["success"]:
            assert result.type == "bilibili.live.rank.fetch.result"
            assert result.payload["entries"][0]["displayName"] == "original viewer"
        else:
            assert result.type == "worker.error"
            assert result.payload == {
                **sample["error"],
                "endpoint": bilibili_rank.GUARD_RANK_ENDPOINT,
                "statusCode": 200,
            }


def test_parses_audience_rank_without_guessing_missing_uid() -> None:
    parsed = bilibili_rank.parse_audience_rank_response(
        json.dumps(
            {
                "code": 0,
                "data": {
                    "count": 2,
                    "count_text": "2 人",
                    "config": {"value_text": "贡献值", "title": "在线贡献榜"},
                    "item": [
                        {
                            "uid": 99,
                            "rank": 1,
                            "name": "Alice",
                            "face": "https://i0.hdslb.com/bfs/face/alice.jpg",
                            "score": 120,
                            "medal_info": {"medal_name": "舰长", "medal_level": 12},
                        },
                        {"rank": 2, "name": "匿名观众", "score": 80},
                    ],
                },
            },
            ensure_ascii=False,
        ),
        rank_type="online_rank",
        rank_switch="contribution_rank",
        period_scope="REALTIME",
        page=1,
        page_size=50,
        endpoint=bilibili_rank.AUDIENCE_RANK_ENDPOINT,
        signed_required=True,
        captured_at="2026-08-29T12:00:00.000Z",
    )

    assert parsed["rankFamily"] == "AUDIENCE"
    assert parsed["totalCount"] == 2
    assert parsed["entries"][0]["userUid"] == "99"
    assert "userUid" not in parsed["entries"][1]

    fixtures = Path(__file__).resolve().parents[3] / "packages/contracts/fixtures"
    samples = json.loads((fixtures / "rank-response-fields.json").read_text("utf-8"))
    schema = json.loads(
        (fixtures.parent / "schemas/bilibili-live-rank-worker.v1.schema.json").read_text("utf-8")
    )
    validator = Draft202012Validator({"$ref": "#/$defs/FetchedSnapshot", "$defs": schema["$defs"]})
    for name in ("audiencePresent", "audienceMissing", "fallback", "guard"):
        sample = samples[name]
        if name == "guard":
            result = bilibili_rank.parse_guard_rank_response(
                json.dumps(sample["body"]),
                rank_type="guard_weekly",
                period_scope="CURRENT",
                page=1,
                page_size=30,
                captured_at="2026-08-29T12:00:00.000Z",
            )
        else:
            result = bilibili_rank.parse_audience_rank_response(
                json.dumps(sample["body"]),
                rank_type="daily_rank",
                rank_switch="today_rank",
                period_scope="DAILY",
                page=1,
                page_size=50,
                endpoint=(
                    bilibili_rank.ONLINE_GOLD_RANK_ENDPOINT
                    if name == "fallback"
                    else bilibili_rank.AUDIENCE_RANK_ENDPOINT
                ),
                signed_required=name != "fallback",
                captured_at="2026-08-29T12:00:00.000Z",
            )
        fields = ("totalCount", "countText", "valueText", "remindMsg", "entries")
        assert {key: result[key] for key in fields if key in result} == sample["expected"], name
        validator.validate(
            {
                **result,
                "statusCode": 200,
                "durationMs": 0,
                "evidenceObject": {
                    "objectId": "sha256:" + "a" * 64,
                    "sha256": "a" * 64,
                    "relativePath": "cas/sha256/aa/" + "a" * 64 + ".json",
                    "sizeBytes": 128,
                    "mediaType": "application/json",
                },
            }
        )
        if name == "fallback":
            assert (result["rankType"], result["rankSwitch"], result["periodScope"]) == (
                "online_rank",
                "contribution_rank",
                "REALTIME",
            )

    precise_schema = json.loads(
        (fixtures.parent / "schemas/bilibili-live-rank-worker.v2.schema.json").read_text("utf-8")
    )
    precise_validator = Draft202012Validator(
        {"$ref": "#/$defs/FetchedSnapshot", "$defs": precise_schema["$defs"]}
    )
    for name, sample in json.loads((fixtures / "rank-long64.json").read_text("utf-8")).items():
        if name == "guard":
            result = bilibili_rank.parse_guard_rank_response(
                json.dumps(sample["body"]),
                rank_type="guard_weekly",
                period_scope="CURRENT",
                page=1,
                page_size=30,
                captured_at="2026-08-29T12:00:00.000Z",
            )
        else:
            result = bilibili_rank.parse_audience_rank_response(
                json.dumps(sample["body"]),
                rank_type="online_rank",
                rank_switch="contribution_rank",
                period_scope="REALTIME",
                page=1,
                page_size=50,
                endpoint=bilibili_rank.AUDIENCE_RANK_ENDPOINT,
                signed_required=True,
                captured_at="2026-08-29T12:00:00.000Z",
            )
        fetched = {
            **result,
            "statusCode": 200,
            "durationMs": 0,
            "evidenceObject": {
                "objectId": "sha256:" + "a" * 64,
                "sha256": "a" * 64,
                "relativePath": "cas/sha256/aa/" + "a" * 64 + ".json",
                "sizeBytes": 128,
                "mediaType": "application/json",
            },
        }
        exact = rank_wire_result(fetched, True)
        precise_validator.validate(exact)
        assert {key: exact[key] for key in ("totalCount", "countText", "entries")} == sample[
            "expected"
        ]
        with pytest.raises(BilibiliCrawlerError) as legacy:
            rank_wire_result(fetched, False)
        assert legacy.value.code == "WORKER_CONTRACT_PRECISION_UNSUPPORTED"

    for name, sample in json.loads((fixtures / "rank-entry-facts.json").read_text("utf-8")).items():
        raw = json.dumps(sample["body"], ensure_ascii=False)
        if name == "guard":
            parsed_facts = bilibili_rank.parse_guard_rank_response(
                raw,
                rank_type="guard_weekly",
                period_scope="CURRENT",
                page=1,
                page_size=30,
                captured_at="2026-08-29T12:00:00.000Z",
                with_entry_facts=True,
            )
        else:
            parsed_facts = bilibili_rank.parse_audience_rank_response(
                raw,
                rank_type="online_rank",
                rank_switch="contribution_rank",
                period_scope="REALTIME",
                page=1,
                page_size=50,
                endpoint=bilibili_rank.AUDIENCE_RANK_ENDPOINT,
                signed_required=True,
                captured_at="2026-08-29T12:00:00.000Z",
                with_entry_facts=True,
            )
        facts_result = {
            **parsed_facts,
            "statusCode": 200,
            "durationMs": 0,
            "evidenceObject": fetched["evidenceObject"],
        }
        exact_facts = rank_wire_result(facts_result, True)
        precise_validator.validate(exact_facts)
        fact_keys = ("medalRuid", "medalIsLight", "rawEntryJson", "rawEntryStorageStatus")
        assert [
            {key: entry[key] for key in fact_keys if key in entry}
            for entry in exact_facts["entries"]
        ] == sample["facts"]
        old_facts = rank_wire_result(facts_result, False)
        for entry in old_facts["entries"]:
            assert not any(key in entry for key in fact_keys)


def test_parses_guard_top3_list_and_accompany_fields() -> None:
    parsed = bilibili_rank.parse_guard_rank_response(
        json.dumps(
            {
                "code": 0,
                "data": {
                    "info": {"num": 1, "num_text": "1 位"},
                    "top3": [
                        {
                            "rank": 1,
                            "accompany": 88,
                            "uinfo": {
                                "uid": 77,
                                "base": {"name": "Captain"},
                                "guard": {"level": 3, "expired_str": "2026-09-01"},
                            },
                        }
                    ],
                    "list": [],
                    "extop": [],
                },
            },
            ensure_ascii=False,
        ),
        rank_type="guard_accompany",
        period_scope="CURRENT",
        page=1,
        page_size=30,
        captured_at="2026-08-29T12:00:00.000Z",
    )

    assert parsed["rankFamily"] == "GUARD"
    assert parsed["entries"] == [
        {
            "userUid": "77",
            "rankNo": 1,
            "entryKind": "TOP3",
            "displayName": "Captain",
            "guardLevel": 3,
            "guardExpiredText": "2026-09-01",
            "accompanyDays": 88,
        }
    ]


def test_wbi_signing_is_stable_for_fixed_keys_and_timestamp() -> None:
    signed = bilibili_rank.sign_wbi_params(
        {
            "room_id": "33",
            "ruid": "22",
            "type": "online_rank",
            "switch": "contribution_rank",
        },
        img_key="7cd084941338484aae1ad9425b84077c",
        sub_key="4932caff0ff746eab6f01bf08b70ac45",
        timestamp=1700000000,
    )

    assert signed["wts"] == "1700000000"
    assert len(signed["w_rid"]) == 32
    assert signed == bilibili_rank.sign_wbi_params(
        {
            "room_id": "33",
            "ruid": "22",
            "type": "online_rank",
            "switch": "contribution_rank",
        },
        img_key="7cd084941338484aae1ad9425b84077c",
        sub_key="4932caff0ff746eab6f01bf08b70ac45",
        timestamp=1700000000,
    )
