from __future__ import annotations

import json

from bmd_workers import bilibili_rank


def test_parses_audience_rank_without_guessing_missing_uid() -> None:
    parsed = bilibili_rank.parse_audience_rank_response(
        json.dumps(
            {
                "code": 0,
                "data": {
                    "count": 2,
                    "count_text": "2 人",
                    "config": {"value_text": "贡献值", "title": "在线贡献榜"},
                    "item": [
                        {
                            "uid": 99,
                            "rank": 1,
                            "name": "Alice",
                            "face": "https://i0.hdslb.com/bfs/face/alice.jpg",
                            "score": 120,
                            "medal_info": {"medal_name": "舰长", "medal_level": 12},
                        },
                        {"rank": 2, "name": "匿名观众", "score": 80},
                    ],
                },
            },
            ensure_ascii=False,
        ),
        rank_type="online_rank",
        rank_switch="contribution_rank",
        period_scope="REALTIME",
        page=1,
        page_size=50,
        endpoint=bilibili_rank.AUDIENCE_RANK_ENDPOINT,
        signed_required=True,
        captured_at="2026-08-29T12:00:00.000Z",
    )

    assert parsed["rankFamily"] == "AUDIENCE"
    assert parsed["totalCount"] == 2
    assert parsed["entries"][0]["userUid"] == "99"
    assert "userUid" not in parsed["entries"][1]


def test_parses_guard_top3_list_and_accompany_fields() -> None:
    parsed = bilibili_rank.parse_guard_rank_response(
        json.dumps(
            {
                "code": 0,
                "data": {
                    "info": {"num": 1, "num_text": "1 位"},
                    "top3": [
                        {
                            "rank": 1,
                            "accompany": 88,
                            "uinfo": {
                                "uid": 77,
                                "base": {"name": "Captain"},
                                "guard": {"level": 3, "expired_str": "2026-09-01"},
                            },
                        }
                    ],
                    "list": [],
                    "extop": [],
                },
            },
            ensure_ascii=False,
        ),
        rank_type="guard_accompany",
        period_scope="CURRENT",
        page=1,
        page_size=30,
        captured_at="2026-08-29T12:00:00.000Z",
    )

    assert parsed["rankFamily"] == "GUARD"
    assert parsed["entries"] == [
        {
            "userUid": "77",
            "rankNo": 1,
            "entryKind": "TOP3",
            "displayName": "Captain",
            "guardLevel": 3,
            "guardExpiredText": "2026-09-01",
            "accompanyDays": 88,
        }
    ]


def test_wbi_signing_is_stable_for_fixed_keys_and_timestamp() -> None:
    signed = bilibili_rank.sign_wbi_params(
        {
            "room_id": "33",
            "ruid": "22",
            "type": "online_rank",
            "switch": "contribution_rank",
        },
        img_key="7cd084941338484aae1ad9425b84077c",
        sub_key="4932caff0ff746eab6f01bf08b70ac45",
        timestamp=1700000000,
    )

    assert signed["wts"] == "1700000000"
    assert len(signed["w_rid"]) == 32
    assert signed == bilibili_rank.sign_wbi_params(
        {
            "room_id": "33",
            "ruid": "22",
            "type": "online_rank",
            "switch": "contribution_rank",
        },
        img_key="7cd084941338484aae1ad9425b84077c",
        sub_key="4932caff0ff746eab6f01bf08b70ac45",
        timestamp=1700000000,
    )
