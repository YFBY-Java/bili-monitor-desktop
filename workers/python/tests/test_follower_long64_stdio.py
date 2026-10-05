"""Synthetic HTTP through production follower parsing, CAS and the persistent stdio loop."""

import asyncio
import importlib.util
import io
import json
from pathlib import Path

import httpx
import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from bmd_workers.protocol import RuntimeEnvelope
from bmd_workers.runtime import WorkerRuntime, run_stdio

MAX_LONG = "9223372036854775807"
MIN_LONG = "-9223372036854775808"
V2_OPERATIONS = ["fetch-card.v2", "fetch-relation-stat.v2", "fetch-profile.v2"]
CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
CANONICAL_CASES = json.loads(
    (CONTRACTS / "fixtures/follower-long64-canonical.json").read_text("utf-8")
)
V2_SCHEMA = json.loads((CONTRACTS / "schemas/bilibili-follower.v2.schema.json").read_text("utf-8"))


def request(operation, *, message_id="long64", mid="2"):
    return RuntimeEnvelope.model_validate(
        {
            "id": message_id,
            "type": f"bilibili.follower.{operation}",
            "version": 1,
            "timestamp": "2026-10-05T00:00:00Z",
            "correlationId": "long-correlation",
            "traceId": "long-trace",
            "keepAlive": True,
            "payload": {"taskId": "t", "leaseId": "l", "attempt": 1, "mid": mid},
        }
    )


def replay_http(monkeypatch, bodies):
    seen = []
    original = httpx.AsyncClient

    async def handle(message):
        await asyncio.sleep(0)
        seen.append(message)
        body = bodies[len(seen) - 1]
        return httpx.Response(200, content=body, headers={"Content-Type": "application/json"})

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **options: original(**options, transport=httpx.MockTransport(handle)),
    )
    return seen


def success_body(mid, count, *, nickname="\ud800", following=MIN_LONG):
    return json.dumps(
        {
            "code": 0,
            "data": {
                "mid": mid,
                "follower": count,
                "following": following,
                "card": {"mid": mid, "name": nickname, "attention": following},
            },
        },
        ensure_ascii=True,
    ).encode("ascii")


@pytest.mark.parametrize("operation", V2_OPERATIONS)
def test_v2_long64_http_results_errors_heartbeats_and_third_request_share_one_loop(
    monkeypatch, tmp_path: Path, operation
):
    bodies = [
        success_body(MIN_LONG, MAX_LONG),
        b'{"code":-101,"message":"\\udfff"}',
        success_body("0", "9007199254740993", nickname="same-process-third", following="-1"),
    ]
    seen = replay_http(monkeypatch, bodies)
    requests = [request(operation, message_id=f"long-{index}", mid=MAX_LONG) for index in range(3)]
    requests.append(
        RuntimeEnvelope.create(
            message_id="after-long64",
            message_type="worker.ping",
            payload={},
            correlation_id="long-correlation",
            trace_id="long-trace",
        )
    )
    raw_output = io.BytesIO()
    output = io.TextIOWrapper(raw_output, encoding="gbk", errors="strict")
    asyncio.run(
        run_stdio(
            WorkerRuntime(role="crawler", data_directory=tmp_path),
            io.StringIO("".join(item.to_wire_json() + "\n" for item in requests)),
            output,
        )
    )
    output.flush()
    wire = raw_output.getvalue().decode("ascii")
    assert wire.isascii()
    messages = [json.loads(line) for line in wire.splitlines()]
    business = [message for message in messages if message["type"] != "worker.request-alive"]
    assert [message["type"] for message in business] == [
        f"bilibili.follower.{operation}.result",
        "worker.error",
        f"bilibili.follower.{operation}.result",
        "worker.ping.result",
    ]
    assert business[0]["payload"]["mid"] == MIN_LONG
    assert business[1]["payload"]["code"] == "BILIBILI_AUTH_EXPIRED"
    assert business[1]["payload"]["message"] == "\udfff"
    assert business[2]["payload"]["mid"] == "0"
    definition = (
        "BilibiliFollowerProfileV2"
        if operation == "fetch-profile.v2"
        else "BilibiliFollowerFetchedSnapshotV2"
    )
    validator = Draft202012Validator({**V2_SCHEMA, "$ref": f"#/$defs/{definition}"})
    validator.validate(business[0]["payload"])
    validator.validate(business[2]["payload"])
    if operation != "fetch-relation-stat.v2":
        assert business[0]["payload"]["nickname"] == "\ud800"
        assert business[2]["payload"]["nickname"] == "same-process-third"
    if operation == "fetch-profile.v2":
        assert business[0]["payload"] == {"mid": MIN_LONG, "nickname": "\ud800"}
        assert list(tmp_path.iterdir()) == []
    else:
        assert business[0]["payload"]["followerCount"] == MAX_LONG
        assert business[0]["payload"]["followingCount"] == MIN_LONG
        assert business[2]["payload"]["followerCount"] == "9007199254740993"
        assert business[2]["payload"]["followingCount"] == "-1"
        for index in (0, 2):
            evidence = business[index]["payload"]["evidenceObject"]
            assert (tmp_path / evidence["relativePath"]).read_bytes() == bodies[index]
    assert len(seen) == 3
    parameter = "vmid" if operation == "fetch-relation-stat.v2" else "mid"
    assert all(message.url.params[parameter] == MAX_LONG for message in seen)
    pulses = [message for message in messages if message["type"] == "worker.request-alive"]
    assert {message["id"] for message in pulses} == {"long-0", "long-1", "long-2"}
    assert all(message["version"] == 1 for message in messages)
    assert all(message["traceId"] == "long-trace" for message in messages)


@pytest.mark.parametrize("operation", ["fetch-card", "fetch-relation-stat"])
@pytest.mark.parametrize(("count", "following"), [(MAX_LONG, "3"), ("-1", "3"), ("12", MIN_LONG)])
def test_v1_unsupported_precision_is_correlated_business_error_and_worker_stays_alive(
    monkeypatch, tmp_path, operation, count, following
):
    seen = replay_http(monkeypatch, [success_body("2", count, following=following)])
    first = request(operation)
    ping = RuntimeEnvelope.create(
        message_id="after-v1",
        message_type="worker.ping",
        payload={},
        correlation_id="long-correlation",
        trace_id="long-trace",
    )
    output = io.StringIO()
    asyncio.run(
        run_stdio(
            WorkerRuntime(role="crawler", data_directory=tmp_path),
            io.StringIO(first.to_wire_json() + "\n" + ping.to_wire_json() + "\n"),
            output,
        )
    )
    business = [
        json.loads(line)
        for line in output.getvalue().splitlines()
        if json.loads(line)["type"] != "worker.request-alive"
    ]
    assert business[0]["type"] == "worker.error"
    assert business[0]["id"] == first.id
    assert business[0]["payload"]["code"] == "WORKER_CONTRACT_PRECISION_UNSUPPORTED"
    assert business[0]["payload"]["retryable"] is False
    assert business[1]["type"] == "worker.ping.result"
    assert len(seen) == 1


@pytest.mark.parametrize("count", [MAX_LONG, MIN_LONG, "9007199254740993"])
def test_v1_profile_does_not_project_unused_large_or_negative_follower_counts(
    monkeypatch, tmp_path, count
):
    seen = replay_http(monkeypatch, [success_body("2", count, nickname="profile-only")])
    result = asyncio.run(
        WorkerRuntime(role="crawler", data_directory=tmp_path).handle(request("fetch-profile"))
    )
    assert result.type == "bilibili.follower.fetch-profile.result"
    assert result.payload == {"mid": "2", "nickname": "profile-only"}
    assert len(seen) == 1
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("operation", ["fetch-card", "fetch-relation-stat", "fetch-profile"])
@pytest.mark.parametrize("mid", ["0", "-1", MIN_LONG])
def test_v1_signed_response_mid_is_explicit_precision_error(monkeypatch, tmp_path, operation, mid):
    replay_http(monkeypatch, [success_body(mid, "12", following="3")])
    result = asyncio.run(
        WorkerRuntime(role="crawler", data_directory=tmp_path).handle(request(operation))
    )
    assert result.type == "worker.error"
    assert result.payload["code"] == "WORKER_CONTRACT_PRECISION_UNSUPPORTED"


@pytest.mark.parametrize("operation", ["fetch-card", "fetch-relation-stat"])
@pytest.mark.parametrize("count", ["0", "9007199254740991"])
def test_v1_safe_numeric_output_and_full_long_string_mid_remain_compatible(
    monkeypatch, tmp_path, operation, count
):
    seen = replay_http(monkeypatch, [success_body(MAX_LONG, count, following="0")])
    result = asyncio.run(
        WorkerRuntime(role="crawler", data_directory=tmp_path).handle(
            request(operation, mid=MAX_LONG)
        )
    )
    assert result.type == f"bilibili.follower.{operation}.result"
    assert result.payload["mid"] == MAX_LONG
    assert result.payload["followerCount"] == int(count)
    assert result.payload["followingCount"] == 0
    assert len(seen) == 1


def test_v2_methods_are_advertised_with_legacy_methods():
    result = asyncio.run(
        WorkerRuntime(role="crawler").handle(
            RuntimeEnvelope.create(
                message_id="caps-v2",
                message_type="worker.capabilities",
                payload={},
                correlation_id="c",
                trace_id="t",
            )
        )
    )
    assert result.payload["capabilities"] == [
        "bilibili.follower.fetch-card",
        "bilibili.follower.fetch-relation-stat",
        "bilibili.follower.fetch-profile",
        "bilibili.follower.fetch-card.v2",
        "bilibili.follower.fetch-relation-stat.v2",
        "bilibili.follower.fetch-profile.v2",
        "bilibili.live.fetch-room-init",
        "bilibili.live.fetch-room-info",
        "bilibili.live.fetch-room-info-old",
        "bilibili.live.fetch-status-by-uids",
        "bilibili.live.rank.fetch",
    ]


@pytest.mark.parametrize("mid", ["0", "-1", "9223372036854775808", "01", "+1", " 1", "1\u0662", 2])
def test_v2_request_rejects_noncanonical_or_nonpositive_long_mid(mid):
    spec = importlib.util.find_spec("bmd_workers.bilibili_follower_v2")
    assert spec is not None, "The Long64 Worker request model must exist"
    from bmd_workers.bilibili_follower_v2 import BilibiliFollowerFetchRequestV2

    with pytest.raises(ValidationError):
        BilibiliFollowerFetchRequestV2.model_validate(
            {"mid": mid, "taskId": "t", "leaseId": "l", "attempt": 1}
        )


@pytest.mark.parametrize("fixture", CANONICAL_CASES, ids=[item["name"] for item in CANONICAL_CASES])
def test_shared_canonical_long_profile_and_positive_request(fixture):
    spec = importlib.util.find_spec("bmd_workers.bilibili_follower_v2")
    assert spec is not None, "The Long64 Worker models must exist"
    from bmd_workers.bilibili_follower_v2 import (
        BilibiliFollowerFetchRequestV2,
        BilibiliFollowerProfileV2,
    )

    profile = {"mid": fixture["value"], "nickname": "canonical"}
    payload = {"mid": fixture["value"], "taskId": "t", "leaseId": "l", "attempt": 1}
    assert (
        Draft202012Validator({**V2_SCHEMA, "$ref": "#/$defs/BilibiliFollowerProfileV2"}).is_valid(
            profile
        )
        is fixture["canonical"]
    )
    assert (
        Draft202012Validator(
            {**V2_SCHEMA, "$ref": "#/$defs/BilibiliFollowerFetchRequestV2"}
        ).is_valid(payload)
        is fixture["positive"]
    )
    if fixture["canonical"]:
        assert BilibiliFollowerProfileV2.model_validate(profile).mid == fixture["value"]
    else:
        with pytest.raises(ValidationError):
            BilibiliFollowerProfileV2.model_validate(profile)
    if fixture["positive"]:
        assert BilibiliFollowerFetchRequestV2.model_validate(payload).mid == fixture["value"]
    else:
        with pytest.raises(ValidationError):
            BilibiliFollowerFetchRequestV2.model_validate(payload)


def fetched_value():
    return {
        "mid": "2",
        "nickname": "\ud800",
        "profileUrl": "https://space.bilibili.com/2",
        "followerCount": MAX_LONG,
        "followingCount": MIN_LONG,
        "fetchedAt": "2026-10-05T00:00:00Z",
        "sourceEndpoint": "x/web-interface/card",
        "evidenceObject": {
            "objectId": "sha256:" + "a" * 64,
            "sha256": "a" * 64,
            "relativePath": "cas/synthetic.json",
            "sizeBytes": 1,
            "mediaType": "application/json",
        },
        "statusCode": 200,
        "durationMs": 1,
    }


@pytest.mark.parametrize(
    ("field", "value", "valid"),
    [
        ("avatarUrl", "  text\ud800  ", True),
        ("avatarUrl", " ", False),
        ("nickname", " ", False),
        ("nickname", 2, False),
        ("followingCount", None, False),
        ("followerCount", 12, False),
        ("followerCount", "9223372036854775808", False),
        ("statusCode", 1, True),
        ("statusCode", 1.0, True),
        ("durationMs", 1.0, True),
        ("durationMs", 9007199254740992, False),
        ("durationMs", True, False),
    ],
)
def test_v2_fetched_model_matches_portable_contract(field, value, valid):
    from bmd_workers.bilibili_follower_v2 import BilibiliFollowerFetchedSnapshotV2

    payload = {**fetched_value(), field: value}
    validator = Draft202012Validator(
        {**V2_SCHEMA, "$ref": "#/$defs/BilibiliFollowerFetchedSnapshotV2"}
    )
    assert validator.is_valid(payload) is valid
    if valid:
        assert (
            BilibiliFollowerFetchedSnapshotV2.model_validate(payload).model_dump(by_alias=True)[
                field
            ]
            == value
        )
    else:
        with pytest.raises(ValidationError):
            BilibiliFollowerFetchedSnapshotV2.model_validate(payload)


@pytest.mark.parametrize("value", ["1", True, 9007199254740992])
def test_v2_attempt_matches_portable_json_integer(value):
    from bmd_workers.bilibili_follower_v2 import BilibiliFollowerFetchRequestV2

    payload = {"mid": "2", "taskId": "t", "leaseId": "l", "attempt": value}
    validator = Draft202012Validator(
        {**V2_SCHEMA, "$ref": "#/$defs/BilibiliFollowerFetchRequestV2"}
    )
    assert not validator.is_valid(payload)
    with pytest.raises(ValidationError):
        BilibiliFollowerFetchRequestV2.model_validate(payload)


def test_legacy_request_retains_positive_long_domain_and_rejects_long_overflow():
    from bmd_workers.bilibili_follower import BilibiliFollowerFetchRequest

    value = {"mid": "9007199254740993", "taskId": "t", "leaseId": "l", "attempt": 1}
    assert BilibiliFollowerFetchRequest.model_validate(value).mid == value["mid"]
    with pytest.raises(ValidationError):
        BilibiliFollowerFetchRequest.model_validate({**value, "mid": "9223372036854775808"})


@pytest.mark.parametrize("invalid", [{"followerCount": 12}, {"sourceEndpoint": "x/relation/stat"}])
def test_injected_v2_invalid_output_is_safe_correlated_contract_error(tmp_path, invalid):
    async def fetch(endpoint, mid, directory):
        return {**fetched_value(), **invalid}

    output = io.StringIO()
    first = request("fetch-card.v2")
    ping = RuntimeEnvelope.create(
        message_id="after-contract-error",
        message_type="worker.ping",
        payload={},
        correlation_id="long-correlation",
        trace_id="long-trace",
    )
    asyncio.run(
        run_stdio(
            WorkerRuntime(role="crawler", data_directory=tmp_path, follower_fetcher_v2=fetch),
            io.StringIO(first.to_wire_json() + "\n" + ping.to_wire_json() + "\n"),
            output,
        )
    )
    business = [
        json.loads(line)
        for line in output.getvalue().splitlines()
        if json.loads(line)["type"] != "worker.request-alive"
    ]
    assert business[0]["type"] == "worker.error"
    assert business[0]["id"] == first.id
    assert business[0]["payload"]["code"] == "WORKER_CONTRACT_INVALID"
    assert business[0]["payload"]["retryable"] is False
    assert business[1]["type"] == "worker.ping.result"
