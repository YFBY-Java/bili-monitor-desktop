"""Original LiveApiClient semantics; external HTTP alone is synthetic."""

import asyncio
import json
from pathlib import Path

import httpx
import pytest
from jsonschema import Draft202012Validator, FormatChecker
from pydantic import ValidationError

from bmd_workers import bilibili_live as live
from bmd_workers.bilibili_live_contract import LiveSnapshot, LiveSnapshotV2, validate_live_result
from bmd_workers.protocol import RuntimeEnvelope
from bmd_workers.runtime import WorkerRuntime

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
FIXTURES = json.loads((CONTRACTS / "fixtures/live-worker-responses.json").read_text("utf-8"))
VALIDATION = json.loads((CONTRACTS / "fixtures/live-worker-validation.json").read_text("utf-8"))
SCHEMA = json.loads((CONTRACTS / "schemas/bilibili-live-worker.v1.schema.json").read_text("utf-8"))
INPUTS = json.loads((CONTRACTS / "fixtures/live-worker-inputs.json").read_text("utf-8"))
NOW = "2026-09-13T03:00:00Z"
ENDPOINTS = {
    "status": live.STATUS_BY_UIDS_ENDPOINT,
    "init": live.ROOM_INIT_ENDPOINT,
    "info": live.ROOM_INFO_ENDPOINT,
    "old": live.ROOM_INFO_OLD_ENDPOINT,
}


def test_live_numeric_profile_uses_jdk20_text():
    value = live.parse_status_by_uids_response(
        '{"code":0,"data":{"101":{"uid":101,"room_id":201,"live_status":1,'
        '"uname":1e7,"title":-0.0,"area_name":0.0001,"face":"https://example.invalid/face.jpg"}}}',
        NOW,
    )[0]
    assert (value["uname"], value["title"], value["areaName"]) == ("1.0E7", "-0.0", "1.0E-4")
    LiveSnapshot.model_validate(value)


def test_live_independent_message_uses_jdk20_text():
    with pytest.raises(live.BilibiliCrawlerError) as raised:
        live.parse_status_by_uids_response('{"code":-101,"message":0.0001}', NOW)
    error = raised.value
    assert (str(error), error.code, error.bili_code, error.retryable) == (
        "1.0E-4",
        "BILIBILI_AUTH_EXPIRED",
        -101,
        False,
    )


def test_live_long64_shared_canonical_fixture_and_portable_subject():
    cases = json.loads((CONTRACTS / "fixtures/live-long64-canonical.json").read_text("utf-8"))
    schema = json.loads(
        (CONTRACTS / "schemas/bilibili-live-worker.v2.schema.json").read_text("utf-8")
    )
    subject = json.loads((CONTRACTS / "schemas/bilibili-subject.v3.schema.json").read_text("utf-8"))
    validator = Draft202012Validator(schema["$defs"]["BilibiliLiveSnapshotDataV2"])
    subject_validator = Draft202012Validator(subject["$defs"]["BilibiliSubjectTrendPointV3"])
    for case in cases:
        value = {
            "uid": "1",
            "roomId": "2",
            "liveStatus": 1,
            "onlineCount": case["value"],
            "attentionCount": case["value"],
        }
        assert validator.is_valid(value) is case["valid"]
        assert (
            subject_validator.is_valid({"bucketAt": NOW, "liveOnlineCount": case["value"]})
            is case["valid"]
        )
        if case["valid"]:
            assert (
                LiveSnapshotV2.model_validate(value).model_dump(by_alias=True, exclude_none=True)
                == value
            )
        else:
            with pytest.raises(ValidationError):
                LiveSnapshotV2.model_validate(value)


def test_live_counter_parsing_uses_java_long_only_for_counters():
    status = live.parse_status_by_uids_response(
        '{"code":0,"data":{"1":{"uid":1,"room_id":2,"live_status":1,"online":0,'
        '"watched_show":{"num":9007199254740993},"attention":9223372036854775808}}}',
        NOW,
    )[0]
    assert status["onlineCount"] == 0
    assert status["attentionCount"] == -9223372036854775808
    fallback = live.parse_status_by_uids_response(
        '{"code":0,"data":{"1":{"uid":1,"room_id":2,"watched_show":{"num":9007199254740993}}}}', NOW
    )[0]
    assert fallback["onlineCount"] == 9007199254740993
    info = live.parse_room_info_response(
        '{"code":0,"data":{"uid":1,"room_id":2,"online":"-1","attention":9223372036854775808}}', NOW
    )
    assert (info["onlineCount"], info["attentionCount"]) == (-1, -9223372036854775808)
    assert (
        live.parse_room_info_old_response(
            '{"code":0,"data":{"roomid":2,"online":9007199254740993}}', "1", NOW
        )["onlineCount"]
        == 9007199254740993
    )


def parse_fixture(fixture):
    raw = json.dumps(fixture["body"], ensure_ascii=False)
    if fixture["method"] == "old":
        return live.parse_room_info_old_response(raw, fixture["request"]["uid"], NOW)
    parser = {
        "status": live.parse_status_by_uids_response,
        "init": live.parse_room_init_response,
        "info": live.parse_room_info_response,
    }[fixture["method"]]
    return parser(raw, NOW)


@pytest.mark.parametrize("fixture", FIXTURES, ids=[f["name"] for f in FIXTURES])
def test_original_parser_fixture(fixture):
    if "error" not in fixture:
        assert parse_fixture(fixture) == fixture["result"]
        return
    with pytest.raises(live.BilibiliCrawlerError) as raised:
        parse_fixture(fixture)
    error, expected = raised.value, fixture["error"]
    assert error.code == expected["code"]
    assert str(error) == expected["message"]
    assert (error.retryable, error.status_code, error.bili_code) == (
        expected["retryable"],
        expected["statusCode"],
        expected["biliCode"],
    )
    assert error.endpoint == ENDPOINTS[fixture["method"]]


def install_http(monkeypatch, handler):
    original = httpx.AsyncClient
    options = []

    def client(**kwargs):
        options.append(kwargs.copy())
        return original(**kwargs, transport=httpx.MockTransport(handler))

    monkeypatch.setattr(live.httpx, "AsyncClient", client)
    return options


def test_old_empty_http_result_omits_snapshot_key(monkeypatch, tmp_path):
    response = httpx.Response(200, json={"code": -400, "message": "Synthetic invalid request"})
    install_http(monkeypatch, lambda _: response)
    with pytest.raises(live.BilibiliCrawlerError) as raised:
        asyncio.run(live.fetch_live_endpoint(live.ROOM_INFO_OLD_ENDPOINT, {"uid": "109"}, tmp_path))
    assert raised.value.bili_code == -400
    assert not (tmp_path / "cas").exists()

    response = httpx.Response(
        200,
        json={
            "code": 0,
            "data": {"109": {"uid": 109, "face": "invalid-url"}},
        },
    )
    with pytest.raises(live.BilibiliCrawlerError) as raised:
        result = asyncio.run(
            live.fetch_live_endpoint(live.STATUS_BY_UIDS_ENDPOINT, {"uids": ["109"]}, tmp_path)
        )
        validate_live_result(live.STATUS_BY_UIDS_ENDPOINT, result)
    assert raised.value.code == "BILIBILI_PARSE_ERROR"
    assert "invalid-url" not in str(raised.value)
    assert not (tmp_path / "cas").exists()

    response = httpx.Response(200, json={"code": 0, "data": {"roomStatus": 0}})
    result = asyncio.run(
        live.fetch_live_endpoint(live.ROOM_INFO_OLD_ENDPOINT, {"uid": "109"}, tmp_path)
    )
    assert "snapshot" not in result
    assert (tmp_path / result["evidenceObject"]["relativePath"]).read_bytes() == response.content
    cases = json.loads(
        (CONTRACTS / "fixtures/follower-raw-payload-storage.json").read_text("utf-8")
    )
    validator = Draft202012Validator(
        {"$ref": "#/$defs/FetchedOptionalSnapshot", "$defs": SCHEMA["$defs"]}
    )
    exact_schema = json.loads(
        (CONTRACTS / "schemas/bilibili-live-worker.v2.schema.json").read_text("utf-8")
    )
    exact_validator = Draft202012Validator(
        exact_schema["$defs"]["BilibiliLiveFetchedOptionalSnapshotV2"]
    )
    for case in cases:
        raw = '{"code":0,"data":{"roomStatus":0},"unused":' + case["extra"] + "}" + case["trailing"]
        response = httpx.Response(200, content=raw.encode("utf-8"))
        result = validate_live_result(
            live.ROOM_INFO_OLD_ENDPOINT,
            asyncio.run(
                live.fetch_live_endpoint(live.ROOM_INFO_OLD_ENDPOINT, {"uid": "109"}, tmp_path)
            ),
        )
        assert result["rawPayloadStorageStatus"] == case["status"]
        assert "snapshot" not in result
        validator.validate(result)
        exact_validator.validate(validate_live_result(live.ROOM_INFO_OLD_ENDPOINT, result, True))
        assert (tmp_path / result["evidenceObject"]["relativePath"]).read_bytes() == raw.encode(
            "utf-8"
        )


@pytest.mark.parametrize(
    "method,api_input,params",
    [
        ("status", {"uids": ["101", "102"]}, [("uids[]", "101"), ("uids[]", "102")]),
        ("init", {"roomId": "201"}, [("id", "201")]),
        ("info", {"roomId": "201"}, [("room_id", "201")]),
        ("old", {"uid": "109"}, [("mid", "109")]),
    ],
)
def test_real_http_parameters_headers_timeouts_and_empty_optional(
    monkeypatch, tmp_path, method, api_input, params
):
    def handler(http_request):
        assert http_request.method == "GET"
        assert http_request.url.host == "api.live.bilibili.com"
        assert http_request.url.path == "/" + ENDPOINTS[method]
        assert http_request.url.params.multi_items() == params
        assert (
            http_request.headers["User-Agent"]
            == "SocialDataMonitor/0.1 (+low-frequency public Bilibili live monitor)"
        )
        assert http_request.headers["Accept"] == "application/json"
        assert http_request.headers["Referer"] == "https://live.bilibili.com/"
        data = (
            {}
            if method == "status"
            else {"roomStatus": 0} if method == "old" else {"uid": 101, "room_id": 201}
        )
        return httpx.Response(200, json={"code": 0, "data": data})

    options = install_http(monkeypatch, handler)
    result = asyncio.run(live.fetch_live_endpoint(ENDPOINTS[method], api_input, tmp_path))
    assert options[0]["timeout"].connect == 5.0
    assert options[0]["timeout"].read == 10.0
    if method == "old":
        assert "snapshot" not in result
    assert (tmp_path / result["evidenceObject"]["relativePath"]).is_file()


@pytest.mark.parametrize(
    "status,code,retryable",
    [
        (429, "BILIBILI_RATE_LIMITED", True),
        (503, "BILIBILI_SERVER_ERROR", True),
        (403, "BILIBILI_UNKNOWN_ERROR", False),
    ],
)
def test_http_error_category(monkeypatch, tmp_path, status, code, retryable):
    install_http(
        monkeypatch, lambda _: httpx.Response(status, text="private raw body must not escape")
    )
    with pytest.raises(live.BilibiliCrawlerError) as raised:
        asyncio.run(live.fetch_live_endpoint(live.ROOM_INFO_ENDPOINT, {"roomId": "201"}, tmp_path))
    error = raised.value
    assert (error.code, error.retryable, error.status_code, error.endpoint) == (
        code,
        retryable,
        status,
        live.ROOM_INFO_ENDPOINT,
    )
    assert "private raw body" not in str(error)
    assert str(error) == f"Bilibili live HTTP {status} from {live.ROOM_INFO_ENDPOINT}"


def test_live_http_string_conversion_preserves_source_charset_and_original_bytes(
    monkeypatch, tmp_path
):
    cases = [
        ({}, "iso-8859-1", " café ", " café "),
        ({"Content-Type": "application/json;charset=ISO-8859-1"}, "iso-8859-1", " café ", " café "),
        ({"Content-Type": "application/problem+json"}, "utf-8", " 中文标题 ", " 中文标题 "),
        ({"Content-Type": "application/json"}, "utf-8", "A_BAD_BYTE_B", "A\ufffdB"),
    ]
    response = None
    install_http(monkeypatch, lambda _: response)
    for headers, encoding, title, expected in cases:
        body = json.dumps(
            {"code": 0, "data": {"uid": 121, "room_id": 221, "title": title}}, ensure_ascii=False
        ).encode(encoding)
        body = body.replace(b"A_BAD_BYTE_B", b"A\xffB")
        response = httpx.Response(200, content=body, headers=headers)
        result = asyncio.run(
            live.fetch_live_endpoint(live.ROOM_INFO_ENDPOINT, {"roomId": "221"}, tmp_path)
        )
        assert result["title"] == expected
        assert (tmp_path / result["evidenceObject"]["relativePath"]).read_bytes() == body


def test_live_runtime_keeps_header_conversion_internal_and_empty_body_in_parse_domain(
    monkeypatch, tmp_path
):
    response = None
    install_http(monkeypatch, lambda _: response)
    runtime = WorkerRuntime(role="crawler", data_directory=tmp_path)
    request = RuntimeEnvelope.create(
        message_id="synthetic-live-http-text",
        message_type="bilibili.live.fetch-room-info.v2",
        payload={
            "taskId": "synthetic-task",
            "attempt": 1,
            "leaseId": "synthetic-lease",
            "roomId": "221",
        },
        correlation_id="synthetic-correlation",
        trace_id="synthetic-trace",
    )
    response = httpx.Response(
        503,
        content=b"private raw body",
        headers={"Content-Type": "application/json;charset=not-a-real-charset"},
    )
    result = asyncio.run(runtime.handle(request))
    assert result.type == "worker.error"
    assert result.payload == {
        "code": "BILIBILI_RESPONSE_CONVERSION_ERROR",
        "message": "Unable to convert Bilibili response content type or charset.",
        "retryable": False,
    }
    response = httpx.Response(503, content=b"\xff", headers={"Content-Type": "application/json"})
    result = asyncio.run(runtime.handle(request))
    assert result.payload == {
        "code": "BILIBILI_SERVER_ERROR",
        "retryable": True,
        "endpoint": live.ROOM_INFO_ENDPOINT,
        "message": f"Bilibili live HTTP 503 from {live.ROOM_INFO_ENDPOINT}",
        "statusCode": 503,
    }
    response = httpx.Response(200, content=b"", headers={"Content-Type": "application/json"})
    result = asyncio.run(runtime.handle(request))
    assert (result.type, result.payload["code"], result.payload["statusCode"]) == (
        "worker.error",
        "BILIBILI_PARSE_ERROR",
        200,
    )
    assert not (tmp_path / "cas").exists()


@pytest.mark.parametrize("raw", [b'{"code":0,"data":"\xff"}', b"<html>private raw body</html>"])
def test_invalid_response_is_structured_parse_error_not_worker_crash(monkeypatch, tmp_path, raw):
    install_http(monkeypatch, lambda _: httpx.Response(200, content=raw))
    with pytest.raises(live.BilibiliCrawlerError) as raised:
        asyncio.run(live.fetch_live_endpoint(live.ROOM_INFO_ENDPOINT, {"roomId": "201"}, tmp_path))
    assert (raised.value.code, raised.value.endpoint, raised.value.status_code) == (
        "BILIBILI_PARSE_ERROR",
        live.ROOM_INFO_ENDPOINT,
        200,
    )
    assert "private raw body" not in str(raised.value)


@pytest.mark.parametrize(
    "value,expected",
    [
        ("2026-02-31 12:00:00", "2026-02-28T04:00:00Z"),
        ("2026-09-13 24:00:00", "2026-09-13T16:00:00Z"),
        ("2026-9-13 12:00:00", None),
        ("2026-09-13 24:00:01", None),
    ],
)
def test_original_smart_date_resolution(value, expected):
    result = live.parse_room_init_response(
        json.dumps({"code": 0, "data": {"uid": 101, "room_id": 201, "live_time": value}}), NOW
    )
    assert result.get("liveTime") == expected


@pytest.mark.parametrize(
    "payload", [{"uids": ["bad"]}, {"uids": ["10", "0"]}, {"uids": ["1", "2"], "extra": 1}]
)
def test_runtime_rejects_invalid_request_before_fetch(tmp_path, payload):
    calls = []

    async def fetch(endpoint, value, directory):
        calls.append(value)
        return {}

    request = RuntimeEnvelope.create(
        message_id="synthetic-input",
        message_type="bilibili.live.fetch-status-by-uids",
        payload={"taskId": "synthetic-task", "attempt": 1, "leaseId": "synthetic-lease", **payload},
        correlation_id="synthetic-correlation",
        trace_id="synthetic-trace",
    )
    result = asyncio.run(
        WorkerRuntime(role="crawler", data_directory=tmp_path, live_fetcher=fetch).handle(request)
    )
    assert result.type == "worker.error"
    assert result.payload["code"] == "BILIBILI_INPUT_INVALID"
    assert result.payload["endpoint"] == live.STATUS_BY_UIDS_ENDPOINT
    assert calls == []


@pytest.mark.parametrize("fixture", VALIDATION, ids=[f["name"] for f in VALIDATION])
def test_portable_schema_and_pydantic_accept_same_snapshot(fixture):
    value = {"uid": "101", "roomId": "201", "liveStatus": 0, **fixture["patch"]}
    validator = Draft202012Validator(
        {**SCHEMA, "$ref": "#/$defs/Snapshot"}, format_checker=FormatChecker()
    )
    assert validator.is_valid(value) is fixture["valid"]
    if fixture["valid"]:
        assert (
            LiveSnapshot.model_validate(value).model_dump(by_alias=True, exclude_none=True) == value
        )
    else:
        with pytest.raises(ValidationError):
            LiveSnapshot.model_validate(value)


@pytest.mark.parametrize(
    "fixture",
    [f for f in FIXTURES if "error" not in f],
    ids=[f["name"] for f in FIXTURES if "error" not in f],
)
def test_portable_and_pydantic_validate_real_parser_output(fixture):
    value = parse_fixture(fixture)
    endpoint = ENDPOINTS[fixture["method"]]
    payload = {
        "fetchedAt": NOW,
        "sourceEndpoint": endpoint,
        "statusCode": 200,
        "durationMs": 1,
        "evidenceObject": {
            "objectId": "sha256:" + "a" * 64,
            "sha256": "a" * 64,
            "relativePath": "objects/synthetic.json",
            "sizeBytes": 2,
            "mediaType": "application/json",
        },
    }
    if fixture["method"] == "status":
        payload["snapshots"] = value
        schema_name = "FetchedStatusBatch"
    elif fixture["method"] == "old":
        if value is not None:
            payload["snapshot"] = value
        schema_name = "FetchedOptionalSnapshot"
    else:
        payload.update(value)
        schema_name = "FetchedSnapshot"
    Draft202012Validator(
        {**SCHEMA, "$ref": f"#/$defs/{schema_name}"}, format_checker=FormatChecker()
    ).validate(payload)
    assert validate_live_result(endpoint, payload) == payload


def test_numeric_datetime_outside_supported_range_is_parse_error(monkeypatch, tmp_path):
    install_http(
        monkeypatch,
        lambda _: httpx.Response(
            200,
            json={
                "code": 0,
                "data": {"uid": 101, "room_id": 201, "live_time": 9223372036854775807},
            },
        ),
    )
    with pytest.raises(live.BilibiliCrawlerError) as raised:
        asyncio.run(live.fetch_live_endpoint(live.ROOM_INIT_ENDPOINT, {"roomId": "201"}, tmp_path))
    assert raised.value.code == "BILIBILI_PARSE_ERROR"
    assert raised.value.endpoint == live.ROOM_INIT_ENDPOINT


def test_http_timeout_preserves_network_category(monkeypatch, tmp_path):
    def timeout(request):
        raise httpx.ReadTimeout("Synthetic read timeout", request=request)

    install_http(monkeypatch, timeout)
    with pytest.raises(live.BilibiliCrawlerError) as raised:
        asyncio.run(live.fetch_live_endpoint(live.ROOM_INFO_ENDPOINT, {"roomId": "201"}, tmp_path))
    assert (raised.value.code, raised.value.retryable, raised.value.status_code) == (
        "BILIBILI_NETWORK_ERROR",
        True,
        None,
    )


def test_same_host_http_redirect_follows_original_get_behavior(monkeypatch, tmp_path):
    calls = []

    def handler(request):
        calls.append(request.url.path)
        if len(calls) == 1:
            return httpx.Response(302, headers={"Location": "/synthetic-live-redirect"})
        return httpx.Response(200, json={"code": 0, "data": {"uid": 101, "room_id": 201}})

    install_http(monkeypatch, handler)
    result = asyncio.run(
        live.fetch_live_endpoint(live.ROOM_INFO_ENDPOINT, {"roomId": "201"}, tmp_path)
    )
    assert result["uid"] == "101"
    assert calls == ["/" + live.ROOM_INFO_ENDPOINT, "/synthetic-live-redirect"]


@pytest.mark.parametrize("fixture", INPUTS, ids=[f["name"] for f in INPUTS])
def test_portable_request_and_pydantic(fixture):
    models = {
        "RoomRequest": live.BilibiliLiveRoomRequest,
        "UidRequest": live.BilibiliLiveUidRequest,
        "StatusRequest": live.BilibiliLiveStatusRequest,
    }
    validator = Draft202012Validator({**SCHEMA, "$ref": f"#/$defs/{fixture['schema']}"})
    if fixture["valid"]:
        value = models[fixture["schema"]].model_validate(fixture["input"]).model_dump(by_alias=True)
        assert value == fixture.get("output", fixture["input"])
        validator.validate(value)  # The portable wire schema validates normalized IDs.
    else:
        assert not validator.is_valid(fixture["input"])
        with pytest.raises(ValidationError):
            models[fixture["schema"]].model_validate(fixture["input"])


def test_worker_request_accepts_configured_batches_above_thirty():
    base = {"taskId": "t", "attempt": 1, "leaseId": "l"}
    assert (
        len(
            live.BilibiliLiveStatusRequest.model_validate(
                {**base, "uids": [str(i + 1) for i in range(30)]}
            ).uids
        )
        == 30
    )
    payload = {**base, "uids": [str(i + 1) for i in range(75)]}
    assert len(live.BilibiliLiveStatusRequest.model_validate(payload).uids) == 75
    Draft202012Validator({**SCHEMA, "$ref": "#/$defs/StatusRequest"}).validate(payload)


def test_legacy_live_counter_precision_is_not_a_platform_parse_error():
    value = {"uid": "101", "roomId": "201", "liveStatus": 1, "onlineCount": 9007199254740992}
    with pytest.raises(live.BilibiliCrawlerError) as raised:
        live.validate_live_snapshot_data(live.ROOM_INFO_ENDPOINT, value)
    assert raised.value.code == "LONG64_LEGACY_PRECISION_UNSUPPORTED"
    assert raised.value.retryable is False
