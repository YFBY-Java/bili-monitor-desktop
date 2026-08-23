import asyncio

from bmd_workers.protocol import RuntimeEnvelope
from bmd_workers.runtime import WorkerRuntime


def test_worker_runtime_answers_ping_without_starting_a_server() -> None:
    request = RuntimeEnvelope.create(
        message_id="request-01",
        message_type="worker.ping",
        payload={},
        correlation_id="correlation-01",
        trace_id="trace-01",
    )

    response = asyncio.run(WorkerRuntime(role="agent").handle(request))

    assert response.type == "worker.ping.result"
    assert response.payload == {"role": "agent", "state": "ready"}
    assert response.causation_id == "request-01"
