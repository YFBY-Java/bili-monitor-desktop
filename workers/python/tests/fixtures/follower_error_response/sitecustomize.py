"""Replace only network I/O; actual follower parser/runtime remain unchanged."""

import json
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
    if mid in {"70", "71", "72"}:
        rejected = mid != "70" or calls[mid] == 2
        follower = 20 if calls[mid] == 1 and mid == "70" else 50 if rejected else 60
        extra = '"\\u0000"' if rejected else '"\\\\u0000"'
        raw = (
            '{"code":0,"data":{"card":{"mid":"'
            + mid
            + '","name":"raw-json-'
            + str(follower)
            + '"},"follower":'
            + str(follower)
            + '},"unused":'
            + extra
            + "}"
        )
        return httpx.Response(
            200, content=raw.encode("ascii"), headers={"Content-Type": "application/json"}
        )
    if mid == "50":
        return httpx.Response(200, json={"code": " -352 ", "message": "  合成风控  "})
    if calls[mid] > 1:
        if mid == "2":
            return httpx.Response(200, json={"code": "500", "message": "  合成API错误  "})
        if mid == "3":
            return httpx.Response(200, json={"code": " -101 ", "message": "合成登录过期"})
        if mid == "4":
            if calls[mid] == 2:
                return httpx.Response(
                    503, content=b"synthetic", headers={"Content-Type": "application/json;charset="}
                )
            if calls[mid] == 3:
                return httpx.Response(
                    200,
                    content=b"",
                    headers={"Content-Type": "application/json;charset=no-such-charset"},
                )
            return httpx.Response(503, json={"code": 0})
        if mid == "5":
            return httpx.Response(403, json={"code": 0})
        if mid == "60":
            message = "\ud800🙂\\u0000" if calls[mid] == 2 else "synthetic\u0000failure"
            return httpx.Response(
                200,
                content=json.dumps({"code": -101, "message": message}, ensure_ascii=True).encode(
                    "ascii"
                ),
                headers={"Content-Type": "application/json"},
            )
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
