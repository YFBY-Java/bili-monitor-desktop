"""Test-only HTTP transport, using the actual runtime and parser without platform traffic."""

import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "src"))
original = httpx.AsyncClient


def replay(request):
    assert request.url.host == "api.live.bilibili.com"
    assert request.headers["User-Agent"] == "Fixture local monitor/2"
    assert request.headers["Referer"] == "https://live.bilibili.com/2"
    assert request.extensions["timeout"] == {
        "connect": 1.2,
        "read": None,
        "write": None,
        "pool": None,
    }
    data = {"uid": 2, "room_id": 102, "live_status": 0, "uname": "合成HTTP配置主播"}
    if request.url.path.endswith("get_status_info_by_uids"):
        data = {"2": data}
    return httpx.Response(200, json={"code": 0, "data": data})


httpx.AsyncClient = lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(replay))
