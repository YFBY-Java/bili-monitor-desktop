import asyncio
import io
import json
from pathlib import Path

import httpx
import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from bmd_workers import bilibili_follower
from bmd_workers.bilibili_follower import BilibiliFollowerFetchRequest, BilibiliFollowerProfile
from bmd_workers.protocol import RuntimeEnvelope
from bmd_workers.request_lifetime import handle_with_liveness
from bmd_workers.runtime import WorkerRuntime

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
FIXTURES = json.loads((CONTRACTS / "fixtures/follower-http-configuration.json").read_text("utf-8"))


def request(message_type="bilibili.follower.fetch-card", extra=None):
    return RuntimeEnvelope.model_validate(
        {
            "id": "follower-http",
            "type": message_type,
            "version": 1,
            "timestamp": "2026-09-26T00:00:00Z",
            "correlationId": "c",
            "traceId": "t",
            "keepAlive": True,
            "payload": {"taskId": "t", "leaseId": "l", "attempt": 1, "mid": "2", **(extra or {})},
        }
    )


@pytest.mark.parametrize("fixture", FIXTURES, ids=[item["name"] for item in FIXTURES])
def test_shared_follower_http_contract(fixture):
    payload = request(extra=fixture["input"]).payload
    if fixture["valid"]:
        BilibiliFollowerFetchRequest.model_validate(payload)
    else:
        with pytest.raises(ValidationError):
            BilibiliFollowerFetchRequest.model_validate(payload)
    schema = json.loads((CONTRACTS / "schemas/bilibili-follower.v1.schema.json").read_text("utf-8"))
    schema["$ref"] = "#/$defs/BilibiliFollowerFetchRequest"
    assert Draft202012Validator(schema).is_valid(payload) == fixture["valid"]


@pytest.mark.parametrize(
    "message_type", ["bilibili.follower.fetch-card", "bilibili.follower.fetch-relation-stat"]
)
@pytest.mark.parametrize("configured", [False, True])
def test_runtime_passes_original_or_configured_http_settings_to_both_endpoints(
    tmp_path, monkeypatch, message_type, configured
):
    captured = []

    class Client:
        def __init__(self, **kwargs):
            captured.append(kwargs)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, params):
            captured[-1]["url"] = url
            captured[-1]["params"] = params
            return httpx.Response(
                200,
                json={
                    "code": 0,
                    "data": {
                        "mid": 2,
                        "follower": 20,
                        "following": 3,
                        "card": {"mid": "2", "name": "合成HTTP粉丝", "attention": 3},
                    },
                },
            )

    monkeypatch.setattr(bilibili_follower.httpx, "AsyncClient", Client)
    configuration = {
        "connectTimeoutMs": 1250,
        "readTimeoutMs": 0,
        "userAgent": "Fixture follower/2",
        "referer": "https://www.bilibili.com/configured-follower",
    }
    response = asyncio.run(
        WorkerRuntime(role="crawler", data_directory=tmp_path).handle(
            request(message_type, {"httpConfiguration": configuration} if configured else {})
        )
    )
    assert response.type == message_type + ".result"
    assert response.payload["followerCount"] == 20
    actual = captured[0]
    assert actual["timeout"].connect == (1.25 if configured else 5)
    assert actual["timeout"].read == (None if configured else 10)
    assert actual["timeout"].write is None
    assert actual["timeout"].pool is None
    assert actual["headers"]["User-Agent"] == (
        configuration["userAgent"]
        if configured
        else "SocialDataMonitor/0.1 (+low-frequency public Bilibili follower monitor)"
    )
    assert actual["headers"]["Referer"] == (
        configuration["referer"] if configured else "https://www.bilibili.com/"
    )
    assert actual["params"] == (
        {"mid": "2", "photo": "true"} if message_type.endswith("fetch-card") else {"vmid": "2"}
    )
    assert list((tmp_path / "cas").rglob("*.json"))


@pytest.mark.parametrize(
    "message_type",
    [
        "bilibili.follower.fetch-card",
        "bilibili.follower.fetch-relation-stat",
        "bilibili.follower.fetch-profile",
    ],
)
def test_follower_opt_in_liveness_is_not_a_business_result(message_type):
    async def scenario():
        observed = asyncio.Event()

        class Output(io.StringIO):
            def write(self, text):
                result = super().write(text)
                observed.set()
                return result

        output = Output()
        message = request(message_type)

        async def operation():
            await asyncio.wait_for(observed.wait(), 0.25)
            return RuntimeEnvelope.create(
                message_id=message.id,
                message_type="worker.error",
                payload={"code": "SYNTHETIC_FAILED", "message": "fixture", "retryable": False},
                correlation_id=message.correlation_id,
                trace_id=message.trace_id,
            )

        result = await handle_with_liveness(message, operation(), output)
        assert result.type == "worker.error"
        frames = [json.loads(line) for line in output.getvalue().splitlines()]
        assert frames[0]["type"] == "worker.request-alive"
        assert frames[0]["payload"] == {"requestType": message_type}
        assert frames[0]["id"] == message.id

    asyncio.run(scenario())


PROFILE_FIXTURES = json.loads((CONTRACTS / "fixtures/follower-profile.json").read_text("utf-8"))


@pytest.mark.parametrize(
    "fixture", PROFILE_FIXTURES, ids=[item["name"] for item in PROFILE_FIXTURES]
)
def test_shared_follower_profile_contract(fixture):
    if fixture["valid"]:
        BilibiliFollowerProfile.model_validate(fixture["input"])
    else:
        with pytest.raises(ValidationError):
            BilibiliFollowerProfile.model_validate(fixture["input"])
    schema = json.loads((CONTRACTS / "schemas/bilibili-follower.v1.schema.json").read_text("utf-8"))
    schema["$ref"] = "#/$defs/BilibiliFollowerProfile"
    assert Draft202012Validator(schema).is_valid(fixture["input"]) == fixture["valid"]


def test_profile_query_returns_only_a_name_and_never_writes_evidence(tmp_path, monkeypatch):
    original_client = httpx.AsyncClient

    def replay(message):
        assert message.headers["User-Agent"] == "Fixture follower/2"
        assert message.extensions["timeout"]["read"] is None
        return httpx.Response(
            200,
            json={
                "code": 0,
                "data": {"card": {"mid": "99", "name": "合成无落盘昵称"}, "follower": 20},
            },
        )

    monkeypatch.setattr(
        bilibili_follower.httpx,
        "AsyncClient",
        lambda **kwargs: original_client(**kwargs, transport=httpx.MockTransport(replay)),
    )
    response = asyncio.run(
        WorkerRuntime(role="crawler", data_directory=tmp_path).handle(
            request(
                "bilibili.follower.fetch-profile",
                {
                    "mid": "99",
                    "httpConfiguration": {"userAgent": "Fixture follower/2", "readTimeoutMs": 0},
                },
            )
        )
    )
    assert response.type == "bilibili.follower.fetch-profile.result"
    assert response.payload == {"mid": "99", "nickname": "合成无落盘昵称"}
    assert list(tmp_path.iterdir()) == []
