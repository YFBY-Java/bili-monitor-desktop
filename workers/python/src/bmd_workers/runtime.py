from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable, Literal, NoReturn, TextIO

from pydantic import ValidationError

from .bilibili_auth import (
    BilibiliAuthError,
    generate_qr_login,
    poll_qr_login,
    validate_credential,
)
from .bilibili_follower import (
    CARD_ENDPOINT,
    RELATION_STAT_ENDPOINT,
    BilibiliCrawlerError,
    BilibiliFollowerFetchRequest,
    fetch_follower_endpoint,
)
from .bilibili_live import (
    ROOM_INFO_ENDPOINT,
    ROOM_INFO_OLD_ENDPOINT,
    ROOM_INIT_ENDPOINT,
    STATUS_BY_UIDS_ENDPOINT,
    BilibiliLiveRoomRequest,
    BilibiliLiveStatusRequest,
    BilibiliLiveUidRequest,
    fetch_live_endpoint,
)
from .bilibili_rank import BilibiliLiveRankRequest, fetch_live_rank
from .douyin_oauth import DouyinOAuthError, request_oauth
from .protocol import RuntimeEnvelope

WorkerRole = Literal["agent", "auth", "crawler", "data"]
FollowerFetcher = Callable[[str, str, Path], Awaitable[dict[str, Any]]]
LiveFetcher = Callable[[str, dict[str, object], Path], Awaitable[dict[str, Any]]]
RankFetcher = Callable[[dict[str, object], Path], Awaitable[dict[str, Any]]]
AuthGenerator = Callable[[], Awaitable[dict[str, Any]]]
AuthPoller = Callable[[str, list[dict[str, Any]]], Awaitable[dict[str, Any]]]
AuthValidator = Callable[[list[dict[str, Any]]], Awaitable[dict[str, Any]]]


@dataclass(frozen=True, slots=True)
class WorkerRuntime:
    """Stdio-only worker boundary; it intentionally opens no business server."""

    role: WorkerRole
    data_directory: Path | None = None
    follower_fetcher: FollowerFetcher = fetch_follower_endpoint
    live_fetcher: LiveFetcher = fetch_live_endpoint
    rank_fetcher: RankFetcher = fetch_live_rank
    auth_generator: AuthGenerator = generate_qr_login
    auth_poller: AuthPoller = poll_qr_login
    auth_validator: AuthValidator = validate_credential

    async def handle(self, request: RuntimeEnvelope) -> RuntimeEnvelope:
        if request.type == "worker.ping":
            return self._response(
                request,
                "worker.ping.result",
                {"role": self.role, "state": "ready"},
            )
        if request.type == "worker.capabilities":
            capabilities = {
                "agent": [],
                "auth": [
                    "bilibili.auth.qr.generate",
                    "bilibili.auth.qr.poll",
                    "bilibili.auth.validate",
                    "douyin.oauth.exchange",
                    "douyin.oauth.refresh",
                    "douyin.oauth.userinfo",
                ],
                "crawler": [
                    "bilibili.follower.fetch-card",
                    "bilibili.follower.fetch-relation-stat",
                    "bilibili.live.fetch-room-init",
                    "bilibili.live.fetch-room-info",
                    "bilibili.live.fetch-room-info-old",
                    "bilibili.live.fetch-status-by-uids",
                    "bilibili.live.rank.fetch",
                ],
                "data": [],
            }
            return self._response(
                request,
                "worker.capabilities.result",
                {"role": self.role, "capabilities": capabilities[self.role]},
            )
        if request.type in {
            "bilibili.follower.fetch-card",
            "bilibili.follower.fetch-relation-stat",
        }:
            if self.role != "crawler":
                return self._response(
                    request,
                    "worker.error",
                    {
                        "code": "WORKER_CAPABILITY_MISMATCH",
                        "message": "Bilibili follower fetch requires the crawler worker.",
                        "retryable": False,
                    },
                )
            payload = BilibiliFollowerFetchRequest.model_validate(request.payload)
            endpoint = (
                CARD_ENDPOINT
                if request.type == "bilibili.follower.fetch-card"
                else RELATION_STAT_ENDPOINT
            )
            data_directory = self.data_directory or _data_directory_from_environment()
            try:
                result = await self.follower_fetcher(endpoint, payload.mid, data_directory)
            except BilibiliCrawlerError as error:
                error_payload: dict[str, object] = {
                    "code": error.code,
                    "message": str(error),
                    "retryable": error.retryable,
                    "endpoint": error.endpoint,
                }
                if error.status_code is not None:
                    error_payload["statusCode"] = error.status_code
                if error.bili_code is not None:
                    error_payload["biliCode"] = error.bili_code
                return self._response(request, "worker.error", error_payload)
            return self._response(request, f"{request.type}.result", result)
        if request.type in {
            "douyin.oauth.exchange",
            "douyin.oauth.refresh",
            "douyin.oauth.userinfo",
        }:
            if self.role != "auth":
                return self._response(
                    request,
                    "worker.error",
                    {
                        "code": "WORKER_CAPABILITY_MISMATCH",
                        "message": "Douyin OAuth requires the auth worker.",
                        "retryable": False,
                    },
                )
            operation = {
                "douyin.oauth.exchange": "exchange",
                "douyin.oauth.refresh": "refresh",
                "douyin.oauth.userinfo": "userinfo",
            }[request.type]
            try:
                result = await request_oauth(operation, request.payload)  # type: ignore[arg-type]
            except DouyinOAuthError as error:
                return self._response(
                    request,
                    "worker.error",
                    {
                        "code": error.code,
                        "message": str(error),
                        "retryable": error.retryable,
                    },
                )
            return self._response(request, f"{request.type}.result", result)
        if request.type == "bilibili.live.rank.fetch":
            if self.role != "crawler":
                return self._response(
                    request,
                    "worker.error",
                    {
                        "code": "WORKER_CAPABILITY_MISMATCH",
                        "message": "Bilibili live rank fetch requires the crawler worker.",
                        "retryable": False,
                    },
                )
            rank_payload = BilibiliLiveRankRequest.model_validate(request.payload)
            data_directory = self.data_directory or _data_directory_from_environment()
            try:
                result = await self.rank_fetcher(
                    rank_payload.model_dump(by_alias=True), data_directory
                )
            except BilibiliCrawlerError as error:
                error_payload = {
                    "code": error.code,
                    "message": str(error),
                    "retryable": error.retryable,
                    "endpoint": error.endpoint,
                }
                if error.status_code is not None:
                    error_payload["statusCode"] = error.status_code
                if error.bili_code is not None:
                    error_payload["biliCode"] = error.bili_code
                return self._response(request, "worker.error", error_payload)
            return self._response(request, f"{request.type}.result", result)
        if request.type in {
            "bilibili.live.fetch-room-init",
            "bilibili.live.fetch-room-info",
            "bilibili.live.fetch-room-info-old",
            "bilibili.live.fetch-status-by-uids",
        }:
            if self.role != "crawler":
                return self._response(
                    request,
                    "worker.error",
                    {
                        "code": "WORKER_CAPABILITY_MISMATCH",
                        "message": "Bilibili live fetch requires the crawler worker.",
                        "retryable": False,
                    },
                )
            live_payload: (
                BilibiliLiveStatusRequest | BilibiliLiveUidRequest | BilibiliLiveRoomRequest
            )
            if request.type == "bilibili.live.fetch-status-by-uids":
                live_payload = BilibiliLiveStatusRequest.model_validate(request.payload)
                endpoint = STATUS_BY_UIDS_ENDPOINT
            elif request.type == "bilibili.live.fetch-room-info-old":
                live_payload = BilibiliLiveUidRequest.model_validate(request.payload)
                endpoint = ROOM_INFO_OLD_ENDPOINT
            else:
                live_payload = BilibiliLiveRoomRequest.model_validate(request.payload)
                endpoint = (
                    ROOM_INIT_ENDPOINT
                    if request.type == "bilibili.live.fetch-room-init"
                    else ROOM_INFO_ENDPOINT
                )
            data_directory = self.data_directory or _data_directory_from_environment()
            try:
                result = await self.live_fetcher(
                    endpoint, live_payload.model_dump(by_alias=True), data_directory
                )
            except BilibiliCrawlerError as error:
                error_payload = {
                    "code": error.code,
                    "message": str(error),
                    "retryable": error.retryable,
                    "endpoint": error.endpoint,
                }
                if error.status_code is not None:
                    error_payload["statusCode"] = error.status_code
                if error.bili_code is not None:
                    error_payload["biliCode"] = error.bili_code
                return self._response(request, "worker.error", error_payload)
            return self._response(request, f"{request.type}.result", result)
        if request.type in {
            "bilibili.auth.qr.generate",
            "bilibili.auth.qr.poll",
            "bilibili.auth.validate",
        }:
            if self.role != "auth":
                return self._response(
                    request,
                    "worker.error",
                    {
                        "code": "WORKER_CAPABILITY_MISMATCH",
                        "message": "Bilibili authentication requires the auth worker.",
                        "retryable": False,
                    },
                )
            try:
                if request.type == "bilibili.auth.qr.generate":
                    result = await self.auth_generator()
                else:
                    cookies = _cookie_list(request.payload.get("cookies"))
                    if request.type == "bilibili.auth.qr.poll":
                        qrcode_key = request.payload.get("qrcodeKey")
                        if not isinstance(qrcode_key, str) or not qrcode_key:
                            raise BilibiliAuthError(
                                "BILIBILI_AUTH_INPUT_INVALID",
                                "qrcodeKey is required.",
                                retryable=False,
                                endpoint="worker.runtime",
                            )
                        result = await self.auth_poller(qrcode_key, cookies)
                    else:
                        result = await self.auth_validator(cookies)
            except BilibiliAuthError as error:
                error_payload = {
                    "code": error.code,
                    "message": str(error),
                    "retryable": error.retryable,
                    "endpoint": error.endpoint,
                }
                if error.status_code is not None:
                    error_payload["statusCode"] = error.status_code
                if error.bili_code is not None:
                    error_payload["biliCode"] = error.bili_code
                return self._response(request, "worker.error", error_payload)
            return self._response(request, f"{request.type}.result", result)
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


def _data_directory_from_environment() -> Path:
    value = os.environ.get("BMD_DATA_DIR")
    if not value:
        raise BilibiliCrawlerError(
            "WORKER_DATA_DIRECTORY_MISSING",
            "BMD_DATA_DIR is required for crawler evidence storage.",
            retryable=False,
            endpoint="worker.runtime",
        )
    return Path(value)


def _cookie_list(value: object) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise BilibiliAuthError(
            "BILIBILI_AUTH_INPUT_INVALID",
            "cookies must be an array.",
            retryable=False,
            endpoint="worker.runtime",
        )
    cookies: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            raise BilibiliAuthError(
                "BILIBILI_AUTH_INPUT_INVALID",
                "Each cookie must be an object.",
                retryable=False,
                endpoint="worker.runtime",
            )
        cookies.append({str(key): entry for key, entry in item.items()})
    return cookies


async def run_stdio(runtime: WorkerRuntime, stdin: TextIO, stdout: TextIO) -> None:
    while line := await asyncio.to_thread(stdin.readline):
        try:
            request = RuntimeEnvelope.model_validate_json(line)
            response = await runtime.handle(request)
            # Keep the stdio wire format ASCII-only. Windows virtual-environment launchers can
            # still inherit GBK for stdout even when the parent requested UTF-8; JSON escapes
            # make the protocol byte-stable and JSON.parse restores the original Unicode text.
            serialized = response.model_dump_json(ensure_ascii=True)
        except (ValidationError, json.JSONDecodeError) as error:
            serialized = json.dumps(
                {
                    "type": "worker.protocol_error",
                    "version": 1,
                    "message": str(error),
                },
                ensure_ascii=True,
            )
        stdout.write(serialized + "\n")
        stdout.flush()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="BiliMonitor Desktop local Python worker")
    parser.add_argument("--role", choices=("agent", "auth", "crawler", "data"), required=True)
    return parser.parse_args()


def main() -> NoReturn:
    args = parse_args()
    asyncio.run(run_stdio(WorkerRuntime(role=args.role), sys.stdin, sys.stdout))
    raise SystemExit(0)


if __name__ == "__main__":
    main()
