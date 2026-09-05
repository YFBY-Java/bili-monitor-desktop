from __future__ import annotations

import httpx
import pytest

from bmd_workers.douyin_oauth import request_oauth


@pytest.mark.asyncio
async def test_posts_original_douyin_oauth_form_and_preserves_raw_response() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/oauth/access_token/"
        assert b"client_key=key" in await request.aread()
        return httpx.Response(
            200, json={"data": {"access_token": "secret", "error_code": 0, "future": "keep"}}
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), base_url="https://open.douyin.com"
    ) as client:
        result = await request_oauth(
            "exchange", {"clientKey": "key", "clientSecret": "value", "code": "code"}, client=client
        )

    assert result["data"]["future"] == "keep"
