from __future__ import annotations

from typing import Any, Literal

import httpx


class DouyinOAuthError(RuntimeError):
    def __init__(self, code: str, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


async def request_oauth(
    operation: Literal["exchange", "refresh", "userinfo"],
    payload: dict[str, Any],
    *,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    if operation == "exchange":
        path = "/oauth/access_token/"
        form = {
            "client_key": required(payload, "clientKey"),
            "client_secret": required(payload, "clientSecret"),
            "code": required(payload, "code"),
            "grant_type": "authorization_code",
        }
    elif operation == "refresh":
        path = "/oauth/refresh_token/"
        form = {
            "client_key": required(payload, "clientKey"),
            "grant_type": "refresh_token",
            "refresh_token": required(payload, "refreshToken"),
        }
    else:
        path = "/oauth/userinfo/"
        form = {
            "access_token": required(payload, "accessToken"),
            "open_id": required(payload, "openId"),
        }

    owns_client = client is None
    active_client = client or httpx.AsyncClient(
        base_url="https://open.douyin.com",
        timeout=httpx.Timeout(20.0),
        follow_redirects=False,
    )
    try:
        response = await active_client.post(path, data=form)
        response.raise_for_status()
        value = response.json()
        if not isinstance(value, dict):
            raise DouyinOAuthError(
                "DOUYIN_OAUTH_PARSE_ERROR",
                "Douyin OAuth returned a non-object response.",
                retryable=False,
            )
        return {str(key): item for key, item in value.items()}
    except DouyinOAuthError:
        raise
    except httpx.HTTPStatusError as error:
        raise DouyinOAuthError(
            "DOUYIN_OAUTH_HTTP_ERROR",
            f"Douyin OAuth HTTP {error.response.status_code}.",
            retryable=error.response.status_code >= 500,
        ) from error
    except (httpx.HTTPError, ValueError) as error:
        raise DouyinOAuthError("DOUYIN_OAUTH_NETWORK_ERROR", str(error), retryable=True) from error
    finally:
        if owns_client:
            await active_client.aclose()


def required(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise DouyinOAuthError("DOUYIN_OAUTH_INPUT_INVALID", f"{key} is required.", retryable=False)
    return value
