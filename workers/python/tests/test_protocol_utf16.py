import json
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import pytest
from pydantic import BaseModel, field_serializer
from pydantic_core import PydanticSerializationError

from bmd_workers.protocol import RuntimeEnvelope


class JsonSerializedValue(BaseModel):
    value: int

    @field_serializer("value", when_used="json")
    def serialize_value(self, value):
        return f"json-only:{value}"


def envelope(text):
    return RuntimeEnvelope(
        id="protocol-first",
        type="worker.error",
        timestamp=datetime(2026, 10, 5, tzinfo=timezone.utc),
        correlationId="c",
        traceId="t",
        payload={
            "message": text,
            "values": [float("nan"), float("inf"), -float("inf")],
            "datetime": datetime(2026, 10, 5, tzinfo=timezone.utc),
            "bytes": b"valid",
            "decimal": Decimal("2.30"),
            "uuid": UUID("018f0f39-7b5e-7cc1-962d-9a208b3d0184"),
            "tuple": (1, 2),
            "nested": JsonSerializedValue(value=3),
        },
    )


def test_wire_serializer_keeps_existing_normal_json_semantics():
    value = envelope("原样🌸")
    assert value.to_wire_json() == value.model_dump_json(ensure_ascii=True)


@pytest.mark.parametrize("text", ["\ud800", "\udfff", "A\ud800B"])
def test_wire_serializer_keeps_utf16_and_pydantic_json_normalization(text):
    value = envelope(text)
    wire = value.to_wire_json()
    assert wire.isascii()
    output = json.loads(wire)
    assert output == value.model_dump(mode="json")
    assert output["payload"]["values"] == [None, None, None]
    assert output["payload"]["message"] == text
    assert output["payload"]["nested"] == {"value": "json-only:3"}
    assert output["timestamp"] == "2026-10-05T00:00:00Z"
    assert "correlation_id" not in output
    assert "keepAlive" not in output


def test_wire_serializer_does_not_suppress_unserializable_payload():
    value = envelope("\ud800")
    value.payload["unknown"] = object()
    with pytest.raises(PydanticSerializationError):
        value.to_wire_json()
