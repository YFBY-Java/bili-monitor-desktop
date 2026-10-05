"""Synthetic rank network boundary; production Core, HTTPX and parsers remain real."""

import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "src"))
original_client = httpx.AsyncClient


def replay(request):
    assert request.url.host in {"api.bilibili.com", "api.live.bilibili.com"}
    assert request.headers["User-Agent"] == "Fixture rank configuration/2"
    assert request.headers["Referer"] == (
        "https://www.bilibili.com/"
        if request.url.path.endswith("/nav")
        else "https://live.bilibili.com/configured-rank"
    )
    assert request.extensions["timeout"] == {
        "connect": 1.25,
        "read": None,
        "write": None,
        "pool": None,
    }
    if request.url.path.endswith("/nav"):
        data = {
            "wbi_img": {
                "img_url": "https://i0.hdslb.com/" + "a" * 32 + ".png",
                "sub_url": "https://i0.hdslb.com/" + "b" * 32 + ".png",
            }
        }
    elif "/rank/" in request.url.path or "/guardTab/" in request.url.path:
        if (
            request.url.path.endswith("queryContributionRank")
            and request.url.params.get("ruid") == "3"
        ):
            return httpx.Response(500, json={"code": 500})
        data = {
            "count": 1,
            "onlineNum": 1,
            "info": {"num": 1},
            "item": [{"uid": 9, "name": "合成配置榜单观众"}],
            "OnlineRankItem": [{"uid": 9, "name": "合成配置榜单观众"}],
            "list": [{"uinfo": {"uid": 9, "base": {"name": "合成配置榜单观众"}}}],
        }
    else:
        uid = request.url.params.get("uids[]", "2")
        data = {
            "uid": int(uid),
            "room_id": 100 + int(uid),
            "live_status": 0,
            "uname": "合成配置主播",
        }
        if request.url.path.endswith("get_status_info_by_uids"):
            data = {uid: data}
    return httpx.Response(200, json={"code": 0, "data": data})


httpx.AsyncClient = lambda **kwargs: original_client(
    **kwargs, transport=httpx.MockTransport(replay)
)
