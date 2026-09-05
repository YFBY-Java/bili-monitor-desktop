from __future__ import annotations

import importlib
import importlib.util

import pytest


def load_module():
    spec = importlib.util.find_spec("bmd_workers.bilibili_auth")
    assert spec is not None, "Bilibili auth worker module must exist"
    return importlib.import_module("bmd_workers.bilibili_auth")


def test_parses_qr_generate_and_the_original_poll_states() -> None:
    module = load_module()
    generated = module.parse_qr_generate_response(
        '{"code":0,"data":{"url":"https://passport.bilibili.com/scan?qrcode_key=key","qrcode_key":"key"}}',
        [],
    )
    assert generated == {
        "qrUrl": "https://passport.bilibili.com/scan?qrcode_key=key",
        "qrcodeKey": "key",
        "cookies": [],
    }

    waiting = module.parse_qr_poll_response(
        '{"code":0,"data":{"code":86101,"message":"未扫码"}}',
        [],
    )
    scanned = module.parse_qr_poll_response(
        '{"code":0,"data":{"code":86090,"message":"已扫码"}}',
        [],
    )
    expired = module.parse_qr_poll_response(
        '{"code":0,"data":{"code":86038,"message":"已失效"}}',
        [],
    )
    assert waiting["code"] == 86101
    assert scanned["code"] == 86090
    assert expired["code"] == 86038


def test_merges_success_cookies_from_response_and_cross_domain_url() -> None:
    module = load_module()
    result = module.parse_qr_poll_response(
        """
        {
          "code": 0,
          "data": {
            "code": 0,
            "message": "",
            "refresh_token": "refresh-secret",
            "url": "https://passport.bilibili.com/callback?DedeUserID=99&bili_jct=csrf-secret&SESSDATA=session-secret&Expires=1798761600"
          }
        }
        """,
        [
            {
                "name": "sid",
                "value": "sid-secret",
                "domain": ".bilibili.com",
                "path": "/",
                "secure": True,
            }
        ],
    )

    assert result["code"] == 0
    assert result["refreshToken"] == "refresh-secret"
    assert [cookie["name"] for cookie in result["cookies"]] == [
        "SESSDATA",
        "bili_jct",
        "DedeUserID",
        "sid",
    ]
    assert result["cookies"][0]["value"] == "session-secret"
    assert result["cookies"][0]["expiresAt"].startswith("2027-")


def test_validates_nav_and_rejects_a_logged_out_credential() -> None:
    module = load_module()
    nav = module.parse_nav_response("""
        {
          "code": 0,
          "data": {
            "isLogin": true,
            "mid": 99,
            "uname": "Alice",
            "face": "https://i0.hdslb.com/bfs/face/alice.jpg",
            "level_info": {"current_level": 6},
            "vipStatus": 0
          }
        }
        """)
    assert nav["account"] == {
        "mid": "99",
        "uname": "Alice",
        "face": "https://i0.hdslb.com/bfs/face/alice.jpg",
        "level": 6,
        "vipStatus": 0,
    }
    assert nav["rawPayload"]["code"] == 0

    with pytest.raises(module.BilibiliAuthError) as raised:
        module.parse_nav_response('{"code":-101,"data":{"isLogin":false}}')
    assert raised.value.code == "BILIBILI_AUTH_EXPIRED"
    assert raised.value.retryable is False
