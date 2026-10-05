"""Original readTree/ensureSuccess rules through both production parsers."""

import asyncio
import json

import httpx
import pytest

from bmd_workers.bilibili_follower import (
    CARD_ENDPOINT,
    RELATION_STAT_ENDPOINT,
    BilibiliCrawlerError,
    fetch_follower_profile,
    parse_card_response,
    parse_relation_stat_response,
)

FETCHED_AT = "2026-10-05T00:00:00Z"
MIN_CODE = -(2**31)
DATA = {"mid": "2", "card": {"mid": "2", "name": "合成JSON用户"}, "follower": 12}
SUCCESS = json.dumps({"code": 0, "data": DATA})


def parse(endpoint: str, raw: str):
    parser = parse_card_response if endpoint == CARD_ENDPOINT else parse_relation_stat_response
    return parser(raw, FETCHED_AT)


@pytest.mark.parametrize("endpoint", [CARD_ENDPOINT, RELATION_STAT_ENDPOINT])
@pytest.mark.parametrize(
    "raw",
    [
        "",
        " \t\r\n",
        "null",
        "true",
        "false",
        "0",
        "1.5",
        '"合成字符串"',
        "[]",
        "[0]",
        "0 {}",
        "true!",
        "true[]",
        "true\x01",
        '"x"garbage',
        "{}garbage",
    ],
)
def test_nonobject_or_missing_root_is_unknown_not_parse(endpoint: str, raw: str) -> None:
    with pytest.raises(BilibiliCrawlerError) as raised:
        parse(endpoint, raw)
    error = raised.value
    assert (error.code, error.bili_code, error.retryable, error.status_code) == (
        "BILIBILI_UNKNOWN_ERROR",
        MIN_CODE,
        False,
        200,
    )
    assert error.endpoint == endpoint
    assert str(error) == f"Bilibili API error: {MIN_CODE}"


@pytest.mark.parametrize("endpoint", [CARD_ENDPOINT, RELATION_STAT_ENDPOINT])
@pytest.mark.parametrize("suffix", [" ignored", "garbage", "{}", "//unused", "\x00"])
def test_reads_only_first_complete_object(endpoint: str, suffix: str) -> None:
    assert parse(endpoint, SUCCESS + suffix)["followerCount"] == 12


@pytest.mark.parametrize("endpoint", [CARD_ENDPOINT, RELATION_STAT_ENDPOINT])
@pytest.mark.parametrize(
    "raw",
    [
        "NaN",
        "Infinity",
        "-Infinity",
        "0garbage",
        "0{}",
        "0]",
        "0\x01",
        "truegarbage",
        "trueé",
        "null_more",
        "\ufeff{}",
        "{",
        "[0,]",
        "[",
        "{unquoted:0}",
        '{"code":0,}',
        '{"code":0,"unused":NaN}',
        '{"code":0,"unused":Infinity}',
        '{"code":00}',
        '{"code":+0}',
        '{"code":.0}',
        '{"code":0.}',
        '{"code":0e}',
        "/*comment*/{}",
        '{"code":-101,"unused":"unescaped\x00"}',
    ],
)
def test_first_value_must_obey_original_json_lexing(endpoint: str, raw: str) -> None:
    with pytest.raises(BilibiliCrawlerError) as raised:
        parse(endpoint, raw)
    assert (raised.value.code, raised.value.bili_code, raised.value.retryable) == (
        "BILIBILI_PARSE_ERROR",
        None,
        False,
    )


@pytest.mark.parametrize("endpoint", [CARD_ENDPOINT, RELATION_STAT_ENDPOINT])
def test_duplicate_fields_last_value_wins(endpoint: str) -> None:
    assert (
        parse(endpoint, '{"code":-101,"code":0,"data":' + json.dumps(DATA) + "}")["followerCount"]
        == 12
    )
    with pytest.raises(BilibiliCrawlerError) as raised:
        parse(endpoint, '{"code":0,"code":-101,"message":"first","message":"last"}')
    assert raised.value.code == "BILIBILI_AUTH_EXPIRED"
    assert str(raised.value) == "last"


@pytest.mark.parametrize("endpoint", [CARD_ENDPOINT, RELATION_STAT_ENDPOINT])
def test_finite_lexeme_can_overflow_to_infinity(endpoint: str) -> None:
    with pytest.raises(BilibiliCrawlerError) as raised:
        parse(endpoint, '{"code":1e400}')
    assert (raised.value.code, raised.value.bili_code, raised.value.retryable) == (
        "BILIBILI_UNKNOWN_ERROR",
        2**31 - 1,
        True,
    )


@pytest.mark.parametrize("endpoint", [CARD_ENDPOINT, RELATION_STAT_ENDPOINT])
@pytest.mark.parametrize("literal", ["true", "false", "null"])
@pytest.mark.parametrize("suffix", ["\u0cf3", "\u0ece"])
def test_observed_source_jdk20_identifier_suffix_is_invalid(endpoint, literal, suffix):
    # Original target is 17, but the last recorded local source runtime is
    # Java 20.0.1. These two BMP assignments distinguish Unicode 15 from 14.
    with pytest.raises(BilibiliCrawlerError) as raised:
        parse(endpoint, literal + suffix)
    assert raised.value.code == "BILIBILI_PARSE_ERROR"


@pytest.mark.parametrize("endpoint", [CARD_ENDPOINT, RELATION_STAT_ENDPOINT])
@pytest.mark.parametrize(
    ("digits", "category"),
    [
        (1000, "BILIBILI_AUTH_EXPIRED"),
        (1001, "BILIBILI_PARSE_ERROR"),
        (4301, "BILIBILI_PARSE_ERROR"),
    ],
)
@pytest.mark.parametrize("prefix", ["", "-"])
def test_numeric_token_limit_does_not_relax_python_global_guard(
    endpoint: str, digits: int, category: str, prefix: str
) -> None:
    with pytest.raises(BilibiliCrawlerError) as raised:
        parse(endpoint, '{"code":-101,"unused":' + prefix + "9" * digits + "}")
    assert raised.value.code == category


@pytest.mark.parametrize("endpoint", [CARD_ENDPOINT, RELATION_STAT_ENDPOINT])
@pytest.mark.parametrize(
    ("depth", "category"),
    [
        (995, "BILIBILI_AUTH_EXPIRED"),
        (1000, "BILIBILI_AUTH_EXPIRED"),
        (1001, "BILIBILI_PARSE_ERROR"),
    ],
)
def test_full_default_nesting_limit_without_python_recursion(
    endpoint: str, depth: int, category: str
) -> None:
    with pytest.raises(BilibiliCrawlerError) as raised:
        parse(
            endpoint, '{"code":-101,"unused":' + "[" * (depth - 1) + "0" + "]" * (depth - 1) + "}"
        )
    assert raised.value.code == category


@pytest.mark.parametrize(
    ("size", "category"), [(50_000, "BILIBILI_AUTH_EXPIRED"), (50_001, "BILIBILI_PARSE_ERROR")]
)
@pytest.mark.parametrize("unit", ["x", "🌸"])
def test_field_name_limit_uses_utf16_units(size: int, category: str, unit: str) -> None:
    value = unit * (size // (2 if unit == "🌸" else 1)) + ("x" if unit == "🌸" and size % 2 else "")
    with pytest.raises(BilibiliCrawlerError) as raised:
        parse(CARD_ENDPOINT, '{"code":-101,' + json.dumps(value, ensure_ascii=False) + ":0}")
    assert raised.value.code == category


@pytest.mark.parametrize(
    ("size", "category"),
    [(20_000_000, "BILIBILI_AUTH_EXPIRED"), (20_000_001, "BILIBILI_PARSE_ERROR")],
)
def test_default_string_limit(size: int, category: str) -> None:
    with pytest.raises(BilibiliCrawlerError) as raised:
        parse(CARD_ENDPOINT, '{"code":-101,"unused":"' + "x" * size + '"}')
    assert raised.value.code == category


@pytest.mark.parametrize(
    ("body", "content_type", "category", "message"),
    [
        (b"", "application/json", "BILIBILI_PARSE_ERROR", None),
        (b" \t\n", "application/json", "BILIBILI_UNKNOWN_ERROR", f"Bilibili API error: {MIN_CODE}"),
        (b'{"code":-101,"message":"\xff"}', "application/json", "BILIBILI_AUTH_EXPIRED", "\ufffd"),
        (b'{"code":-101,"message":"\xff"}', "text/plain", "BILIBILI_AUTH_EXPIRED", "ÿ"),
        (
            b'{"code":-101,"message":"\xff"}',
            "application/json;charset=ISO-8859-1",
            "BILIBILI_AUTH_EXPIRED",
            "ÿ",
        ),
        (
            b'{"code":-101,"message":"\xff"}',
            "text/plain;charset=UTF-8",
            "BILIBILI_AUTH_EXPIRED",
            "\ufffd",
        ),
        (
            b'{"code":-101,"message":"\xed\xa0\x80"}',
            "application/json",
            "BILIBILI_AUTH_EXPIRED",
            "\ufffd",
        ),
        (
            b'{"code":-101,"message":"\xed\xa0 "}',
            "application/json",
            "BILIBILI_AUTH_EXPIRED",
            "\ufffd ",
        ),
        (
            b'{"code":-101,"message":"\xed\xa0\xff"}',
            "application/json",
            "BILIBILI_AUTH_EXPIRED",
            "\ufffd\ufffd",
        ),
        (
            b'{"code":-101,"message":"\xed\xbf\xbf"}',
            "application/json",
            "BILIBILI_AUTH_EXPIRED",
            "\ufffd",
        ),
        (
            b'{"code":-101,"message":"\xed\x9f\xbf"}',
            "application/json",
            "BILIBILI_AUTH_EXPIRED",
            "\ud7ff",
        ),
        (
            b'{"code":-101,"message":"\xff"}',
            "application/problem+json",
            "BILIBILI_AUTH_EXPIRED",
            "\ufffd",
        ),
        (b'{"code":-101,"message":"\xff"}', "text/problem+json", "BILIBILI_AUTH_EXPIRED", "ÿ"),
        (b'{"code":-101,"message":"\xff"}', None, "BILIBILI_AUTH_EXPIRED", "ÿ"),
        (
            b'{"code":-101,"message":"\xff"}',
            "application/json;charset=unicode-1-1-utf-8",
            "BILIBILI_AUTH_EXPIRED",
            "\ufffd",
        ),
        (b'{"code":-101,"message":"\xff"}', "application/*", "BILIBILI_AUTH_EXPIRED", "\ufffd"),
        (b'\xef\xbb\xbf{"code":-101}', "application/json", "BILIBILI_PARSE_ERROR", None),
    ],
)
def test_http_body_to_string_matches_source_without_worker_crash(
    monkeypatch: pytest.MonkeyPatch,
    body: bytes,
    content_type: str | None,
    category: str,
    message: str | None,
) -> None:
    original = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **options: original(
            **options,
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    content=body,
                    headers={} if content_type is None else {"Content-Type": content_type},
                )
            ),
        ),
    )
    with pytest.raises(BilibiliCrawlerError) as raised:
        asyncio.run(fetch_follower_profile("2"))
    assert raised.value.code == category
    assert raised.value.status_code == 200
    if message is not None:
        assert str(raised.value) == message
