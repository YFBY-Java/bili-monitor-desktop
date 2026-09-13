"""Shared input acceptance only: live monitor queries execute in Local Core."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
SCHEMA = json.loads(
    (CONTRACTS / "schemas" / "bilibili-live-query.v1.schema.json").read_text("utf-8")
)
FIXTURES = json.loads((CONTRACTS / "fixtures" / "live-query-inputs.json").read_text("utf-8"))


@pytest.mark.parametrize("fixture", FIXTURES, ids=[item["name"] for item in FIXTURES])
def test_shared_live_query_input(fixture: dict) -> None:
    schema = {**SCHEMA, "$ref": f"#/$defs/{fixture['schema']}"}
    validator = Draft202012Validator(schema)
    assert validator.is_valid(fixture["input"]) is fixture["valid"]


def test_room_selection_is_not_capped_at_one_hundred() -> None:
    schema = {**SCHEMA, "$ref": "#/$defs/QueryBilibiliLiveTrendsInput"}
    validator = Draft202012Validator(schema)
    room_ids = [f"018f0f39-7b5e-4cc1-862d-{index:012d}" for index in range(505)]
    validator.validate({"roomMonitorIds": room_ids})
