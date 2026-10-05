"""Core-owned startup settings share one portable contract; Python never reads user config."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
FIXTURES = json.loads(
    (CONTRACTS / "fixtures/follower-collection-configuration.json").read_text("utf-8")
)
SCHEMA = json.loads(
    (CONTRACTS / "schemas/bilibili-follower-collection-configuration.v1.schema.json").read_text(
        "utf-8"
    )
)


@pytest.mark.parametrize("fixture", FIXTURES, ids=[item["name"] for item in FIXTURES])
def test_shared_follower_startup_configuration(fixture):
    assert Draft202012Validator(SCHEMA).is_valid(fixture["input"]) == fixture["valid"]
