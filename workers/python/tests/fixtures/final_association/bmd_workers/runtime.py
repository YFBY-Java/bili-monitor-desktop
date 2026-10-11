"""Synthetic stdio peer for testing final-frame request ownership."""

import json
import os
import sys
import time
from pathlib import Path


def emit(envelope: dict[str, object]) -> None:
    print(json.dumps(envelope, ensure_ascii=True), flush=True)


def run() -> None:
    directory = Path(os.environ["BMD_DATA_DIR"])
    for line in sys.stdin:
        request = json.loads(line)
        final = {
            "id": request["id"],
            "type": request["type"] + ".result",
            "version": request["version"],
            "timestamp": request["timestamp"],
            "correlationId": request["correlationId"],
            "traceId": request["traceId"],
            "payload": {"role": "crawler", "state": "ready"},
        }
        if request["payload"].get("holdFinal"):
            emit({**final, "type": "worker.capabilities.result"})
            emit({**final, "traceId": "foreign-trace"})
            emit(
                {
                    **final,
                    "type": "worker.error",
                    "correlationId": "foreign-correlation",
                    "payload": {"code": "FOREIGN_ERROR", "message": "foreign final"},
                }
            )
            emit({**final, "causationId": "foreign-request"})
            (directory / "final-held").touch()
            deadline = time.monotonic() + 5
            while not (directory / "release-final").exists():
                if time.monotonic() >= deadline:
                    raise TimeoutError("Test did not release the matching final frame.")
                time.sleep(0.005)
        if request["type"] != "worker.ping":
            final.update(
                type="worker.error",
                causationId=request["id"],
                payload={
                    "code": "SYNTHETIC_WORKER_ERROR",
                    "message": "合成错误",
                    "retryable": True,
                    "endpoint": "synthetic.endpoint",
                    "statusCode": 503,
                    "biliCode": -352,
                },
            )
        emit(final)


if __name__ == "__main__":
    run()
