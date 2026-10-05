"""Original BilibiliApiClient.ensureSuccess/get rules, not a live-client policy."""

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
MIN_CODE = -(2**31)


def parse(endpoint: str, payload: dict):
    parser = parse_card_response if endpoint == CARD_ENDPOINT else parse_relation_stat_response
    return parser(json.dumps(payload), FETCHED_AT)


def valid_data(endpoint: str) -> dict:
    if endpoint == CARD_ENDPOINT:
        return {"card": {"mid": "2", "name": "合成返回码用户"}, "follower": 12}
    return {"mid": "2", "follower": 12}


@pytest.mark.parametrize("endpoint", [CARD_ENDPOINT, RELATION_STAT_ENDPOINT])
@pytest.mark.parametrize(
    "code",
    [
        "0",
        " +0 ",
        False,
        0.9,
        "-0.9",
        "0d",
        "NaN",
        2**32,
        "+ 0",
        "+\tNaN",
        pytest.param("0" * 5000, id="long-zero-code"),
    ],
)
def test_success_code_uses_original_jackson_as_int(endpoint: str, code: object) -> None:
    assert parse(endpoint, {"code": code, "data": valid_data(endpoint)})["followerCount"] == 12


@pytest.mark.parametrize("endpoint", [CARD_ENDPOINT, RELATION_STAT_ENDPOINT])
@pytest.mark.parametrize(
    ("value", "expected", "category", "retryable"),
    [
        (" -101 ", -101, "BILIBILI_AUTH_EXPIRED", False),
        ("-352.9", -352, "BILIBILI_RISK_CONTROL", False),
        (-412.9, -412, "BILIBILI_RISK_CONTROL", False),
        (True, 1, "BILIBILI_UNKNOWN_ERROR", False),
        ("500", 500, "BILIBILI_UNKNOWN_ERROR", True),
        (-500, -500, "BILIBILI_UNKNOWN_ERROR", False),
        ("++500", 500, "BILIBILI_UNKNOWN_ERROR", True),
        ("+-500", -500, "BILIBILI_UNKNOWN_ERROR", False),
        ("+\t-101", -101, "BILIBILI_AUTH_EXPIRED", False),
        ("+ 500", 500, "BILIBILI_UNKNOWN_ERROR", True),
        ("+ 2147483648", 2**31 - 1, "BILIBILI_UNKNOWN_ERROR", True),
        ("+\u00a0500", MIN_CODE, "BILIBILI_UNKNOWN_ERROR", False),
        pytest.param("0" * 5000 + "500", 500, "BILIBILI_UNKNOWN_ERROR", True, id="long-zero-500"),
        pytest.param(
            "+" + "0" * 5000 + "500", 500, "BILIBILI_UNKNOWN_ERROR", True, id="long-plus-zero-500"
        ),
        pytest.param(
            "-" + "0" * 5000 + "101", -101, "BILIBILI_AUTH_EXPIRED", False, id="long-zero-auth"
        ),
        pytest.param("9" * 5000, MIN_CODE, "BILIBILI_UNKNOWN_ERROR", False, id="long-overflow"),
        ("0x1.f4p8", 500, "BILIBILI_UNKNOWN_ERROR", True),
        (2**32 + 500, 500, "BILIBILI_UNKNOWN_ERROR", True),
        (2**31, MIN_CODE, "BILIBILI_UNKNOWN_ERROR", False),
        (1e99, 2**31 - 1, "BILIBILI_UNKNOWN_ERROR", True),
        ("Infinity", 2**31 - 1, "BILIBILI_UNKNOWN_ERROR", True),
        ("-Infinity", MIN_CODE, "BILIBILI_UNKNOWN_ERROR", False),
        ("2147483648", MIN_CODE, "BILIBILI_UNKNOWN_ERROR", False),
        ("1_000", MIN_CODE, "BILIBILI_UNKNOWN_ERROR", False),
        ("\u00a0500\u00a0", MIN_CODE, "BILIBILI_UNKNOWN_ERROR", False),
        ("５００", MIN_CODE, "BILIBILI_UNKNOWN_ERROR", False),
        ("", MIN_CODE, "BILIBILI_UNKNOWN_ERROR", False),
        (None, MIN_CODE, "BILIBILI_UNKNOWN_ERROR", False),
        ({"code": 500}, MIN_CODE, "BILIBILI_UNKNOWN_ERROR", False),
        ([500], MIN_CODE, "BILIBILI_UNKNOWN_ERROR", False),
    ],
)
def test_original_error_code_and_metadata(
    endpoint: str, value: object, expected: int, category: str, retryable: bool
) -> None:
    with pytest.raises(BilibiliCrawlerError) as raised:
        parse(endpoint, {"code": value})
    error = raised.value
    assert (error.code, error.bili_code, error.retryable) == (category, expected, retryable)
    assert error.endpoint == endpoint
    assert error.status_code == 200
    assert str(error) == f"Bilibili API error: {expected}"


@pytest.mark.parametrize("endpoint", [CARD_ENDPOINT, RELATION_STAT_ENDPOINT])
def test_missing_code_has_original_default_metadata(endpoint: str) -> None:
    with pytest.raises(BilibiliCrawlerError) as raised:
        parse(endpoint, {})
    assert raised.value.code == "BILIBILI_UNKNOWN_ERROR"
    assert raised.value.bili_code == MIN_CODE
    assert raised.value.retryable is False


@pytest.mark.parametrize("endpoint", [CARD_ENDPOINT, RELATION_STAT_ENDPOINT])
@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("  过期  ", "  过期  "),
        ("\u00a0", "\u00a0"),
        ("\u2007", "\u2007"),
        ("\u202f", "\u202f"),
        ("\ufeff", "\ufeff"),
        ("\t\n\u3000", "Bilibili API error: -101"),
        ("", "Bilibili API error: -101"),
        (None, "Bilibili API error: -101"),
        ({"message": "not scalar"}, "Bilibili API error: -101"),
        (["not scalar"], "Bilibili API error: -101"),
        (False, "false"),
        (True, "true"),
        (123, "123"),
    ],
)
def test_error_message_uses_original_text_and_blank_rules(
    endpoint: str, message: object, expected: str
) -> None:
    with pytest.raises(BilibiliCrawlerError) as raised:
        parse(endpoint, {"code": -101, "message": message})
    assert str(raised.value) == expected


@pytest.mark.parametrize("endpoint", [CARD_ENDPOINT, RELATION_STAT_ENDPOINT])
@pytest.mark.parametrize("voucher", [False, 0, "", {}, []])
def test_non_null_voucher_precedes_error_code(endpoint: str, voucher: object) -> None:
    with pytest.raises(BilibiliCrawlerError) as raised:
        parse(endpoint, {"code": "500", "data": {"v_voucher": voucher}})
    assert raised.value.code == "BILIBILI_RISK_CONTROL"
    assert raised.value.bili_code == 0
    assert raised.value.retryable is False
