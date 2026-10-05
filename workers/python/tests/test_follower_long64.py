"""Observed JDK20/Jackson2.17.3 Long semantics through real follower parsers."""

import hashlib
import json

import pytest

from bmd_workers.bilibili_follower import (
    CARD_ENDPOINT,
    RELATION_STAT_ENDPOINT,
    BilibiliCrawlerError,
    parse_card_response,
    parse_relation_stat_response,
)

FETCHED_AT = "2026-10-05T00:00:00Z"
MIN_LONG = -(2**63)
MAX_LONG = 2**63 - 1

TOKENS = [
    ("9007199254740993", 9007199254740993),
    (str(MAX_LONG), MAX_LONG),
    (str(MIN_LONG), MIN_LONG),
    ("9223372036854775808", MIN_LONG),
    ("18446744073709551615", -1),
    ("18446744073709551616", 0),
    ("-9223372036854775809", MAX_LONG),
    ("-18446744073709551616", 0),
    ("10000000000000000000", -8446744073709551616),
    ("1e19", MAX_LONG),
    ("-1e19", MIN_LONG),
    ("1e309", MAX_LONG),
    ("-1e309", MIN_LONG),
    ("9007199254740993.0", 9007199254740992),
    ("1.99", 1),
    ("-1.99", -1),
    ("1e-999", 0),
    ("-0.0", 0),
    ('"9223372036854775807"', MAX_LONG),
    ('"-9223372036854775808"', MIN_LONG),
    ('"9223372036854775808"', None),
    ('"-9223372036854775809"', None),
    ('"+001"', 1),
    ('"-0"', 0),
    (json.dumps("0" * 5000 + "1"), 1),
    (json.dumps("-" + "0" * 5000 + "1"), -1),
    (json.dumps("\u0661\u0662\u0663"), 123),
    (json.dumps("1\u0662\uff13"), 123),
    (json.dumps("\uff11\uff12\uff13"), 123),
    (json.dumps("+\u0661"), 1),
    (json.dumps("-\u0661"), -1),
    ('" 1"', None),
    ('"1 "', None),
    ('"1_0"', None),
    ('"1.0"', None),
    ('"1e2"', None),
    ('"+"', None),
    (json.dumps("\u22121"), None),
    (json.dumps("\u00b2"), None),
    (json.dumps("\U0001d7cf"), None),
    ("true", None),
    ("null", None),
    ("[]", None),
    ("{}", None),
]


def raw_response(endpoint: str, follower: str, *, mid: str = '"2"') -> str:
    if endpoint == CARD_ENDPOINT:
        return (
            '{"code":0,"data":{"card":{"mid":'
            + mid
            + ',"name":"Long64","fans":7},"follower":'
            + follower
            + "}}"
        )
    return '{"code":0,"data":{"mid":' + mid + ',"follower":' + follower + "}}"


@pytest.mark.parametrize("endpoint", [CARD_ENDPOINT, RELATION_STAT_ENDPOINT])
@pytest.mark.parametrize(("token", "expected"), TOKENS, ids=range(len(TOKENS)))
def test_original_long_value_and_follower_fallback(endpoint, token, expected):
    parser = parse_card_response if endpoint == CARD_ENDPOINT else parse_relation_stat_response
    if expected is None and endpoint == RELATION_STAT_ENDPOINT:
        with pytest.raises(BilibiliCrawlerError) as raised:
            parser(raw_response(endpoint, token), FETCHED_AT)
        assert raised.value.code == "BILIBILI_PARSE_ERROR"
    else:
        result = parser(raw_response(endpoint, token), FETCHED_AT)
        assert result["followerCount"] == (7 if expected is None else expected)


@pytest.mark.parametrize("endpoint", [CARD_ENDPOINT, RELATION_STAT_ENDPOINT])
@pytest.mark.parametrize(
    ("mid", "expected"),
    [("0", "0"), ("-1", "-1"), ("9223372036854775808", str(MIN_LONG)), ('"+001"', "1")],
)
def test_response_mid_is_signed_and_canonical(endpoint, mid, expected):
    parser = parse_card_response if endpoint == CARD_ENDPOINT else parse_relation_stat_response
    parsed = parser(raw_response(endpoint, "12", mid=mid), FETCHED_AT)
    assert parsed["mid"] == expected
    assert parsed["profileUrl"] == f"https://space.bilibili.com/{expected}"


@pytest.mark.parametrize(
    ("attention", "expected"),
    [("-5", -5), ("18446744073709551616", 0), ('" 3"', 7), ('"9223372036854775808"', 7)],
)
def test_following_uses_same_conversion_without_replacing_valid_zero_or_negative(
    attention, expected
):
    raw = (
        '{"code":0,"data":{"card":{"mid":"2","name":"A","friend":7,"attention":'
        + attention
        + '},"follower":12}}'
    )
    assert parse_card_response(raw, FETCHED_AT)["followingCount"] == expected


def test_all_bmp_digits_match_observed_compiled_jdk20_client_oracle():
    from bmd_workers.bilibili_follower_long import parse_java_long

    # The digest was collected from the existing compiled BilibiliApiClient's
    # private parseLong on Oracle JDK20.0.1/Jackson2.17.3, all 65536 Java chars.
    digest = hashlib.sha256()
    accepted = 0
    for code in range(65536):
        result = parse_java_long(chr(code))
        if result is not None:
            accepted += 1
        text = "null" if result is None else str(result)
        digest.update(f"{code}:{text}\n".encode("ascii"))
    assert accepted == 370
    assert digest.hexdigest() == "1d045c18e872fac97712feb1f31ca5c8347f0228aaa5bc97352e98f87d4a4976"
