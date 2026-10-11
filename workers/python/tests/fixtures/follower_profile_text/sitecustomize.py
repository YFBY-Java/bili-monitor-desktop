"""Offline profile responses; production parser, Worker and evidence path are real."""

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
            200, json={"code": 0, "data": {"mid": request.url.params["vmid"], "follower": 30}}
        )
    assert request.url.path == "/x/web-interface/card"
    assert request.url.params["photo"] == "true"
    mid = request.url.params["mid"]
    calls[mid] = calls.get(mid, 0) + 1
    if mid == "14":
        body = (
            '{"code":0,"data":{"card":{"mid":"14","name":1e7,"face":-0.0},"follower":21}}'
            if calls[mid] == 1
            else '{"code":-101,"message":0.0001}'
        )
        return httpx.Response(200, text=body)
    name = {
        "2": "  合成昵称\t ",
        "3": "\u00a0",
        "4": "🌸" * 160,
        "5": "名" * 161,
        "6": "名" * 160 + "   ",
        "9": False,
        "10": 12,
    }.get(mid, "  初始昵称  ")
    face = "//example.invalid/synthetic.jpg"
    if mid == "8":
        face = "not-a-url"
    if mid == "9":
        face = False
    if calls[mid] > 1:
        if mid == "7":
            face = []
        if mid == "11":
            name, face = "  更新昵称  ", "  https://example.invalid/new.jpg  "
        if mid == "12":
            name = {}
        if mid == "13":
            name = "名" * 161
        if mid == "15":
            name = "private\0nickname"
    return httpx.Response(
        200,
        json={
            "code": 0,
            "data": {"card": {"mid": mid, "name": name, "face": face}, "follower": 20 + calls[mid]},
        },
    )


httpx.AsyncClient = lambda **kwargs: original_client(
    **kwargs, transport=httpx.MockTransport(replay)
)
