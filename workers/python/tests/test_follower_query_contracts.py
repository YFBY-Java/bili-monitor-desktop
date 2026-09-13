"""Cross-language input validation examples; history is owned by Core, not this Worker."""

import json
import re
from datetime import datetime
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
SCHEMA = json.loads((CONTRACTS / "schemas" / "bilibili-follower.v1.schema.json").read_text("utf-8"))
FIXTURES = json.loads((CONTRACTS / "fixtures" / "follower-query-inputs.json").read_text("utf-8"))
FORMATS = FormatChecker()


# jsonschema's date-time check is an optional extra. Register it explicitly so a
# clean install cannot silently accept timestamps without a timezone.
@FORMATS.checks("date-time", raises=(ValueError, TypeError))
def is_offset_datetime(value: object) -> bool:
    if not isinstance(value, str):
        return True  # JSON Schema's type keyword rejects non-strings separately.
    shape = (
        r"\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d"
        r"(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)"
    )
    return (
        re.fullmatch(shape, value) is not None and datetime.fromisoformat(value).tzinfo is not None
    )


@pytest.mark.parametrize("fixture", FIXTURES, ids=[item["name"] for item in FIXTURES])
def test_shared_follower_query_input(fixture: dict) -> None:
    schema = {**SCHEMA, "$ref": f"#/$defs/{fixture['schema']}"}
    validator = Draft202012Validator(schema, format_checker=FORMATS)
    assert validator.is_valid(fixture["input"]) is fixture["valid"]


def test_all_users_query_does_not_impose_a_hundred_user_limit() -> None:
    schema = {**SCHEMA, "$ref": "#/$defs/QueryBilibiliFollowerTrendsInput"}
    validator = Draft202012Validator(schema, format_checker=FORMATS)
    user_ids = [f"018f0f39-7b5e-4cc1-862d-{index:012d}" for index in range(505)]
    validator.validate({"userIds": user_ids})
