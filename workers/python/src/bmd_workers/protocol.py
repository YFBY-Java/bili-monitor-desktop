from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


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
    payload: dict[str, Any]

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
