import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from bmd_workers.bilibili_follower import (
    BilibiliCrawlerError,
    BilibiliFollowerProfile,
    parse_card_response,
)

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
TEXTS = json.loads((CONTRACTS / "fixtures/follower-profile-text.json").read_text("utf-8"))
SCHEMA = json.loads((CONTRACTS / "schemas/bilibili-follower.v1.schema.json").read_text("utf-8"))
SCHEMA["$ref"] = "#/$defs/BilibiliFollowerProfile"
VALIDATOR = Draft202012Validator(SCHEMA)
FETCHED = Draft202012Validator({**SCHEMA, "$ref": "#/$defs/BilibiliFollowerFetchedSnapshot"})
STORED = Draft202012Validator({**SCHEMA, "$ref": "#/$defs/BilibiliFollowerMonitor"})


def test_shared_jdk20_numeric_profile():
    cases = json.loads((CONTRACTS / "fixtures/java-double-text.json").read_text("utf-8"))
    for case in cases:
        token, expected = case["token"], case["text"]
        raw = (
            '{"code":0,"data":{"card":{"mid":2,"name":'
            + token
            + ',"face":'
            + token
            + '},"follower":10}}'
        )
        value = parse_card_response(raw, "2026-10-05T00:00:00Z")
        assert (value["nickname"], value["avatarUrl"]) == (expected, expected), case["name"]


def test_shared_jdk20_independent_follower_message():
    cases = json.loads((CONTRACTS / "fixtures/java-double-text.json").read_text("utf-8"))
    for case in cases:
        token, expected = case["token"], case["text"]
        with pytest.raises(BilibiliCrawlerError) as raised:
            parse_card_response('{"code":-101,"message":' + token + "}", "2026-10-05T00:00:00Z")
        assert str(raised.value) == expected, case["name"]


def test_numeric_text_keeps_integer_negative_zero_and_rejects_non_json_literals():
    for token, expected in [("-0", "0"), ("-0e0", "-0.0")]:
        value = parse_card_response(
            '{"code":0,"data":{"card":{"mid":2,"name":' + token + '},"follower":10}}',
            "2026-10-05T00:00:00Z",
        )
        assert value["nickname"] == expected
    for token in ["NaN", "Infinity", "-Infinity"]:
        with pytest.raises(BilibiliCrawlerError) as raised:
            parse_card_response('{"code":-101,"message":' + token + "}", "2026-10-05T00:00:00Z")
        assert raised.value.code == "BILIBILI_PARSE_ERROR"


@pytest.mark.parametrize("fixture", TEXTS, ids=[item["name"] for item in TEXTS])
def test_shared_raw_profile_text(fixture):
    value = fixture["input"]
    nickname = value * fixture.get("repeat", 1) if isinstance(value, str) else value
    profile = {"mid": "2", "nickname": nickname}
    assert VALIDATOR.is_valid(profile) == fixture["valid"]
    fetched = {
        **profile,
        "profileUrl": "https://space.bilibili.com/2",
        "followerCount": 10,
        "fetchedAt": "2026-10-05T00:00:00Z",
        "sourceEndpoint": "x/web-interface/card",
        "statusCode": 200,
        "durationMs": 1,
        "evidenceObject": {
            "objectId": "sha256:" + "a" * 64,
            "sha256": "a" * 64,
            "relativePath": "cas/synthetic.json",
            "sizeBytes": 1,
            "mediaType": "application/json",
        },
    }
    assert FETCHED.is_valid(fetched) == fixture["valid"]
    stored = {
        **profile,
        "id": "018f0f39-7b5e-7cc1-962d-9a208b3d0184",
        "profileUrl": "https://space.bilibili.com/2",
        "monitorStatus": "ACTIVE",
        "intervalSeconds": 60,
        "recentTrend": [],
        "version": 1,
    }
    assert STORED.is_valid(stored) == (
        fixture["valid"] and isinstance(nickname, str) and len(nickname) <= 160
    )
    if fixture["valid"]:
        assert BilibiliFollowerProfile.model_validate(profile).nickname == nickname
    else:
        with pytest.raises(ValidationError):
            BilibiliFollowerProfile.model_validate(profile)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("  原样昵称\t ", "  原样昵称\t "),
        ("\u3000原样昵称\u3000", "\u3000原样昵称\u3000"),
        ("\u00a0", "\u00a0"),
        ("\u2007", "\u2007"),
        ("\u202f", "\u202f"),
        ("\ufeff", "\ufeff"),
        ("\u0085", "\u0085"),
        ("\u200b", "\u200b"),
        (True, "true"),
        (False, "false"),
        (12, "12"),
        ("名" * 161, "名" * 161),
        (None, None),
        ({"name": "not a scalar"}, None),
        (["not a scalar"], None),
        ("", None),
        (" \t\r\n", None),
        ("\u001c\u001d\u001e\u001f", None),
        ("\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006", None),
        ("\u2008\u2009\u200a\u2028\u2029\u205f\u3000", None),
    ],
)
def test_original_optional_and_required_profile_text(value, expected):
    payload = {
        "code": 0,
        "data": {"card": {"mid": "2", "name": "valid", "face": value}, "follower": 10},
    }
    avatar = parse_card_response(json.dumps(payload), "2026-10-05T00:00:00Z")
    assert avatar.get("avatarUrl") == expected
    payload["data"]["card"]["name"] = value
    if expected is None:
        with pytest.raises(BilibiliCrawlerError, match="Missing card.name"):
            parse_card_response(json.dumps(payload), "2026-10-05T00:00:00Z")
    else:
        assert (
            parse_card_response(json.dumps(payload), "2026-10-05T00:00:00Z")["nickname"] == expected
        )
