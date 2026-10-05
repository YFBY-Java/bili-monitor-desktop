"""Precision-preserving follower Worker models and outputs, sharing the HTTP/CAS path."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StrictStr,
    ValidationError,
    field_validator,
    model_validator,
)
from pydantic.alias_generators import to_camel

from .bilibili_follower import (
    CARD_ENDPOINT,
    BilibiliCrawlerError,
    BilibiliFollowerFetchRequest,
    BilibiliFollowerProfile,
    _fetch_follower_response,
    _write_object_sync,
)
from .bilibili_follower_http import BilibiliFollowerHttpConfiguration
from .bilibili_follower_long import MAX_SAFE_INTEGER, canonical_long_string, positive_long_string
from .bilibili_live_contract import IsoDateTime, UrlString, json_integer

JavaLongString = Annotated[StrictStr, BeforeValidator(canonical_long_string)]
PositiveJavaLongString = Annotated[StrictStr, BeforeValidator(positive_long_string)]
NonnegativeInteger = Annotated[int, BeforeValidator(json_integer), Field(ge=0, le=MAX_SAFE_INTEGER)]
PositiveInteger = Annotated[int, BeforeValidator(json_integer), Field(ge=1, le=MAX_SAFE_INTEGER)]


class BilibiliFollowerFetchRequestV2(BilibiliFollowerFetchRequest):
    mid: PositiveJavaLongString
    attempt: PositiveInteger


class BilibiliFollowerProfileV2(BilibiliFollowerProfile):
    mid: JavaLongString


class FollowerV2Model(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        strict=True,
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
    )

    @model_validator(mode="before")
    @classmethod
    def reject_explicit_null(cls, value: Any) -> Any:
        if isinstance(value, dict) and any(item is None for item in value.values()):
            raise ValueError("Optional fields must be omitted, not null")
        return value


class FollowerObjectRefV2(FollowerV2Model):
    object_id: StrictStr = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    relative_path: StrictStr = Field(min_length=1)
    sha256: StrictStr = Field(pattern=r"^[a-f0-9]{64}$")
    size_bytes: NonnegativeInteger
    media_type: StrictStr = Field(min_length=1)


class BilibiliFollowerFetchedSnapshotV2(FollowerV2Model):
    mid: JavaLongString
    nickname: StrictStr | None = None
    avatar_url: StrictStr | None = None
    profile_url: UrlString
    follower_count: JavaLongString
    following_count: JavaLongString | None = None
    fetched_at: IsoDateTime
    source_endpoint: Literal["x/web-interface/card", "x/relation/stat"]
    evidence_object: FollowerObjectRefV2
    status_code: PositiveInteger
    duration_ms: NonnegativeInteger

    @field_validator("nickname", "avatar_url")
    @classmethod
    def nonblank_nickname(cls, value: str | None) -> str | None:
        if value is not None:
            return BilibiliFollowerProfile.nonblank_nickname(value)
        return value


def validate_follower_v2_result(
    endpoint: str, value: object, *, profile: bool = False
) -> dict[str, Any]:
    try:
        if profile:
            return BilibiliFollowerProfileV2.model_validate(value).model_dump()
        result = BilibiliFollowerFetchedSnapshotV2.model_validate(value)
        if result.source_endpoint != endpoint:
            raise ValueError("Follower response endpoint mismatch")
        return result.model_dump(by_alias=True, exclude_none=True)
    except (ValidationError, ValueError) as error:
        raise BilibiliCrawlerError(
            "WORKER_CONTRACT_INVALID",
            "Follower output does not match the Long64 v2 Worker contract.",
            retryable=False,
            endpoint=endpoint,
            status_code=200,
        ) from error


async def fetch_follower_profile_v2(
    mid: str, http_configuration: BilibiliFollowerHttpConfiguration | None = None
) -> dict[str, Any]:
    parsed, _, _, _ = await _fetch_follower_response(CARD_ENDPOINT, mid, http_configuration)
    return validate_follower_v2_result(
        CARD_ENDPOINT, {"mid": parsed["mid"], "nickname": parsed["nickname"]}, profile=True
    )


async def fetch_follower_endpoint_v2(
    endpoint: str,
    mid: str,
    data_directory: Path,
    http_configuration: BilibiliFollowerHttpConfiguration | None = None,
) -> dict[str, Any]:
    parsed, raw_bytes, status_code, duration_ms = await _fetch_follower_response(
        endpoint, mid, http_configuration
    )
    # Conversion happens before NDJSON: no consumer first sees a lossy JSON number.
    output = dict(parsed)
    for field in ("followerCount", "followingCount"):
        if field in output:
            output[field] = str(output[field])
    evidence = await asyncio.to_thread(_write_object_sync, data_directory, raw_bytes)
    return validate_follower_v2_result(
        endpoint,
        {
            **output,
            "evidenceObject": evidence,
            "statusCode": status_code,
            "durationMs": duration_ms,
        },
    )
