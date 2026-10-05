"""Portable Subject v2 identities share the same positive Long golden domain."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
SCHEMA = json.loads((CONTRACTS / "schemas/bilibili-subject.v2.schema.json").read_text("utf-8"))
CASES = json.loads((CONTRACTS / "fixtures/follower-long64-canonical.json").read_text("utf-8"))
IDENTIFIER = "018f0f39-7b5e-4cc1-862d-9a208b3d0800"
TIMESTAMP = "2026-10-05T01:00:00.000Z"


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
@pytest.mark.parametrize("identity", ["user", "binding", "subject_binding"])
def test_nested_subject_mid_matches_positive_long_domain(case, identity):
    binding = {
        "id": IDENTIFIER,
        "subjectId": IDENTIFIER,
        "enabledCapabilities": ["follower"],
        "danmuEnabled": False,
        "createdAt": TIMESTAMP,
        "updatedAt": TIMESTAMP,
        "mid": case["value"],
    }
    value = {
        "subject": {
            "id": IDENTIFIER,
            "displayName": "Synthetic Long Subject",
            "tags": [],
            "monitorStatus": "ACTIVE",
            "createdAt": TIMESTAMP,
            "updatedAt": TIMESTAMP,
        },
        "summary": {"healthScore": 100, "enabledModuleCount": 1, "totalModuleCount": 4},
        "danmu": {"enabled": False, "status": "disabled", "recentMessages": []},
        "layout": [],
        "recentEvents": [],
    }
    if identity == "user":
        value["bilibiliUser"] = {
            "monitorId": IDENTIFIER,
            "mid": case["value"],
            "nickname": "Synthetic",
            "monitorStatus": "ACTIVE",
        }
    elif identity == "binding":
        value["bilibiliBinding"] = binding
    else:
        value["subject"]["bilibiliBinding"] = binding
    validator = Draft202012Validator(
        {"$ref": "#/$defs/BilibiliSubjectWorkbenchV2", "$defs": SCHEMA["$defs"]}
    )
    assert validator.is_valid(value) is case["positive"]
