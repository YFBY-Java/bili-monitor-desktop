"""Live Worker models verified against packages/contracts' portable schema and fixtures."""

import re
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import (
    AnyUrl,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StrictStr,
    TypeAdapter,
    ValidationError,
    model_validator,
)
from pydantic.alias_generators import to_camel

from .bilibili_follower import BilibiliCrawlerError
from .bilibili_follower_long import canonical_long_string
from .postgres_jsonb_input import RawPayloadStorageStatus

MAX_SAFE_INTEGER = 9_007_199_254_740_991


def json_integer(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Expected a JSON integer")
    if isinstance(value, float) and (not value.is_integer()):
        raise ValueError("Expected a JSON integer")
    return int(value)


def numeric_id(value: object) -> object:
    if isinstance(value, str):
        # ECMAScript trim used by the TypeScript public input contract.
        return value.strip(
            "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
        )
    return value


def iso_datetime(value: object) -> str:
    if not isinstance(value, str) or not re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\.[0-9]+)?)?Z", value
    ):
        raise ValueError("Expected an ISO UTC datetime")
    datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value


URL_ADAPTER = TypeAdapter(AnyUrl)


def url_string(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("Expected a URL string")
    URL_ADAPTER.validate_python(value)
    return value


PositiveId = Annotated[str, BeforeValidator(numeric_id), Field(pattern=r"^[1-9][0-9]*$")]
AuxiliaryId = Annotated[str, Field(pattern=r"^[0-9]+$")]
NonnegativeInteger = Annotated[int, BeforeValidator(json_integer), Field(ge=0, le=MAX_SAFE_INTEGER)]
SignedInteger = Annotated[
    int, BeforeValidator(json_integer), Field(ge=-MAX_SAFE_INTEGER, le=MAX_SAFE_INTEGER)
]
PositiveInteger = Annotated[int, BeforeValidator(json_integer), Field(ge=1, le=MAX_SAFE_INTEGER)]
IsoDateTime = Annotated[str, BeforeValidator(iso_datetime)]
UrlString = Annotated[str, BeforeValidator(url_string)]
Endpoint = Literal[
    "room/v1/Room/get_status_info_by_uids",
    "room/v1/Room/room_init",
    "room/v1/Room/get_info",
    "room/v1/Room/getRoomInfoOld",
]


class LiveModel(BaseModel):
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
        # TypeScript optional fields are absent, never JSON null. Defaults stay omitted on dump.
        if isinstance(value, dict) and any(item is None for item in value.values()):
            raise ValueError("Optional fields must be omitted, not null")
        return value


class LiveSnapshotFields(LiveModel):
    uid: PositiveId
    room_id: PositiveId
    short_id: AuxiliaryId | None = None
    uname: str | None = Field(default=None, min_length=1, max_length=160)
    face_url: str | None = None
    title: str | None = None
    cover_url: str | None = None
    keyframe_url: str | None = None
    area_id: AuxiliaryId | None = None
    area_name: str | None = Field(default=None, max_length=120)
    parent_area_id: AuxiliaryId | None = None
    parent_area_name: str | None = Field(default=None, max_length=120)
    live_status: Annotated[Literal[0, 1, 2], BeforeValidator(json_integer)]
    live_time: IsoDateTime | None = None


class LiveSnapshot(LiveSnapshotFields):
    online_count: SignedInteger | None = None
    attention_count: SignedInteger | None = None


class LiveObjectRef(LiveModel):
    object_id: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    relative_path: str = Field(min_length=1)
    size_bytes: NonnegativeInteger
    media_type: str = Field(min_length=1)


class LiveMetadata(LiveModel):
    fetched_at: IsoDateTime
    source_endpoint: Endpoint
    evidence_object: LiveObjectRef
    status_code: PositiveInteger
    duration_ms: NonnegativeInteger
    raw_payload_storage_status: RawPayloadStorageStatus | None = None


class LiveFetchedSnapshot(LiveSnapshot, LiveMetadata):
    pass


class LiveFetchedOptionalSnapshot(LiveMetadata):
    snapshot: LiveSnapshot | None = None


class LiveFetchedStatusBatch(LiveMetadata):
    source_endpoint: Literal["room/v1/Room/get_status_info_by_uids"]
    snapshots: list[LiveSnapshot]


JavaLongString = Annotated[StrictStr, BeforeValidator(canonical_long_string)]


class LiveSnapshotV2(LiveSnapshotFields):
    online_count: JavaLongString | None = None
    attention_count: JavaLongString | None = None


class LiveFetchedSnapshotV2(LiveSnapshotV2, LiveMetadata):
    pass


class LiveFetchedOptionalSnapshotV2(LiveMetadata):
    snapshot: LiveSnapshotV2 | None = None


class LiveFetchedStatusBatchV2(LiveMetadata):
    source_endpoint: Literal["room/v1/Room/get_status_info_by_uids"]
    snapshots: list[LiveSnapshotV2]


def reject_unsafe_legacy_counters(endpoint: str, value: object) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if (
                key in ("onlineCount", "attentionCount")
                and isinstance(item, int)
                and not isinstance(item, bool)
            ):
                if -(1 << 63) <= item < (1 << 63) and abs(item) > MAX_SAFE_INTEGER:
                    raise BilibiliCrawlerError(
                        "LONG64_LEGACY_PRECISION_UNSUPPORTED",
                        "Live counter cannot be represented by the legacy safe-number contract.",
                        retryable=False,
                        endpoint=endpoint,
                        status_code=200,
                    )
            else:
                reject_unsafe_legacy_counters(endpoint, item)
    elif isinstance(value, list):
        for item in value:
            reject_unsafe_legacy_counters(endpoint, item)


def validate_live_snapshot_data(
    endpoint: str, value: dict[str, object], exact: bool = False
) -> None:
    if not exact:
        reject_unsafe_legacy_counters(endpoint, value)
    try:
        if endpoint == "room/v1/Room/get_status_info_by_uids":
            TypeAdapter(list[LiveSnapshotV2] if exact else list[LiveSnapshot]).validate_python(
                value.get("snapshots")
            )
        elif endpoint == "room/v1/Room/getRoomInfoOld":
            if "snapshot" in value:
                (LiveSnapshotV2 if exact else LiveSnapshot).model_validate(value["snapshot"])
        else:
            (LiveSnapshotV2 if exact else LiveSnapshot).model_validate(value)
    except (ValidationError, ValueError) as error:
        # Validation errors contain input values; never forward them or the raw platform body.
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Bilibili live response does not match the shared Worker contract.",
            retryable=False,
            endpoint=endpoint,
            status_code=200,
        ) from error


def validate_live_result(endpoint: str, value: object, exact: bool = False) -> dict[str, Any]:
    if not exact:
        reject_unsafe_legacy_counters(endpoint, value)
    model: type[LiveMetadata] = (
        LiveFetchedStatusBatch
        if endpoint == "room/v1/Room/get_status_info_by_uids"
        else (
            LiveFetchedOptionalSnapshot
            if endpoint == "room/v1/Room/getRoomInfoOld"
            else LiveFetchedSnapshot
        )
    )
    if exact:
        model = (
            LiveFetchedStatusBatchV2
            if endpoint == "room/v1/Room/get_status_info_by_uids"
            else (
                LiveFetchedOptionalSnapshotV2
                if endpoint == "room/v1/Room/getRoomInfoOld"
                else LiveFetchedSnapshotV2
            )
        )
    try:
        result = model.model_validate(value)
        if result.source_endpoint != endpoint:
            raise ValueError("Response endpoint mismatch")
        return result.model_dump(by_alias=True, exclude_none=True)
    except (ValidationError, ValueError) as error:
        # Validation errors contain input values; never forward them or the raw platform body.
        raise BilibiliCrawlerError(
            "BILIBILI_PARSE_ERROR",
            "Bilibili live response does not match the shared Worker contract.",
            retryable=False,
            endpoint=endpoint,
            status_code=200,
        ) from error
