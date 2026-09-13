from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from bmd_workers import bilibili_auth as auth


def test_callback_only_fills_missing_response_cookies_and_keeps_metadata() -> None:
    existing = {
        "name": "SESSDATA",
        "value": "SYNTHETIC_HEADER%2FVALUE",
        "domain": ".bilibili.com",
        "path": "/",
        "secure": True,
        "httpOnly": True,
        "expiresAt": "2027-01-01T00:00:00Z",
    }
    result = auth.parse_qr_poll_response(
        json.dumps(
            {
                "code": 0,
                "data": {
                    "code": 0,
                    "url": "https://example.test/callback?SESSDATA=SYNTHETIC_QUERY&bili_jct=SYNTHETIC_CSRF&DedeUserID=99&Expires=invalid",
                },
            }
        ),
        [existing],
    )
    assert result["cookies"][0] == existing
    assert [item["name"] for item in result["cookies"]] == ["SESSDATA", "bili_jct", "DedeUserID"]
    assert result["cookies"][1]["value"] == "SYNTHETIC_CSRF"
    assert "expiresAt" not in result["cookies"][1]


def test_cookie_values_are_preserved_and_blank_or_unlisted_cookies_are_ignored() -> None:
    result = auth.merge_cookies(
        [],
        [
            {"name": "SESSDATA", "value": " SYNTHETIC%2FVALUE "},
            {"name": "sid", "value": "   "},
            {"name": "unrelated", "value": "discard"},
        ],
    )
    assert result == [{"name": "SESSDATA", "value": " SYNTHETIC%2FVALUE "}]


def test_generation_retains_http_session_cookies_outside_the_display_allowlist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(
                200,
                headers={"Set-Cookie": "b_lsid=SYNTHETIC_HTTP_ONLY; Path=/"},
                json={
                    "code": 0,
                    "data": {"url": "https://example.test/qr", "qrcode_key": "SYNTHETIC_KEY"},
                },
            )
        return httpx.Response(200, json={"code": 0, "data": {"code": 86101}})

    install_transport(monkeypatch, handler)
    generated = asyncio.run(auth.generate_qr_login())
    result = asyncio.run(auth.poll_qr_login(generated["qrcodeKey"], generated["cookies"]))
    assert "b_lsid=SYNTHETIC_HTTP_ONLY" in requests[1].headers.get("Cookie", "")
    assert result["cookies"] == []
    assert result["jarCookies"][0]["name"] == "b_lsid"


def install_transport(monkeypatch: pytest.MonkeyPatch, handler):
    real_client = httpx.AsyncClient
    settings = []

    def client(**kwargs):
        settings.append(kwargs)
        return real_client(**kwargs, transport=httpx.MockTransport(handler))

    monkeypatch.setattr(auth.httpx, "AsyncClient", client)
    return settings


def test_real_poll_path_merges_old_jar_headers_then_query(monkeypatch: pytest.MonkeyPatch) -> None:
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            headers=[
                (
                    "Set-Cookie",
                    "SESSDATA=SYNTHETIC_HEADER; Domain=.bilibili.com; Path=/; HttpOnly; Secure; SameSite=Lax",
                ),
            ],
            json={
                "code": 0,
                "data": {
                    "code": 0,
                    "url": "https://example.test/callback?SESSDATA=SYNTHETIC_QUERY&bili_jct=SYNTHETIC_CSRF&DedeUserID=99",
                },
            },
        )

    install_transport(monkeypatch, handler)
    result = asyncio.run(
        auth.poll_qr_login(
            "SYNTHETIC KEY+",
            [
                {
                    "name": "SESSDATA",
                    "value": "SYNTHETIC_OLD",
                    "domain": ".bilibili.com",
                    "path": "/",
                },
                {"name": "sid", "value": "SYNTHETIC_SID", "domain": ".bilibili.com", "path": "/"},
            ],
        )
    )
    assert requests[0].url.params["qrcode_key"] == "SYNTHETIC KEY+"
    assert requests[0].url.params["source"] == "main-fe-header"
    assert result["cookies"][0]["value"] == "SYNTHETIC_HEADER"
    assert result["cookies"][0]["httpOnly"] is True
    assert result["cookies"][0]["sameSite"] == "Lax"
    assert result["cookies"][-1]["value"] == "SYNTHETIC_SID"


def test_set_cookie_is_read_even_when_http_cookie_jar_discards_it() -> None:
    response = httpx.Response(
        200,
        request=httpx.Request("GET", auth.QR_POLL_URL),
        headers={
            "Set-Cookie": "SESSDATA=SYNTHETIC_EXPIRED; Domain=.bilibili.com; Path=/; Max-Age=0; HttpOnly; Secure",
        },
    )
    cookies = auth._cookies_from_response(response)
    assert len(cookies) == 1
    assert cookies[0]["value"] == "SYNTHETIC_EXPIRED"
    assert cookies[0]["httpOnly"] is True
    assert "expiresAt" in cookies[0]


@pytest.mark.parametrize("attributes", ["", "; Domain=.bilibili.com", "; Path=/"])
def test_session_jar_preserves_default_scope_for_the_next_deletion(
    monkeypatch: pytest.MonkeyPatch, attributes: str
) -> None:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(
                200,
                headers={"Set-Cookie": f"SESSDATA=SYNTHETIC_OLD{attributes}"},
                json={"code": 0, "data": {"code": 86101}},
            )
        return httpx.Response(
            200,
            headers={"Set-Cookie": f"SESSDATA=; Max-Age=0{attributes}"},
            json={
                "code": 0,
                "data": {
                    "code": 0,
                    "url": "https://example.test/callback?SESSDATA=SYNTHETIC_VALID",
                },
            },
        )

    install_transport(monkeypatch, handler)
    first = asyncio.run(auth.poll_qr_login("SYNTHETIC_KEY", []))
    second = asyncio.run(
        auth.poll_qr_login("SYNTHETIC_KEY", first.get("jarCookies", first["cookies"]))
    )
    assert second["cookies"][0]["value"] == "SYNTHETIC_VALID"
    assert second["jarCookies"] == []  # callback values never become HTTP session cookies.
    assert "domain" in first["jarCookies"][0]
    assert "path" in first["jarCookies"][0]


def test_deleted_cookie_does_not_override_a_later_callback_or_get_sent_again(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(
                200,
                headers={
                    "Set-Cookie": "SESSDATA=SYNTHETIC_DELETED; Max-Age=0; Domain=.bilibili.com; Path=/"
                },
                json={"code": 0, "data": {"code": 86101}},
            )
        return httpx.Response(
            200,
            json={
                "code": 0,
                "data": {
                    "code": 0,
                    "url": "https://example.test/callback?SESSDATA=SYNTHETIC_VALID&bili_jct=SYNTHETIC_CSRF&DedeUserID=99",
                },
            },
        )

    install_transport(monkeypatch, handler)
    first = asyncio.run(auth.poll_qr_login("SYNTHETIC_KEY", []))
    second = asyncio.run(auth.poll_qr_login("SYNTHETIC_KEY", first["cookies"]))
    assert "SYNTHETIC_DELETED" not in requests[1].headers.get("Cookie", "")
    assert second["cookies"][0]["value"] == "SYNTHETIC_VALID"


def test_expired_jar_cookie_is_removed_even_without_a_replacement_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_transport(
        monkeypatch, lambda request: httpx.Response(200, json={"code": 0, "data": {"code": 86101}})
    )
    result = asyncio.run(
        auth.poll_qr_login(
            "SYNTHETIC_KEY",
            [
                {
                    "name": "SESSDATA",
                    "value": "SYNTHETIC_EXPIRED",
                    "expiresAt": "2000-01-01T00:00:00Z",
                }
            ],
        )
    )
    assert result["cookies"] == []


@pytest.mark.parametrize("with_callback", [False, True])
def test_response_can_delete_an_existing_cookie_with_an_empty_value(
    monkeypatch: pytest.MonkeyPatch, with_callback: bool
) -> None:
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            data = {"code": 0 if with_callback else 86101}
            if with_callback:
                data["url"] = "https://example.test/callback?SESSDATA=SYNTHETIC_VALID"
            return httpx.Response(
                200,
                headers={"Set-Cookie": "SESSDATA=; Max-Age=0; Domain=.bilibili.com; Path=/"},
                json={"code": 0, "data": data},
            )
        return httpx.Response(200, json={"code": 0, "data": {"code": 86101}})

    install_transport(monkeypatch, handler)
    first = asyncio.run(
        auth.poll_qr_login(
            "SYNTHETIC_KEY",
            [
                {
                    "name": "SESSDATA",
                    "value": "SYNTHETIC_OLD",
                    "domain": ".bilibili.com",
                    "path": "/",
                }
            ],
        )
    )
    assert first["cookies"] == (
        [
            {
                "name": "SESSDATA",
                "value": "SYNTHETIC_VALID",
                "domain": ".bilibili.com",
                "path": "/",
                "httpOnly": True,
                "secure": True,
            }
        ]
        if with_callback
        else []
    )
    second = asyncio.run(auth.poll_qr_login("SYNTHETIC_KEY", first["cookies"]))
    assert "SYNTHETIC_OLD" not in requests[1].headers.get("Cookie", "")
    assert all(item["value"] != "SYNTHETIC_OLD" for item in second["cookies"])


def test_nav_uses_original_explicit_ordered_cookie_header_and_http_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200, json={"code": 0, "data": {"isLogin": True, "mid": 99, "uname": "合成账号"}}
        )

    settings = install_transport(monkeypatch, handler)
    result = asyncio.run(
        auth.validate_credential(
            [
                {
                    "name": "sid",
                    "value": "SYNTHETIC_SID",
                    "domain": "passport.bilibili.com",
                    "path": "/login",
                },
                {"name": "bili_jct", "value": "SYNTHETIC_CSRF"},
                {"name": "SESSDATA", "value": "SYNTHETIC%2FVALUE"},
            ]
        )
    )
    assert result["account"]["uname"] == "合成账号"
    assert (
        requests[0].headers["Cookie"]
        == "SESSDATA=SYNTHETIC%2FVALUE; bili_jct=SYNTHETIC_CSRF; sid=SYNTHETIC_SID"
    )
    assert (
        requests[0].headers["User-Agent"]
        == "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
    )
    assert requests[0].headers["Referer"] == "https://www.bilibili.com/"
    assert settings[0]["follow_redirects"] is False
    assert settings[0]["timeout"].connect == 5.0
    assert settings[0]["timeout"].read == 10.0


def test_network_failure_does_not_echo_the_qr_key_or_url(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"Cannot connect: {request.url}", request=request)

    install_transport(monkeypatch, handler)
    with pytest.raises(auth.BilibiliAuthError) as raised:
        asyncio.run(auth.poll_qr_login("SYNTHETIC_PRIVATE_QR_KEY", []))
    assert raised.value.code == "BILIBILI_AUTH_NETWORK_ERROR"
    assert raised.value.retryable is True
    assert "SYNTHETIC_PRIVATE_QR_KEY" not in str(raised.value)
    assert "qrcode_key" not in str(raised.value)


@pytest.mark.parametrize(
    "status, retryable", [(302, False), (403, False), (429, True), (503, True)]
)
def test_http_errors_remain_classified_and_redirects_are_not_followed(
    monkeypatch: pytest.MonkeyPatch, status: int, retryable: bool
) -> None:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(status, headers={"Location": "https://example.test/unwanted"})

    install_transport(monkeypatch, handler)
    with pytest.raises(auth.BilibiliAuthError) as raised:
        asyncio.run(auth.generate_qr_login())
    assert raised.value.status_code == status
    assert raised.value.retryable is retryable
    assert len(calls) == 1
