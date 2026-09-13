from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from http.cookiejar import Cookie
from http.cookies import CookieError, SimpleCookie
from typing import Any
from urllib.parse import parse_qsl, urlparse

import httpx

QR_GENERATE_URL = "https://passport.bilibili.com/x/passport-login/web/qrcode/generate"
QR_POLL_URL = "https://passport.bilibili.com/x/passport-login/web/qrcode/poll"
NAV_URL = "https://api.bilibili.com/x/web-interface/nav"
COOKIE_ORDER = (
    "SESSDATA",
    "bili_jct",
    "DedeUserID",
    "DedeUserID__ckMd5",
    "sid",
    "buvid3",
    "buvid4",
    "b_nut",
)
HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
    "Referer": "https://www.bilibili.com/",
}


class BilibiliAuthError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        retryable: bool,
        endpoint: str,
        status_code: int | None = None,
        bili_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.endpoint = endpoint
        self.status_code = status_code
        self.bili_code = bili_code


def _decode_object(raw: str, endpoint: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as error:
        raise BilibiliAuthError(
            "BILIBILI_AUTH_PARSE_ERROR",
            f"Unable to parse Bilibili auth response: {error.msg}",
            retryable=False,
            endpoint=endpoint,
        ) from error
    if not isinstance(value, dict):
        raise BilibiliAuthError(
            "BILIBILI_AUTH_PARSE_ERROR",
            "Bilibili auth response root must be an object.",
            retryable=False,
            endpoint=endpoint,
        )
    return value


def _object(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _text(value: object) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def _integer(value: object) -> int | None:
    if value is None or isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return None


def _cookie_value(value: object) -> str | None:
    # Cookie bytes are opaque; only reject blanks, do not normalize the value.
    return value if isinstance(value, str) and value.strip() else None


def _ensure_root_success(root: dict[str, Any], endpoint: str) -> None:
    code = _integer(root.get("code"))
    if code == 0:
        return
    raise BilibiliAuthError(
        "BILIBILI_AUTH_API_ERROR",
        _text(root.get("message")) or f"Bilibili auth API returned {code}",
        retryable=False,
        endpoint=endpoint,
        status_code=200,
        bili_code=code,
    )


def parse_qr_generate_response(
    raw: str,
    response_cookies: list[dict[str, Any]],
) -> dict[str, Any]:
    root = _decode_object(raw, "bilibili.auth.qr.generate")
    _ensure_root_success(root, "bilibili.auth.qr.generate")
    data = _object(root.get("data"))
    qr_url = _text(data.get("url"))
    qrcode_key = _text(data.get("qrcode_key"))
    if qr_url is None or qrcode_key is None:
        raise BilibiliAuthError(
            "BILIBILI_AUTH_PARSE_ERROR",
            "Bilibili QR generate response is missing url or qrcode_key.",
            retryable=False,
            endpoint="bilibili.auth.qr.generate",
            status_code=200,
        )
    return {
        "qrUrl": qr_url,
        "qrcodeKey": qrcode_key,
        "cookies": response_cookies,
    }


def parse_qr_poll_response(
    raw: str,
    response_cookies: list[dict[str, Any]],
) -> dict[str, Any]:
    root = _decode_object(raw, "bilibili.auth.qr.poll")
    _ensure_root_success(root, "bilibili.auth.qr.poll")
    data = _object(root.get("data"))
    code = _integer(data.get("code"))
    if code is None:
        raise BilibiliAuthError(
            "BILIBILI_AUTH_PARSE_ERROR",
            "Bilibili QR poll response is missing status code.",
            retryable=False,
            endpoint="bilibili.auth.qr.poll",
            status_code=200,
        )
    cross_domain_cookies = _cookies_from_cross_domain_url(_text(data.get("url")))
    result: dict[str, Any] = {
        "code": code,
        "message": _text(data.get("message")) or "",
        # The original client uses callback query values only for missing names.
        "cookies": merge_cookies(cross_domain_cookies, response_cookies),
    }
    refresh_token = _text(data.get("refresh_token"))
    if refresh_token is not None:
        result["refreshToken"] = refresh_token
    return result


def parse_nav_response(raw: str) -> dict[str, Any]:
    root = _decode_object(raw, "bilibili.auth.nav")
    data = _object(root.get("data"))
    code = _integer(root.get("code"))
    if code != 0 or data.get("isLogin") is not True:
        raise BilibiliAuthError(
            "BILIBILI_AUTH_EXPIRED",
            "Bilibili credential is not logged in.",
            retryable=False,
            endpoint="bilibili.auth.nav",
            status_code=200,
            bili_code=code,
        )
    mid = _integer(data.get("mid"))
    uname = _text(data.get("uname"))
    if mid is None or mid <= 0 or uname is None:
        raise BilibiliAuthError(
            "BILIBILI_AUTH_PARSE_ERROR",
            "Bilibili nav response is missing account identity.",
            retryable=False,
            endpoint="bilibili.auth.nav",
            status_code=200,
        )
    account: dict[str, Any] = {"mid": str(mid), "uname": uname}
    face = _text(data.get("face"))
    level = _integer(_object(data.get("level_info")).get("current_level"))
    vip_status = _integer(data.get("vipStatus"))
    if face is not None:
        account["face"] = face
    if level is not None and level >= 0:
        account["level"] = level
    if vip_status is not None and vip_status >= 0:
        account["vipStatus"] = vip_status
    return {"account": account, "rawPayload": root}


async def generate_qr_login() -> dict[str, Any]:
    response, jar_cookies = await _get(QR_GENERATE_URL, params={"source": "main-fe-header"})
    return parse_qr_generate_response(response.text, jar_cookies)


async def poll_qr_login(
    qrcode_key: str,
    cookies: list[dict[str, Any]],
) -> dict[str, Any]:
    response, jar_cookies = await _get(
        QR_POLL_URL,
        params={"qrcode_key": qrcode_key, "source": "main-fe-header"},
        cookies=cookies,
    )
    # The HTTP jar has applied expiry and deletion, including empty Max-Age=0.
    # Raw headers remain a separate source for this response's display metadata.
    response_cookies = merge_cookies(jar_cookies, _cookies_from_response(response))
    result = parse_qr_poll_response(response.text, response_cookies)
    result["jarCookies"] = jar_cookies
    return result


async def validate_credential(cookies: list[dict[str, Any]]) -> dict[str, Any]:
    response, _ = await _get(NAV_URL, cookies=cookies)
    return parse_nav_response(response.text)


async def _get(
    url: str,
    *,
    params: dict[str, str] | None = None,
    cookies: list[dict[str, Any]] | None = None,
) -> tuple[httpx.Response, list[dict[str, Any]]]:
    jar = httpx.Cookies()
    for item in cookies or []:
        name = _text(item.get("name"))
        value = _cookie_value(item.get("value"))
        if name is None or value is None:
            continue
        jar.jar.set_cookie(_cookie_to_jar(item, name, value))
    headers = dict(HEADERS)
    if url == NAV_URL:
        # fetchNav sends the full ordered credential header, not a domain-filtered jar.
        headers["Cookie"] = "; ".join(
            f"{item['name']}={item['value']}" for item in merge_cookies([], cookies or [])
        )
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            headers=headers,
            cookies=jar,
            follow_redirects=False,
        ) as client:
            response = await client.get(url, params=params)
            jar_cookies = [
                _cookie_from_jar(cookie) for cookie in client.cookies.jar if not cookie.is_expired()
            ]
    except httpx.RequestError as error:
        raise BilibiliAuthError(
            "BILIBILI_AUTH_NETWORK_ERROR",
            "Network error calling Bilibili authentication.",
            retryable=True,
            endpoint=url,
        ) from error
    if response.status_code < 200 or response.status_code >= 300:
        raise BilibiliAuthError(
            "BILIBILI_AUTH_HTTP_ERROR",
            f"Bilibili auth HTTP {response.status_code}.",
            retryable=response.status_code == 429 or response.status_code >= 500,
            endpoint=url,
            status_code=response.status_code,
        )
    return response, jar_cookies


def merge_cookies(
    current: list[dict[str, Any]],
    incoming: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for item in [*current, *incoming]:
        name = _text(item.get("name"))
        value = _cookie_value(item.get("value"))
        if name in COOKIE_ORDER and value is not None:
            merged[name] = {**item, "name": name, "value": value}
    return [merged[name] for name in COOKIE_ORDER if name in merged]


def _cookie_to_jar(item: dict[str, Any], name: str, value: str) -> Cookie:
    domain = _text(item.get("domain")) or ".bilibili.com"
    expires_at = item.get("expiresAt")
    expires = (
        int(datetime.fromisoformat(expires_at.replace("Z", "+00:00")).timestamp())
        if isinstance(expires_at, str)
        else None
    )
    rest: dict[str, str] = {}
    if item.get("httpOnly"):
        rest["HttpOnly"] = ""
    if item.get("sameSite"):
        rest["SameSite"] = str(item["sameSite"])
    return Cookie(
        version=0,
        name=name,
        value=value,
        port=None,
        port_specified=False,
        domain=domain,
        domain_specified=domain.startswith("."),
        domain_initial_dot=domain.startswith("."),
        path=_text(item.get("path")) or "/",
        path_specified=True,
        secure=bool(item.get("secure")),
        expires=expires,
        discard=expires is None,
        comment=None,
        comment_url=None,
        rest=rest,
        rfc2109=False,
    )


def _cookies_from_cross_domain_url(url: str | None) -> list[dict[str, Any]]:
    if url is None:
        return []
    values = dict(parse_qsl(urlparse(url).query, keep_blank_values=False))
    expires_at: str | None = None
    expires = _integer(values.get("Expires"))
    if expires is not None:
        expires_at = (
            datetime.fromtimestamp(expires, timezone.utc).isoformat().replace("+00:00", "Z")
        )
    cookies: list[dict[str, Any]] = []
    for name in COOKIE_ORDER:
        value = _cookie_value(values.get(name))
        if value is None:
            continue
        item: dict[str, Any] = {
            "name": name,
            "value": value,
            "domain": ".bilibili.com",
            "path": "/",
            "httpOnly": name == "SESSDATA",
            "secure": True,
        }
        if expires_at is not None:
            item["expiresAt"] = expires_at
        cookies.append(item)
    return cookies


def _cookies_from_response(response: httpx.Response) -> list[dict[str, Any]]:
    cookies = [_cookie_from_jar(cookie) for cookie in response.cookies.jar]
    # Read raw Set-Cookie as the original PassportClient does. CookieJar may discard
    # Max-Age=0 or mismatched-domain entries before we can inspect their metadata.
    for header in response.headers.get_list("set-cookie"):
        parsed = SimpleCookie()
        try:
            parsed.load(header)
        except CookieError:
            continue
        for name, morsel in parsed.items():
            item: dict[str, Any] = {
                "name": name,
                "value": morsel.value,
                "httpOnly": bool(morsel["httponly"]),
                "secure": bool(morsel["secure"]),
            }
            for attribute, field in [
                ("domain", "domain"),
                ("path", "path"),
                ("samesite", "sameSite"),
            ]:
                if morsel[attribute]:
                    item[field] = morsel[attribute]
            expires_at = _header_cookie_expiry(morsel["max-age"], morsel["expires"])
            if expires_at is not None:
                item["expiresAt"] = expires_at
            cookies.append(item)
    return merge_cookies([], cookies)


def _header_cookie_expiry(max_age: str, expires: str) -> str | None:
    seconds = _integer(max_age)
    try:
        if seconds is not None:
            if seconds < 0:
                return None
            expiry = datetime.now(timezone.utc) + timedelta(seconds=seconds)
        elif expires:
            expiry = parsedate_to_datetime(expires)
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
        else:
            return None
        return expiry.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except (ValueError, TypeError, OverflowError):
        return None


def _cookie_from_jar(cookie: Cookie) -> dict[str, Any]:
    item: dict[str, Any] = {
        "name": cookie.name,
        "value": cookie.value,
        "domain": cookie.domain,
        "path": cookie.path,
        "httpOnly": cookie.has_nonstandard_attr("HttpOnly"),
        "secure": cookie.secure,
    }
    if cookie.expires is not None:
        item["expiresAt"] = (
            datetime.fromtimestamp(cookie.expires, timezone.utc).isoformat().replace("+00:00", "Z")
        )
    same_site = cookie.get_nonstandard_attr("SameSite")
    if same_site:
        item["sameSite"] = str(same_site)
    return item
