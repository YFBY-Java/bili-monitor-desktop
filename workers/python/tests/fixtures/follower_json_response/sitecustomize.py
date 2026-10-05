"""Only synthetic HTTP I/O; actual crawler parser, NDJSON and Core are exercised."""

import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "src"))
original_client = httpx.AsyncClient
calls: dict[str, int] = {}


def card(mid: str, count: int) -> bytes:
    return json.dumps(
        {
            "code": 0,
            "data": {"card": {"mid": mid, "name": f"合成JSON用户{mid}"}, "follower": count},
        },
        ensure_ascii=False,
    ).encode("utf-8")


def replay(request: httpx.Request) -> httpx.Response:
    assert request.url.host == "api.bilibili.com"
    if request.url.path == "/x/relation/stat":
        mid = request.url.params["vmid"]
        raw = (
            b"[]"
            if mid == "219"
            else json.dumps({"code": 0, "data": {"mid": mid, "follower": 30}}).encode()
        )
        return httpx.Response(200, content=raw, headers={"Content-Type": "application/json"})
    assert request.url.path == "/x/web-interface/card"
    assert request.url.params["photo"] == "true"
    mid = request.url.params["mid"]
    calls[mid] = calls.get(mid, 0) + 1
    raw = card(mid, 12)
    if calls[mid] == 2:
        raw = {
            "201": b"null",
            "202": b"[0]",
            "203": b"",
            "204": b" \t\r\n",
            "205": b'{"code":0,"data":',
            "206": card(mid, 24) + b" trailing-synthetic-json " + b"9" * 2001,
            "207": b'{"code":0,"unused":NaN}',
            "208": b'{"code":0,"unused":' + b"9" * 1001 + b"}",
            "209": b'"scalar"ignored',
            "210": b'{"code":-101,"unused":' + b"[" * 999 + b"0" + b"]" * 999 + b"}",
            "212": b'{"code":-101,"message":"\xff"}',
            "213": b'{"code":-101,"code":0,"data":'
            + json.dumps(
                {"card": {"mid": mid, "name": f"合成JSON用户{mid}"}, "follower": 24},
                ensure_ascii=False,
            ).encode("utf-8")
            + b"}",
            "214": b"{}ignored" + b"9" * 4301,
            "215": b'{"code":0,"' + b"x" * 50001 + b'":0}',
            "216": b'{"code":0,"unused":' + b"[" * 1000 + b"0" + b"]" * 1000 + b"}",
            "217": b'\xef\xbb\xbf{"code":0}',
            "219": b"{",
            "220": b'{"code":-101,"message":"\\ud800"}',
            "221": b'{"code":-101,"message":"\\udfff"}',
            "222": b'{"code":0,"data":{"card":{"mid":"222","name":"\\ud800"},"follower":24}}',
            "223": b'{"code":0,"data":{"card":{"mid":"223","name":"\\udfff"},"follower":24}}',
            "224": ("true\u0cf3").encode("utf-8"),
            "225": ("null\u0ece").encode("utf-8"),
        }.get(mid, raw)
    if mid in {"220", "221", "222", "223"} and calls[mid] == 3:
        # A restarted process would return its ordinary first-call nickname,
        # so this marker proves the next result came from the original Worker.
        raw = json.dumps(
            {
                "code": 0,
                "data": {"card": {"mid": mid, "name": "same-process-third"}, "follower": 12},
            }
        ).encode("ascii")
    return httpx.Response(200, content=raw, headers={"Content-Type": "application/json"})


httpx.AsyncClient = lambda **options: original_client(
    **options, transport=httpx.MockTransport(replay)
)
