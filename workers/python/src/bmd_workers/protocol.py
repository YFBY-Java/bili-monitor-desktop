from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool
from pydantic_core import PydanticSerializationError


class RuntimeEnvelope(BaseModel):
    """Language-neutral envelope shared with the TypeScript local Core."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True, serialize_by_alias=True)

    id: str = Field(min_length=1)
    type: str = Field(min_length=1)
    version: Literal[1] = 1
    timestamp: datetime
    correlation_id: str = Field(alias="correlationId", min_length=1)
    causation_id: str | None = Field(default=None, alias="causationId", min_length=1)
    trace_id: str = Field(alias="traceId", min_length=1)
    keep_alive: StrictBool = Field(
        default=False, alias="keepAlive", exclude_if=lambda value: not value
    )
    payload: dict[str, Any]

    def to_wire_json(self) -> str:
        """ASCII NDJSON, including UTF-16 units accepted by the original parser."""
        try:
            return self.model_dump_json(ensure_ascii=True)
        except PydanticSerializationError:
            # JSON-mode projection still applies aliases, exclusions, JSON field
            # serializers and non-finite-number normalization. Unlike to_json's
            # UTF-8 encoder, it can retain isolated UTF-16 units for JSON escapes.
            # Unserializable values still fail rather than becoming fake results.
            return json.dumps(
                self.model_dump(mode="json"),
                ensure_ascii=True,
                separators=(",", ":"),
                allow_nan=False,
            )

    @classmethod
    def create(
        cls,
        *,
        message_id: str,
        message_type: str,
        payload: dict[str, Any],
        correlation_id: str,
        trace_id: str,
        causation_id: str | None = None,
    ) -> RuntimeEnvelope:
        return cls(
            id=message_id,
            type=message_type,
            timestamp=datetime.now(timezone.utc),
            correlationId=correlation_id,
            causationId=causation_id,
            traceId=trace_id,
            payload=payload,
        )
