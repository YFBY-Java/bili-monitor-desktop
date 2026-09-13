import asyncio
import io
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from bmd_workers.protocol import RuntimeEnvelope
from bmd_workers.runtime import WorkerRuntime, run_stdio

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
FIXTURES = json.loads((CONTRACTS / "fixtures/runtime-keep-alive.json").read_text("utf-8"))


@pytest.mark.parametrize("fixture", FIXTURES, ids=[f["name"] for f in FIXTURES])
def test_runtime_keep_alive_shared_fixture(fixture):
    value = {
        "id": "r",
        "type": "worker.ping",
        "version": 1,
        "timestamp": "2026-09-13T00:00:00Z",
        "correlationId": "c",
        "traceId": "t",
        "payload": {},
        **fixture["input"],
    }
    schema = json.loads((CONTRACTS / "schemas/runtime-envelope.v1.schema.json").read_text("utf-8"))
    assert Draft202012Validator(schema).is_valid(value) == fixture["valid"]
    if fixture["valid"]:
        RuntimeEnvelope.model_validate(value)
    else:
        with pytest.raises(ValidationError):
            RuntimeEnvelope.model_validate(value)


def request(keep_alive=True):
    return (
        json.dumps(
            {
                "id": "request",
                "type": "bilibili.live.fetch-room-init",
                "version": 1,
                "timestamp": "2026-09-13T00:00:00Z",
                "correlationId": "correlation",
                "traceId": "trace",
                "keepAlive": keep_alive,
                "payload": {"taskId": "t", "attempt": 1, "leaseId": "l", "roomId": "2"},
            }
        )
        + "\n"
    )


def test_opt_in_envelope_and_old_output_shape():
    envelope = RuntimeEnvelope.model_validate_json(request())
    assert envelope.model_dump(mode="json")["keepAlive"] is True
    old = RuntimeEnvelope.create(
        message_id="old", message_type="worker.ping", payload={}, correlation_id="c", trace_id="t"
    )
    assert "keepAlive" not in old.model_dump(mode="json")


def test_live_request_emits_liveness_without_returning_it_as_business_success(tmp_path):
    async def scenario():
        observed = asyncio.Event()

        class Output(io.StringIO):
            def write(self, value):
                result = super().write(value)
                if "worker.request-alive" in value:
                    observed.set()
                return result

        async def fetch(endpoint, payload, directory):
            await asyncio.wait_for(observed.wait(), timeout=1)
            from bmd_workers.bilibili_follower import BilibiliCrawlerError

            raise BilibiliCrawlerError(
                "BILIBILI_NETWORK_ERROR", "Synthetic timeout", retryable=True, endpoint=endpoint
            )

        output = Output()
        await run_stdio(
            WorkerRuntime(role="crawler", data_directory=tmp_path, live_fetcher=fetch),
            io.StringIO(request()),
            output,
        )
        messages = [json.loads(line) for line in output.getvalue().splitlines()]
        assert messages[0]["type"] == "worker.request-alive"
        assert messages[0]["payload"] == {"requestType": "bilibili.live.fetch-room-init"}
        assert messages[-1]["type"] == "worker.error"
        assert all(m["id"] == "request" and m["traceId"] == "trace" for m in messages)

    asyncio.run(scenario())


def test_broken_parent_output_cancels_the_active_async_operation(tmp_path):
    async def scenario():
        cancelled = asyncio.Event()

        class BrokenOutput(io.StringIO):
            def write(self, value):
                raise BrokenPipeError("Synthetic parent disconnect")

        async def fetch(endpoint, payload, directory):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

        with pytest.raises(BrokenPipeError):
            await asyncio.wait_for(
                run_stdio(
                    WorkerRuntime(role="crawler", data_directory=tmp_path, live_fetcher=fetch),
                    io.StringIO(request()),
                    BrokenOutput(),
                ),
                timeout=1,
            )
        assert cancelled.is_set()

    asyncio.run(scenario())
