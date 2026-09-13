"""TEST ONLY: hold external HTTP after publishing the actual Worker PID, without sockets."""

import asyncio
import json
import os
from pathlib import Path

import httpx


async def pending_response(request):
    assert request.method == "GET" and request.url.host == "api.live.bilibili.com"
    assert request.url.params.get("uids[]") == "903"
    directory = Path(os.environ["BMD_DATA_DIR"])
    assert directory.drive.lower() == "d:"
    (directory / "synthetic-live-pending.json").write_text(
        json.dumps({"pid": os.getpid(), "endpoint": request.url.path}), encoding="utf-8"
    )
    await asyncio.Event().wait()
    raise AssertionError("The isolated pending HTTP response must only end through Worker shutdown")


ORIGINAL_CLIENT = httpx.AsyncClient


def pending_client(**kwargs):
    return ORIGINAL_CLIENT(**kwargs, transport=httpx.MockTransport(pending_response))


httpx.AsyncClient = pending_client
