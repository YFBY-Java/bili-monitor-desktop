"""TEST ONLY: real Worker runtime + HTTP replay, no sockets or production test flag."""

import json
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[5]
FIXTURES = json.loads(
    (ROOT / "packages/contracts/fixtures/live-worker-responses.json").read_text("utf-8")
)
METHODS = {
    "status": "room/v1/Room/get_status_info_by_uids",
    "init": "room/v1/Room/room_init",
    "info": "room/v1/Room/get_info",
    "old": "room/v1/Room/getRoomInfoOld",
}


def replay(request):
    assert request.method == "GET" and request.url.host == "api.live.bilibili.com"
    assert (
        request.headers["User-Agent"]
        == "SocialDataMonitor/0.1 (+low-frequency public Bilibili live monitor)"
    )
    if request.url.path == "/" + METHODS["status"] and request.url.params.get("uids[]") == "2000":
        uids = request.url.params.get_list("uids[]")
        assert uids == [str(2000 + i) for i in range(75)]
        return httpx.Response(
            200,
            json={
                "code": 0,
                "data": {
                    uid: {"uid": int(uid), "room_id": int(uid) + 100, "live_status": 1, "online": i}
                    for i, uid in enumerate(uids)
                },
            },
        )
    if request.url.params.get("mid") == "901":
        return httpx.Response(200, content=b'{"code":0,"data":"\xff"}')
    if request.url.params.get("mid") == "902":
        return httpx.Response(200, json={"code": 0, "data": {"roomid": 902, "cover": "not-a-url"}})
    for fixture in FIXTURES:
        method = fixture["method"]
        if request.url.path != "/" + METHODS[method]:
            continue
        payload = fixture["request"]
        params = (
            [("uids[]", uid) for uid in payload["uids"]]
            if method == "status"
            else [
                (
                    "id" if method == "init" else "room_id" if method == "info" else "mid",
                    payload["uid" if method == "old" else "roomId"],
                )
            ]
        )
        if request.url.params.multi_items() == params:
            return httpx.Response(
                200, content=json.dumps(fixture["body"], ensure_ascii=False).encode("utf-8")
            )
    raise AssertionError("Unexpected HTTP request in isolated live Worker replay")


ORIGINAL_CLIENT = httpx.AsyncClient


def replay_client(**kwargs):
    return ORIGINAL_CLIENT(**kwargs, transport=httpx.MockTransport(replay))


httpx.AsyncClient = replay_client
