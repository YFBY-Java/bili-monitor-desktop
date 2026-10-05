"""Replace only network I/O; actual follower parser/runtime remain unchanged."""

import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "src"))
original_client = httpx.AsyncClient
calls: dict[str, int] = {}


def replay(request):
    assert request.url.host == "api.bilibili.com"
    if request.url.path == "/x/relation/stat":
        return httpx.Response(
            200, json={"code": "0", "data": {"mid": request.url.params["vmid"], "follower": 30}}
        )
    assert request.url.path == "/x/web-interface/card"
    assert request.url.params["photo"] == "true"
    mid = request.url.params["mid"]
    calls[mid] = calls.get(mid, 0) + 1
    if mid == "50":
        return httpx.Response(200, json={"code": " -352 ", "message": "  合成风控  "})
    if calls[mid] > 1:
        if mid == "2":
            return httpx.Response(200, json={"code": "500", "message": "  合成API错误  "})
        if mid == "3":
            return httpx.Response(200, json={"code": " -101 ", "message": "合成登录过期"})
        if mid == "4":
            return httpx.Response(503, json={"code": 0})
        if mid == "5":
            return httpx.Response(403, json={"code": 0})
    return httpx.Response(
        200,
        json={
            "code": "0",
            "data": {"card": {"mid": mid, "name": f"合成返回码用户{mid}"}, "follower": 20},
        },
    )


httpx.AsyncClient = lambda **kwargs: original_client(
    **kwargs, transport=httpx.MockTransport(replay)
)
