import asyncio
import io
import json
from pathlib import Path
from typing import Any

from bmd_workers.protocol import RuntimeEnvelope
from bmd_workers.runtime import WorkerRuntime, run_stdio


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


def test_auth_worker_reports_bilibili_and_douyin_oauth_capabilities() -> None:
    request = RuntimeEnvelope.create(
        message_id="capabilities-01",
        message_type="worker.capabilities",
        payload={},
        correlation_id="correlation-01",
        trace_id="trace-01",
    )

    response = asyncio.run(WorkerRuntime(role="auth").handle(request))

    assert response.payload["capabilities"] == [
        "bilibili.auth.qr.generate",
        "bilibili.auth.qr.poll",
        "bilibili.auth.validate",
        "douyin.oauth.exchange",
        "douyin.oauth.refresh",
        "douyin.oauth.userinfo",
    ]


def test_unimplemented_worker_roles_advertise_no_capabilities() -> None:
    request = RuntimeEnvelope.create(
        message_id="capabilities-empty",
        message_type="worker.capabilities",
        payload={},
        correlation_id="correlation-empty",
        trace_id="trace-empty",
    )

    for role in ("agent", "data"):
        response = asyncio.run(WorkerRuntime(role=role).handle(request))
        assert response.payload["capabilities"] == []


def test_stdio_protocol_is_ascii_safe_when_windows_python_uses_gbk() -> None:
    request = RuntimeEnvelope.create(
        message_id="encoding-request",
        message_type="不支持的能力",
        payload={},
        correlation_id="encoding-correlation",
        trace_id="encoding-trace",
    )
    stdin = io.StringIO(request.model_dump_json() + "\n")
    raw_stdout = io.BytesIO()
    stdout = io.TextIOWrapper(raw_stdout, encoding="gbk", errors="replace")

    asyncio.run(run_stdio(WorkerRuntime(role="agent"), stdin, stdout))
    stdout.flush()
    decoded = json.loads(raw_stdout.getvalue().decode("utf-8"))

    assert "不支持的能力" in decoded["payload"]["message"]


def test_crawler_runtime_exposes_bilibili_follower_fetch() -> None:
    async def fetcher(endpoint: str, mid: str, data_directory: Path) -> dict[str, Any]:
        assert endpoint == "x/web-interface/card"
        assert mid == "2"
        assert data_directory.name == "worker-data"
        return {
            "mid": "2",
            "nickname": "碧诗",
            "avatarUrl": "https://i2.hdslb.com/bfs/face/example.jpg",
            "profileUrl": "https://space.bilibili.com/2",
            "followerCount": 1395836,
            "followingCount": 423,
            "fetchedAt": "2026-08-29T12:00:00.000Z",
            "sourceEndpoint": "x/web-interface/card",
            "evidenceObject": {
                "objectId": f"sha256:{'a' * 64}",
                "relativePath": f"cas/sha256/aa/{'a' * 64}.json",
                "sha256": "a" * 64,
                "sizeBytes": 284,
                "mediaType": "application/json",
            },
            "statusCode": 200,
            "durationMs": 28,
        }

    request = RuntimeEnvelope.create(
        message_id="fetch-card-1",
        message_type="bilibili.follower.fetch-card",
        payload={
            "taskId": "task-1",
            "attempt": 1,
            "leaseId": "lease-1",
            "mid": "2",
        },
        correlation_id="correlation-1",
        trace_id="trace-1",
    )

    response = asyncio.run(
        WorkerRuntime(
            role="crawler",
            data_directory=Path("worker-data"),
            follower_fetcher=fetcher,
        ).handle(request)
    )

    assert response.type == "bilibili.follower.fetch-card.result"
    assert response.payload["mid"] == "2"
    assert response.payload["followerCount"] == 1395836


def test_crawler_runtime_exposes_bilibili_live_fetch() -> None:
    async def live_fetcher(
        endpoint: str, payload: dict[str, object], data_directory: Path
    ) -> dict[str, Any]:
        assert endpoint == "room/v1/Room/get_status_info_by_uids"
        assert payload["uids"] == ["22"]
        assert data_directory.name == "worker-data"
        return {
            "snapshots": [
                {
                    "uid": "22",
                    "roomId": "33",
                    "uname": "anchor",
                    "liveStatus": 1,
                    "onlineCount": 100,
                }
            ],
            "fetchedAt": "2026-08-29T12:00:00.000Z",
            "sourceEndpoint": "room/v1/Room/get_status_info_by_uids",
            "evidenceObject": {
                "objectId": f"sha256:{'b' * 64}",
                "relativePath": f"cas/sha256/bb/{'b' * 64}.json",
                "sha256": "b" * 64,
                "sizeBytes": 284,
                "mediaType": "application/json",
            },
            "statusCode": 200,
            "durationMs": 28,
        }

    request = RuntimeEnvelope.create(
        message_id="live-status-1",
        message_type="bilibili.live.fetch-status-by-uids",
        payload={
            "taskId": "task-live-1",
            "attempt": 1,
            "leaseId": "lease-live-1",
            "uids": ["22"],
        },
        correlation_id="correlation-live-1",
        trace_id="trace-live-1",
    )

    response = asyncio.run(
        WorkerRuntime(
            role="crawler",
            data_directory=Path("worker-data"),
            live_fetcher=live_fetcher,
        ).handle(request)
    )

    assert response.type == "bilibili.live.fetch-status-by-uids.result"
    assert response.payload["snapshots"][0]["roomId"] == "33"


def test_crawler_runtime_exposes_bilibili_live_rank_fetch() -> None:
    async def rank_fetcher(payload: dict[str, object], data_directory: Path) -> dict[str, Any]:
        assert payload["family"] == "AUDIENCE"
        assert payload["rankSwitch"] == "contribution_rank"
        assert data_directory.name == "worker-data"
        return {
            "rankFamily": "AUDIENCE",
            "rankType": "online_rank",
            "rankSwitch": "contribution_rank",
            "periodScope": "REALTIME",
            "pageNo": 1,
            "pageSize": 50,
            "sourceEndpoint": "xlive/general-interface/v1/rank/queryContributionRank",
            "signedRequired": True,
            "capturedAt": "2026-08-29T12:00:00.000Z",
            "entries": [],
            "evidenceObject": {
                "objectId": f"sha256:{'c' * 64}",
                "relativePath": f"cas/sha256/cc/{'c' * 64}.json",
                "sha256": "c" * 64,
                "sizeBytes": 284,
                "mediaType": "application/json",
            },
            "statusCode": 200,
            "durationMs": 28,
        }

    request = RuntimeEnvelope.create(
        message_id="live-rank-1",
        message_type="bilibili.live.rank.fetch",
        payload={
            "taskId": "task-live-rank-1",
            "attempt": 1,
            "leaseId": "lease-live-rank-1",
            "roomId": "33",
            "ruid": "22",
            "family": "AUDIENCE",
            "type": "online_rank",
            "rankSwitch": "contribution_rank",
            "periodScope": "REALTIME",
            "page": 1,
            "pageSize": 50,
            "forceRefreshWbi": False,
        },
        correlation_id="correlation-live-rank-1",
        trace_id="trace-live-rank-1",
    )

    response = asyncio.run(
        WorkerRuntime(
            role="crawler",
            data_directory=Path("worker-data"),
            rank_fetcher=rank_fetcher,
        ).handle(request)
    )

    assert response.type == "bilibili.live.rank.fetch.result"
    assert response.payload["rankFamily"] == "AUDIENCE"


def test_auth_runtime_exposes_generate_poll_and_validate_without_a_server() -> None:
    async def generate() -> dict[str, Any]:
        return {
            "qrUrl": "https://passport.bilibili.com/scan?qrcode_key=key",
            "qrcodeKey": "key",
            "cookies": [],
        }

    async def poll(qrcode_key: str, cookies: list[dict[str, Any]]) -> dict[str, Any]:
        assert qrcode_key == "key"
        assert cookies[0]["name"] == "sid"
        return {"code": 86101, "message": "waiting", "cookies": cookies}

    async def validate(cookies: list[dict[str, Any]]) -> dict[str, Any]:
        assert cookies[0]["name"] == "SESSDATA"
        return {
            "account": {"mid": "99", "uname": "Alice"},
            "rawPayload": {"code": 0},
        }

    runtime = WorkerRuntime(
        role="auth",
        auth_generator=generate,
        auth_poller=poll,
        auth_validator=validate,
    )
    generate_request = RuntimeEnvelope.create(
        message_id="auth-generate-1",
        message_type="bilibili.auth.qr.generate",
        payload={},
        correlation_id="correlation-auth",
        trace_id="trace-auth",
    )
    poll_request = RuntimeEnvelope.create(
        message_id="auth-poll-1",
        message_type="bilibili.auth.qr.poll",
        payload={
            "qrcodeKey": "key",
            "cookies": [{"name": "sid", "value": "sid-secret"}],
        },
        correlation_id="correlation-auth",
        trace_id="trace-auth",
    )
    validate_request = RuntimeEnvelope.create(
        message_id="auth-validate-1",
        message_type="bilibili.auth.validate",
        payload={"cookies": [{"name": "SESSDATA", "value": "session-secret"}]},
        correlation_id="correlation-auth",
        trace_id="trace-auth",
    )

    generated = asyncio.run(runtime.handle(generate_request))
    polled = asyncio.run(runtime.handle(poll_request))
    validated = asyncio.run(runtime.handle(validate_request))

    assert generated.type == "bilibili.auth.qr.generate.result"
    assert generated.payload["qrcodeKey"] == "key"
    assert polled.type == "bilibili.auth.qr.poll.result"
    assert polled.payload["code"] == 86101
    assert validated.type == "bilibili.auth.validate.result"
    assert validated.payload["account"]["mid"] == "99"
