"""Validate the language-neutral Node worker input without sending platform requests."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
FIXTURES = json.loads((CONTRACTS / "fixtures/live-http-configuration.json").read_text("utf-8"))
PROTOCOL_FIXTURES = json.loads(
    (CONTRACTS / "fixtures/danmaku-worker-protocol-selection.json").read_text("utf-8")
)
CONNECTION_FIXTURES = json.loads(
    (CONTRACTS / "fixtures/danmaku-worker-connection-configuration.json").read_text("utf-8")
)
SCHEMA = json.loads(
    (CONTRACTS / "schemas/bilibili-danmaku-worker-start.v1.schema.json").read_text("utf-8")
)
LIFECYCLE_FIXTURES = json.loads(
    (CONTRACTS / "fixtures/danmaku-worker-auth-lifecycle.json").read_text("utf-8")
)


@pytest.mark.parametrize("fixture", LIFECYCLE_FIXTURES, ids=[f["name"] for f in LIFECYCLE_FIXTURES])
def test_danmaku_auth_lifecycle_contract(fixture):
    filename = "start-result" if fixture["kind"] == "result" else "lifecycle-event"
    schema = json.loads(
        (CONTRACTS / f"schemas/bilibili-danmaku-worker-{filename}.v1.schema.json").read_text(
            "utf-8"
        )
    )
    validator = Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)
    assert validator.is_valid(fixture["input"]) == fixture["valid"]


@pytest.mark.parametrize("fixture", FIXTURES, ids=[f["name"] for f in FIXTURES])
def test_danmaku_http_shared_configuration(fixture):
    payload = {"connectionId": "fixture", "roomId": "33", "httpConfiguration": fixture["input"]}
    assert Draft202012Validator(SCHEMA).is_valid(payload) == fixture["valid"]


@pytest.mark.parametrize(
    "fixture",
    PROTOCOL_FIXTURES + CONNECTION_FIXTURES,
    ids=[f["name"] for f in PROTOCOL_FIXTURES + CONNECTION_FIXTURES],
)
def test_danmaku_protocol_shared_configuration(fixture):
    payload = {"connectionId": "fixture", "roomId": "33", **fixture["input"]}
    assert Draft202012Validator(SCHEMA).is_valid(payload) == fixture["valid"]


def test_danmaku_legacy_and_invalid_inputs():
    validator = Draft202012Validator(SCHEMA)
    base = {"connectionId": "fixture", "roomId": "33"}
    assert validator.is_valid(base)
    for extra in [
        {"httpConfiguration": None},
        {"connectionConfiguration": None},
        {"connectionConfiguration": {"extra": True}},
        {"url": "https://private.test"},
        {"roomId": "0"},
        {"protocolVersion": 4},
        {"credential": {"cookieHeader": "secret\r\nnew:header", "authUid": "1"}},
    ]:
        assert not validator.is_valid({**base, **extra})


def test_realtime_error_metadata_shared_contract():
    schema = json.loads(
        (CONTRACTS / "schemas/realtime-worker-error.v1.schema.json").read_text("utf-8")
    )
    fixture = json.loads((CONTRACTS / "fixtures/realtime-worker-error.json").read_text("utf-8"))
    validator = Draft202012Validator(schema)
    assert validator.is_valid(fixture)
    assert validator.is_valid({"code": "FIXTURE_ERROR", "message": ""})
    for extra in [
        {"biliCode": 2147483648},
        {"statusCode": 99},
        {"endpoint": "https://private.test"},
        {"cookieHeader": "synthetic"},
    ]:
        assert not validator.is_valid({**fixture, **extra})
