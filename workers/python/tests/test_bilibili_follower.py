from __future__ import annotations

import importlib
import importlib.util

import pytest


def load_module():
    spec = importlib.util.find_spec("bmd_workers.bilibili_follower")
    assert spec is not None, "Bilibili follower connector module must exist"
    return importlib.import_module("bmd_workers.bilibili_follower")


def test_parses_the_same_public_card_fields_as_original_bilimonitor() -> None:
    module = load_module()
    raw = """
    {
      "code": 0,
      "message": "OK",
      "data": {
        "card": {
          "mid": "2",
          "name": "碧诗",
          "face": "https://i2.hdslb.com/bfs/face/example.jpg",
          "fans": 1395836,
          "attention": 423
        },
        "follower": 1395836
      }
    }
    """

    snapshot = module.parse_card_response(raw, "2026-08-29T12:00:00.000Z")

    assert snapshot == {
        "mid": "2",
        "nickname": "碧诗",
        "avatarUrl": "https://i2.hdslb.com/bfs/face/example.jpg",
        "profileUrl": "https://space.bilibili.com/2",
        "followerCount": 1395836,
        "followingCount": 423,
        "fetchedAt": "2026-08-29T12:00:00.000Z",
        "sourceEndpoint": "x/web-interface/card",
    }


def test_rejects_a_success_response_without_follower_count() -> None:
    module = load_module()
    raw = '{"code":0,"data":{"card":{"mid":"2","name":"碧诗"}}}'

    with pytest.raises(module.BilibiliCrawlerError) as raised:
        module.parse_card_response(raw, "2026-08-29T12:00:00.000Z")

    assert raised.value.code == "BILIBILI_PARSE_ERROR"
    assert raised.value.retryable is False
