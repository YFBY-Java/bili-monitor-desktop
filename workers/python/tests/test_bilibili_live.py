from __future__ import annotations

import json

import pytest

from bmd_workers import bilibili_live


def test_parses_original_batched_live_status_fields() -> None:
    raw = json.dumps(
        {
            "code": 0,
            "data": {
                "22": {
                    "uid": 22,
                    "room_id": 33,
                    "short_id": 3,
                    "uname": "anchor",
                    "face": "https://i0.hdslb.com/bfs/face/anchor.jpg",
                    "title": "直播标题",
                    "cover_from_user": "https://i0.hdslb.com/bfs/live/cover.jpg",
                    "keyframe": "https://i0.hdslb.com/bfs/live/keyframe.jpg",
                    "area_v2_id": 86,
                    "area_v2_name": "单机游戏",
                    "area_v2_parent_id": 2,
                    "area_v2_parent_name": "游戏",
                    "live_status": 1,
                    "live_time": "2026-08-29 20:00:00",
                    "online": 1234,
                    "attention": 5678,
                }
            },
        },
        ensure_ascii=False,
    )

    snapshots = bilibili_live.parse_status_by_uids_response(raw, "2026-08-29T12:00:01.000Z")

    assert snapshots == [
        {
            "uid": "22",
            "roomId": "33",
            "shortId": "3",
            "uname": "anchor",
            "faceUrl": "https://i0.hdslb.com/bfs/face/anchor.jpg",
            "title": "直播标题",
            "coverUrl": "https://i0.hdslb.com/bfs/live/cover.jpg",
            "keyframeUrl": "https://i0.hdslb.com/bfs/live/keyframe.jpg",
            "areaId": "86",
            "areaName": "单机游戏",
            "parentAreaId": "2",
            "parentAreaName": "游戏",
            "liveStatus": 1,
            "liveTime": "2026-08-29T12:00:00Z",
            "onlineCount": 1234,
            "attentionCount": 5678,
        }
    ]


def test_room_init_resolves_the_real_long_room_id() -> None:
    snapshot = bilibili_live.parse_room_init_response(
        '{"code":0,"data":{"uid":22,"room_id":330033,"short_id":33,"live_status":0}}',
        "2026-08-29T12:00:00.000Z",
    )

    assert snapshot == {
        "uid": "22",
        "roomId": "330033",
        "shortId": "33",
        "uname": "UID 22",
        "liveStatus": 0,
    }


def test_old_room_info_returns_none_when_uid_has_no_public_live_room() -> None:
    snapshot = bilibili_live.parse_room_info_old_response(
        '{"code":0,"data":{"roomStatus":0}}',
        "22",
        "2026-08-29T12:00:00.000Z",
    )
    assert snapshot is None


def test_rejects_live_status_without_room_id() -> None:
    with pytest.raises(bilibili_live.BilibiliCrawlerError) as raised:
        bilibili_live.parse_status_by_uids_response(
            '{"code":0,"data":{"22":{"uid":22,"live_status":1}}}',
            "2026-08-29T12:00:00.000Z",
        )

    assert raised.value.code == "BILIBILI_PARSE_ERROR"
