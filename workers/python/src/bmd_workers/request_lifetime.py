import asyncio
from typing import Any, Coroutine, TextIO

from .protocol import RuntimeEnvelope

KEEP_ALIVE_INTERVAL_SECONDS = 5
LIVE_HTTP_REQUESTS = frozenset(
    {
        "bilibili.live.fetch-room-init",
        "bilibili.live.fetch-room-info",
        "bilibili.live.fetch-room-info-old",
        "bilibili.live.fetch-status-by-uids",
        "bilibili.live.rank.fetch",
    }
)
HTTP_REQUESTS = LIVE_HTTP_REQUESTS | {
    "bilibili.follower.fetch-card",
    "bilibili.follower.fetch-relation-stat",
    "bilibili.follower.fetch-profile",
    "bilibili.follower.fetch-card.v2",
    "bilibili.follower.fetch-relation-stat.v2",
    "bilibili.follower.fetch-profile.v2",
}


async def handle_with_liveness(
    request: RuntimeEnvelope, operation: Coroutine[Any, Any, RuntimeEnvelope], stdout: TextIO
) -> RuntimeEnvelope:
    if not request.keep_alive or request.type not in HTTP_REQUESTS:
        return await operation

    async def pulse() -> None:
        while True:
            frame = RuntimeEnvelope.create(
                message_id=request.id,
                message_type="worker.request-alive",
                payload={"requestType": request.type},
                correlation_id=request.correlation_id,
                trace_id=request.trace_id,
                causation_id=request.id,
            )
            stdout.write(frame.to_wire_json() + "\n")
            stdout.flush()
            await asyncio.sleep(KEEP_ALIVE_INTERVAL_SECONDS)

    active = asyncio.create_task(operation)
    heartbeat = asyncio.create_task(pulse())
    try:
        completed, _ = await asyncio.wait({active, heartbeat}, return_when=asyncio.FIRST_COMPLETED)
        if heartbeat in completed:
            # A failed stdout write means the supervising parent can no longer receive results.
            await heartbeat
        return await active
    finally:
        active.cancel()
        heartbeat.cancel()
        await asyncio.gather(active, heartbeat, return_exceptions=True)
