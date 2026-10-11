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
LONG64_STATUS_CALLS = 0
ENCODING_INFO_CALLS = 0
RAW_STATUS_CALLS = {}


def replay(request):
    global LONG64_STATUS_CALLS, ENCODING_INFO_CALLS
    assert request.method == "GET" and request.url.host == "api.live.bilibili.com"
    assert (
        request.headers["User-Agent"]
        == "SocialDataMonitor/0.1 (+low-frequency public Bilibili live monitor)"
    )
    raw_uid = request.url.params.get("uids[]")
    if raw_uid in ("122", "123"):
        RAW_STATUS_CALLS[raw_uid] = RAW_STATUS_CALLS.get(raw_uid, 0) + 1
        call = RAW_STATUS_CALLS[raw_uid]
        invalid = raw_uid == "123" or call == 2
        item = {
            "uid": int(raw_uid),
            "room_id": int(raw_uid) + 100,
            "uname": "synthetic raw snapshot host",
            "live_status": 0 if call == 1 else 1,
            "title": f"raw snapshot {call}",
            "online": call * 10,
        }
        raw = json.dumps({"code": 0, "data": {raw_uid: item}})
        if invalid:
            raw = raw[:-1] + ',"unused":{"old":"\\u0000","old":"valid"}}'
        return httpx.Response(200, content=raw.encode("utf-8"))
    if request.url.params.get("room_id") in ("222", "223"):
        room_id = int(request.url.params["room_id"])
        raw = json.dumps({"code": 0, "data": {"uid": room_id - 100, "room_id": room_id}})
        # Only the primary status raw payload is persisted by the original merge.
        if room_id == 222:
            raw = raw[:-1] + ',"unused":"\\u0000"}'
        return httpx.Response(200, content=raw.encode("utf-8"))
    if request.url.params.get("uids[]") == "121":
        return httpx.Response(
            200,
            headers={"Content-Type": "application/json;charset=ISO-8859-1"},
            content=json.dumps(
                {
                    "code": 0,
                    "data": {
                        "121": {
                            "uid": 121,
                            "room_id": 221,
                            "uname": " caféhost ",
                            "live_status": 1,
                            "title": " café live ",
                            "online": 12,
                        }
                    },
                },
                ensure_ascii=False,
            ).encode("iso-8859-1"),
        )
    if request.url.params.get("room_id") == "221":
        ENCODING_INFO_CALLS += 1
        if ENCODING_INFO_CALLS > 1:
            return httpx.Response(
                503,
                content=b"private upstream response",
                headers={"Content-Type": "application/json;charset=not-a-real-charset"},
            )
        return httpx.Response(
            200,
            json={"code": 0, "data": {"uid": 121, "room_id": 221, "live_status": 1, "online": 12}},
        )
    if request.url.params.get("uids[]") == "119":
        LONG64_STATUS_CALLS += 1
        online = 9007199254740992 if LONG64_STATUS_CALLS == 1 else 9007199254740993
        return httpx.Response(
            200,
            headers={"Content-Type": "application/json"},
            content=json.dumps(
                {
                    "code": 0,
                    "data": {
                        "119": {
                            "uid": 119,
                            "room_id": 219,
                            "uname": " 合成精确直播主播 ",
                            "live_status": 1,
                            "title": f"精确直播 {LONG64_STATUS_CALLS}",
                            "online": online,
                            "attention": 9223372036854775808,
                        }
                    },
                },
                ensure_ascii=False,
            ).encode("utf-8"),
        )
    if request.url.params.get("room_id") == "219":
        return httpx.Response(
            200,
            headers={"Content-Type": "application/json"},
            content=b'{"code":0,"data":{"uid":119,"room_id":219,"live_status":1,"online":0}}',
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
    if request.url.params.get("mid") == "903":
        return httpx.Response(200, json={"code": 0, "data": {"roomStatus": 1}})
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
                200,
                headers={"Content-Type": "application/json"},
                content=json.dumps(fixture["body"], ensure_ascii=False).encode("utf-8"),
            )
    raise AssertionError("Unexpected HTTP request in isolated live Worker replay")


ORIGINAL_CLIENT = httpx.AsyncClient


def replay_client(**kwargs):
    return ORIGINAL_CLIENT(**kwargs, transport=httpx.MockTransport(replay))


httpx.AsyncClient = replay_client
