"""Synthetic network only: actual Core, Worker, HTTPX, parsers and SQLite are used."""

import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "src"))
original_client = httpx.AsyncClient
card_calls = 0


def replay(request):
    global card_calls
    assert request.url.host == "api.bilibili.com"
    assert request.headers["User-Agent"] == "Fixture follower/2"
    assert request.headers["Referer"] == "https://www.bilibili.com/configured-follower"
    assert request.extensions["timeout"] == {
        "connect": 1.25,
        "read": None,
        "write": None,
        "pool": None,
    }
    if request.url.path == "/x/web-interface/card":
        assert request.url.params["photo"] == "true"
        mid = request.url.params["mid"]
        card_calls += 1
        if mid == "2" and card_calls > 1:
            return httpx.Response(500, json={"code": 500})
        data = {"card": {"mid": mid, "name": "合成HTTP粉丝", "attention": 3}, "follower": 20}
    else:
        assert request.url.path == "/x/relation/stat"
        data = {"mid": request.url.params["vmid"], "follower": 30, "following": 4}
    return httpx.Response(200, json={"code": 0, "data": data})


httpx.AsyncClient = lambda **kwargs: original_client(
    **kwargs, transport=httpx.MockTransport(replay)
)
