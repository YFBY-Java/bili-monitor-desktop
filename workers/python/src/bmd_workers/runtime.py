from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from typing import Literal, NoReturn, TextIO

from pydantic import ValidationError

from .protocol import RuntimeEnvelope

WorkerRole = Literal["agent", "crawler", "data"]


@dataclass(frozen=True, slots=True)
class WorkerRuntime:
    """Stdio-only worker boundary; it intentionally opens no business server."""

    role: WorkerRole

    async def handle(self, request: RuntimeEnvelope) -> RuntimeEnvelope:
        if request.type == "worker.ping":
            return self._response(
                request,
                "worker.ping.result",
                {"role": self.role, "state": "ready"},
            )
        if request.type == "worker.capabilities":
            capabilities = {
                "agent": ["agent.run", "agent.evaluate", "mcp.invoke"],
                "crawler": ["http.fetch", "http.crawl", "artifact.capture"],
                "data": ["arrow.write", "parquet.compact", "duckdb.query"],
            }
            return self._response(
                request,
                "worker.capabilities.result",
                {"role": self.role, "capabilities": capabilities[self.role]},
            )
        return self._response(
            request,
            "worker.error",
            {
                "code": "UNSUPPORTED_MESSAGE",
                "message": f"Unsupported {self.role} worker message: {request.type}",
                "retryable": False,
            },
        )

    @staticmethod
    def _response(
        request: RuntimeEnvelope, message_type: str, payload: dict[str, object]
    ) -> RuntimeEnvelope:
        return RuntimeEnvelope.create(
            message_id=request.id,
            message_type=message_type,
            payload=payload,
            correlation_id=request.correlation_id,
            causation_id=request.id,
            trace_id=request.trace_id,
        )


async def run_stdio(runtime: WorkerRuntime, stdin: TextIO, stdout: TextIO) -> None:
    while line := await asyncio.to_thread(stdin.readline):
        try:
            request = RuntimeEnvelope.model_validate_json(line)
            response = await runtime.handle(request)
            serialized = response.model_dump_json()
        except (ValidationError, json.JSONDecodeError) as error:
            serialized = json.dumps(
                {
                    "type": "worker.protocol_error",
                    "version": 1,
                    "message": str(error),
                },
                ensure_ascii=False,
            )
        stdout.write(serialized + "\n")
        stdout.flush()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="BiliMonitor Desktop local Python worker")
    parser.add_argument("--role", choices=("agent", "crawler", "data"), required=True)
    return parser.parse_args()


def main() -> NoReturn:
    args = parse_args()
    asyncio.run(run_stdio(WorkerRuntime(role=args.role), sys.stdin, sys.stdout))
    raise SystemExit(0)


if __name__ == "__main__":
    main()
