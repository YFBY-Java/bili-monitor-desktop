"""Cross-language validation of Core-owned startup config; Worker never reads this file."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
FIXTURES = json.loads(
    (CONTRACTS / "fixtures/live-collection-configuration.json").read_text("utf-8")
)
SCHEMA = json.loads(
    (CONTRACTS / "schemas/bilibili-live-collection-configuration.v1.schema.json").read_text("utf-8")
)


@pytest.mark.parametrize("fixture", FIXTURES, ids=[f["name"] for f in FIXTURES])
def test_shared_startup_configuration(fixture):
    assert Draft202012Validator(SCHEMA).is_valid(fixture["input"]) == fixture["valid"]
