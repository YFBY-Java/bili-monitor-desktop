import asyncio
import json
from pathlib import Path

import httpx
import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from bmd_workers import bilibili_live as live

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
FIXTURES = json.loads((CONTRACTS / "fixtures/live-http-configuration.json").read_text("utf-8"))


@pytest.mark.parametrize("fixture", FIXTURES, ids=[f["name"] for f in FIXTURES])
def test_http_worker_configuration_contract(fixture):
    configuration_schema = json.loads(
        (CONTRACTS / "schemas/bilibili-live-collection-configuration.v1.schema.json").read_text(
            "utf-8"
        )
    )
    worker_schema = json.loads(
        (CONTRACTS / "schemas/bilibili-live-worker.v1.schema.json").read_text("utf-8")
    )
    payload = {
        "taskId": "t",
        "attempt": 1,
        "leaseId": "l",
        "roomId": "2",
        "httpConfiguration": fixture["input"],
    }
    assert Draft202012Validator(configuration_schema).is_valid(fixture["input"]) == fixture["valid"]
    assert (
        Draft202012Validator({**worker_schema, "$ref": "#/$defs/RoomRequest"}).is_valid(payload)
        == fixture["valid"]
    )
    if fixture["valid"]:
        live.BilibiliLiveRoomRequest.model_validate(payload)
    else:
        with pytest.raises(ValidationError):
            live.BilibiliLiveRoomRequest.model_validate(payload)


@pytest.mark.parametrize("endpoint", list(live.ENDPOINT_URLS))
@pytest.mark.parametrize("connect,read", [(1200, 2400), (0, 0), (2147483647, 2147483647)])
def test_http_configuration_controls_real_httpx_request(
    monkeypatch, tmp_path, endpoint, connect, read
):
    observed = []

    def respond(request):
        observed.append(request)
        data = {"uid": 2, "room_id": 102, "live_status": 0, "uname": "合成主播"}
        return httpx.Response(
            200,
            json={
                "code": 0,
                "data": {"2": data} if endpoint == live.STATUS_BY_UIDS_ENDPOINT else data,
            },
        )

    original = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(respond)),
    )
    result = asyncio.run(
        live.fetch_live_endpoint(
            endpoint,
            {
                "roomId": "102",
                "uid": "2",
                "uids": ["2"],
                "httpConfiguration": {
                    "connectTimeoutMs": connect,
                    "readTimeoutMs": read,
                    "userAgent": "Local monitor/2",
                    "referer": "https://live.bilibili.com/2",
                },
            },
            tmp_path,
        )
    )
    assert len(observed) == 1
    request = observed[0]
    assert request.extensions["timeout"] == {
        "connect": connect / 1000 or None,
        "read": read / 1000 or None,
        "write": None,
        "pool": None,
    }
    assert request.headers["User-Agent"] == "Local monitor/2"
    assert request.headers["Referer"] == "https://live.bilibili.com/2"
    assert request.headers["Accept"] == "application/json"
    assert str(request.url).startswith(live.ENDPOINT_URLS[endpoint])
    assert "Cookie" not in request.headers and "Authorization" not in request.headers
    assert "合成主播" in (tmp_path / result["evidenceObject"]["relativePath"]).read_text("utf-8")
