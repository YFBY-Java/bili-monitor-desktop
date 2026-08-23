from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from bmd_workers.protocol import RuntimeEnvelope


def test_runtime_envelope_round_trips_with_trace_metadata() -> None:
    envelope = RuntimeEnvelope(
        id="request-01",
        type="worker.ping",
        version=1,
        timestamp=datetime(2026, 8, 23, tzinfo=timezone.utc),
        correlationId="correlation-01",
        traceId="trace-01",
        payload={"role": "agent"},
    )

    assert envelope.model_dump(mode="json") == {
        "id": "request-01",
        "type": "worker.ping",
        "version": 1,
        "timestamp": "2026-08-23T00:00:00Z",
        "correlationId": "correlation-01",
        "causationId": None,
        "traceId": "trace-01",
        "payload": {"role": "agent"},
    }


def test_runtime_envelope_rejects_unknown_protocol_version() -> None:
    with pytest.raises(ValidationError):
        RuntimeEnvelope(
            id="request-01",
            type="worker.ping",
            version=2,
            timestamp=datetime.now(timezone.utc),
            correlationId="correlation-01",
            traceId="trace-01",
            payload={},
        )
