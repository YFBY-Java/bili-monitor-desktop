"""Validate the language-neutral Node worker input without sending platform requests."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
FIXTURES = json.loads((CONTRACTS / "fixtures/live-http-configuration.json").read_text("utf-8"))
SCHEMA = json.loads(
    (CONTRACTS / "schemas/bilibili-danmaku-worker-start.v1.schema.json").read_text("utf-8")
)


@pytest.mark.parametrize("fixture", FIXTURES, ids=[f["name"] for f in FIXTURES])
def test_danmaku_http_shared_configuration(fixture):
    payload = {"connectionId": "fixture", "roomId": "33", "httpConfiguration": fixture["input"]}
    assert Draft202012Validator(SCHEMA).is_valid(payload) == fixture["valid"]


def test_danmaku_legacy_and_invalid_inputs():
    validator = Draft202012Validator(SCHEMA)
    base = {"connectionId": "fixture", "roomId": "33"}
    assert validator.is_valid(base)
    for extra in [
        {"httpConfiguration": None},
        {"url": "https://private.test"},
        {"roomId": "0"},
        {"protocolVersion": 4},
        {"credential": {"cookieHeader": "secret\r\nnew:header", "authUid": "1"}},
    ]:
        assert not validator.is_valid({**base, **extra})
