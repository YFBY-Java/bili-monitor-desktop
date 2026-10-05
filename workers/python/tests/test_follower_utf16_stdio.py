import asyncio
import io
import json

import httpx
import pytest

from bmd_workers.protocol import RuntimeEnvelope
from bmd_workers.runtime import WorkerRuntime, run_stdio


@pytest.mark.parametrize("text", ["\ud800", "\udfff", "A\ud800B", "🌸"])
@pytest.mark.parametrize("successful", [False, True])
@pytest.mark.parametrize("operation", ["fetch-card", "fetch-profile"])
def test_valid_utf16_response_keeps_correlated_result_and_same_stdio_loop_alive(
    monkeypatch, tmp_path, text, successful, operation
):
    body = (
        {"code": 0, "data": {"card": {"mid": "2", "name": text}, "follower": 12}}
        if successful
        else {"code": -101, "message": text}
    )
    original = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **options: original(
            **options,
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    content=json.dumps(body, ensure_ascii=True).encode("ascii"),
                    headers={"Content-Type": "application/json"},
                )
            ),
        ),
    )
    request = RuntimeEnvelope.create(
        message_id="utf16-first",
        message_type=f"bilibili.follower.{operation}",
        payload={"mid": "2", "taskId": "t", "leaseId": "l", "attempt": 1},
        correlation_id="utf16-correlation",
        trace_id="utf16-trace",
    )
    ping = RuntimeEnvelope.create(
        message_id="utf16-next",
        message_type="worker.ping",
        payload={},
        correlation_id="ping-correlation",
        trace_id="ping-trace",
    )
    stdin = io.StringIO(request.model_dump_json() + "\n" + ping.model_dump_json() + "\n")
    raw_output = io.BytesIO()
    output = io.TextIOWrapper(raw_output, encoding="gbk", errors="strict")

    asyncio.run(run_stdio(WorkerRuntime(role="crawler", data_directory=tmp_path), stdin, output))
    output.flush()
    # Calling the same run_stdio loop twice in one input stream cannot be hidden
    # by a parent transport that restarts a failed child.
    wire = raw_output.getvalue().decode("ascii")
    first, second = [json.loads(line) for line in wire.splitlines()]
    assert first["id"] == request.id
    assert first["correlationId"] == request.correlation_id
    assert first["causationId"] == request.id
    assert first["traceId"] == request.trace_id
    assert first["timestamp"].endswith("Z")
    assert "keepAlive" not in first
    if successful:
        assert first["type"] == f"bilibili.follower.{operation}.result"
        assert first["payload"]["nickname"] == text
    else:
        assert first["type"] == "worker.error"
        assert first["payload"] == {
            "code": "BILIBILI_AUTH_EXPIRED",
            "message": text,
            "retryable": False,
            "endpoint": "x/web-interface/card",
            "statusCode": 200,
            "biliCode": -101,
        }
    assert second["id"] == ping.id
    assert second["type"] == "worker.ping.result"
    assert second["payload"] == {"role": "crawler", "state": "ready"}
