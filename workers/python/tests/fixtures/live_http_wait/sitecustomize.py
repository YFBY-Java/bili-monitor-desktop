"""An actual async HTTPX boundary with a slow response or cancellable pending request."""

import asyncio
import os
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "src"))
original_client = httpx.AsyncClient


async def replay(request):
    directory = Path(os.environ["BMD_DATA_DIR"])
    (directory / "http-started").write_text("started", encoding="utf-8")
    complete = False
    try:
        identifier = request.url.params.get(
            "ruid",
            request.url.params.get(
                "room_id", request.url.params.get("mid", request.url.params.get("vmid"))
            ),
        )
        if identifier == "3":
            await asyncio.Event().wait()
        else:
            await asyncio.sleep(8)
        complete = True
        return httpx.Response(
            200,
            json={
                "code": 0,
                "data": {
                    "mid": 2,
                    "follower": 20,
                    "card": {"mid": "2", "name": "合成长请求粉丝"},
                    "uid": 2,
                    "room_id": 102,
                    "live_status": 0,
                    "info": {"num": 1},
                    "list": [{"uinfo": {"uid": 9, "base": {"name": "合成长请求观众"}}}],
                },
            },
        )
    finally:
        if not complete:
            (directory / "http-cancelled").write_text("cancelled", encoding="utf-8")


httpx.AsyncClient = lambda **kwargs: original_client(
    **kwargs, transport=httpx.MockTransport(replay)
)
