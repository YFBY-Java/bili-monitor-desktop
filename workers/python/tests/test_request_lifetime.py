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


def request(keep_alive=True, message_type="bilibili.live.fetch-room-init"):
    return (
        json.dumps(
            {
                "id": "request",
                "type": message_type,
                "version": 1,
                "timestamp": "2026-09-13T00:00:00Z",
                "correlationId": "correlation",
                "traceId": "trace",
                "keepAlive": keep_alive,
                "payload": {
                    "taskId": "t",
                    "attempt": 1,
                    "leaseId": "l",
                    "roomId": "2",
                    **(
                        {
                            "ruid": "3",
                            "family": "GUARD",
                            "type": "guard_weekly",
                            "page": 1,
                            "pageSize": 30,
                        }
                        if message_type == "bilibili.live.rank.fetch"
                        else {}
                    ),
                },
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


@pytest.mark.parametrize(
    "message_type", ["bilibili.live.fetch-room-init", "bilibili.live.rank.fetch"]
)
def test_live_request_emits_liveness_without_returning_it_as_business_success(
    tmp_path, message_type
):
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

        async def rank_fetch(payload, directory):
            return await fetch("xlive/app-room/v2/guardTab/topListNew", payload, directory)

        await run_stdio(
            WorkerRuntime(
                role="crawler", data_directory=tmp_path, live_fetcher=fetch, rank_fetcher=rank_fetch
            ),
            io.StringIO(request(message_type=message_type)),
            output,
        )
        messages = [json.loads(line) for line in output.getvalue().splitlines()]
        assert messages[0]["type"] == "worker.request-alive"
        assert messages[0]["payload"] == {"requestType": message_type}
        assert messages[-1]["type"] == "worker.error"
        assert all(m["id"] == "request" and m["traceId"] == "trace" for m in messages)

    asyncio.run(scenario())


@pytest.mark.parametrize("opt_in", [None, False])
def test_legacy_rank_caller_gets_only_business_response(tmp_path, opt_in):
    async def scenario():
        async def fetch(payload, directory):
            await asyncio.sleep(0)
            return {"legacy": True}

        value = json.loads(request(message_type="bilibili.live.rank.fetch"))
        if opt_in is None:
            del value["keepAlive"]
        else:
            value["keepAlive"] = opt_in
        output = io.StringIO()
        await run_stdio(
            WorkerRuntime(role="crawler", data_directory=tmp_path, rank_fetcher=fetch),
            io.StringIO(json.dumps(value) + "\n"),
            output,
        )
        messages = [json.loads(line) for line in output.getvalue().splitlines()]
        assert len(messages) == 1
        assert messages[0]["type"] == "bilibili.live.rank.fetch.result"
        assert "keepAlive" not in messages[0]

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
