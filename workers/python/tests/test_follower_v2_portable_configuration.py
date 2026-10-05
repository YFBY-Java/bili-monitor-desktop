"""V2 request HTTP defaults and headers match the existing shared HTTP golden cases."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from bmd_workers.bilibili_follower_v2 import BilibiliFollowerFetchRequestV2

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
SCHEMA = json.loads((CONTRACTS / "schemas/bilibili-follower.v2.schema.json").read_text("utf-8"))
HTTP_CASES = json.loads(
    (CONTRACTS / "fixtures/follower-http-configuration.json").read_text("utf-8")
)
HTTP_DEFAULTS = {
    "connectTimeoutMs": 5000,
    "readTimeoutMs": 10000,
    "userAgent": "SocialDataMonitor/0.1 (+low-frequency public Bilibili follower monitor)",
    "referer": "https://www.bilibili.com/",
}
for field in ("userAgent", "referer"):
    for name, value, valid in (
        ("horizontal tab", "A\tB", True),
        ("final LF", "A\n", False),
        ("final CR", "A\r", False),
        ("DEL", "A\u007f", False),
        ("Unicode", "A\u00e9", False),
    ):
        HTTP_CASES.append(
            {
                "name": f"{field} {name}",
                "input": {"httpConfiguration": {**HTTP_DEFAULTS, field: value}},
                "valid": valid,
            }
        )


@pytest.mark.parametrize("case", HTTP_CASES, ids=lambda case: case["name"])
def test_v2_request_http_defaults_and_headers_match_portable_schema(case):
    request = {"mid": "2", "taskId": "task", "attempt": 1, "leaseId": "lease", **case["input"]}
    validator = Draft202012Validator({**SCHEMA, "$ref": "#/$defs/BilibiliFollowerFetchRequestV2"})
    assert validator.is_valid(request) is case["valid"]
    if case["valid"]:
        assert BilibiliFollowerFetchRequestV2.model_validate(request).mid == "2"
    else:
        with pytest.raises(ValidationError):
            BilibiliFollowerFetchRequestV2.model_validate(request)
