"""Synthetic HTTP only; the real Worker/parser/CAS/stdio remains in use."""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "src"))
import bmd_workers.bilibili_follower as follower  # noqa: E402

original_client = httpx.AsyncClient
calls: dict[str, int] = {}
requests = 0
tokens = {
    "241": ["9223372036854775807", "-9223372036854775808"],
    "242": ["9007199254740992", "9007199254740993"],
    "243": ["9223372036854775808", "9223372036854775807"],
    "244": ["18446744073709551616", "18446744073709551615"],
    "245": ["1e309", "-1e309"],
    "246": [
        '"+000９２２３３７２０３６８５４７７５８０７"',
        '"-000９２２３３７２０３６８５４７７５８０８"',
    ],
    "248": ["9007199254740993", "9007199254740994"],
}


class FixtureDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        value = datetime(2026, 10, 5, 12, tzinfo=timezone.utc) + timedelta(seconds=requests)
        return value if tz is None else value.astimezone(tz)


def replay(request: httpx.Request) -> httpx.Response:
    global requests
    requests += 1
    assert request.url.host == "api.bilibili.com"
    if request.url.path == "/x/relation/stat":
        assert request.url.params["vmid"] == "241"
        raw = b'{"code":0,"data":{"mid":"-9223372036854775808","follower":9007199254740993}}'
    else:
        assert request.url.path == "/x/web-interface/card"
        assert request.url.params["photo"] == "true"
        mid = request.url.params["mid"]
        calls[mid] = calls.get(mid, 0) + 1
        index = calls[mid] - 1
        if mid == "241" and index == 2:
            raw = b'{"code":0,"data":{"card":{"mid":"241","name":"Synthetic"}}}'
        elif mid == "248" and index == 1:
            raw = b'{"code":-101,"message":"Synthetic auth error"}'
        else:
            values = tokens.get(mid, ["9223372036854775807"])
            count = values[min(index, len(values) - 1)]
            response_mid = "0" if mid == "241" and index == 1 else mid
            card = {
                "mid": response_mid,
                "name": "合成精确链路用户",
                "attention": "-9223372036854775808",
            }
            raw = (
                '{"code":0,"data":{"card":'
                + json.dumps(card, ensure_ascii=False)
                + ',"follower":'
                + count
                + "}}"
            ).encode("utf-8")
    return httpx.Response(200, content=raw, headers={"Content-Type": "application/json"})


follower.datetime = FixtureDatetime
httpx.AsyncClient = lambda **kwargs: original_client(
    **kwargs, transport=httpx.MockTransport(replay)
)
