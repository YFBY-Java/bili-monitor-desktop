import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
SCHEMA = json.loads((CONTRACTS / "schemas" / "bilibili-auth.v1.schema.json").read_text("utf-8"))
FIXTURES = json.loads((CONTRACTS / "fixtures" / "auth-poll-cookies.json").read_text("utf-8"))


@pytest.mark.parametrize("fixture", FIXTURES, ids=[item["name"] for item in FIXTURES])
def test_shared_auth_worker_cookie_snapshot(fixture: dict) -> None:
    validator = Draft202012Validator(
        {**SCHEMA, "$ref": "#/$defs/BilibiliAuthWorkerPollResult"}, format_checker=FormatChecker()
    )
    assert validator.is_valid(fixture["value"]) is fixture["valid"]
