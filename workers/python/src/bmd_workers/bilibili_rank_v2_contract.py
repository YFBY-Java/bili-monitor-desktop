"""Versioned exact Rank result; the legacy wire never rounds Long64 values."""

from typing import Annotated, Any, Literal

from pydantic import BeforeValidator, Field, StrictInt

from .bilibili_follower import BilibiliCrawlerError
from .bilibili_follower_long import MAX_SAFE_INTEGER, canonical_long_string
from .bilibili_live_contract import IsoDateTime, LiveModel, LiveObjectRef
from .postgres_jsonb_input import RawPayloadStorageStatus

LongString = Annotated[str, BeforeValidator(canonical_long_string)]
Int32 = Annotated[StrictInt, Field(ge=-2147483648, le=2147483647)]
Endpoint = Literal[
    "xlive/general-interface/v1/rank/queryContributionRank",
    "xlive/general-interface/v1/rank/getOnlineGoldRank",
    "xlive/app-room/v2/guardTab/topListNew",
]


class RankEntryV2(LiveModel):
    entry_kind: str = Field(min_length=1, max_length=32)
    user_uid: LongString | None = None
    rank_no: Int32 | None = None
    display_name: str | None = None
    face_url: str | None = None
    score: LongString | None = None
    guard_level: Int32 | None = None
    wealth_level: Int32 | None = None
    medal_name: str | None = None
    medal_level: Int32 | None = None
    medal_ruid: LongString | None = None
    medal_is_light: Int32 | None = None
    raw_entry_json: str | None = None
    raw_entry_storage_status: RawPayloadStorageStatus | None = None
    guard_expired_text: str | None = None
    accompany_days: Int32 | None = None


class RankFetchedSnapshotV2(LiveModel):
    rank_family: Literal["AUDIENCE", "GUARD"]
    rank_type: str = Field(min_length=1, max_length=64)
    rank_switch: str | None = Field(default=None, min_length=1, max_length=64)
    period_scope: str | None = Field(default=None, min_length=1, max_length=32)
    page_no: StrictInt = Field(ge=1, le=5)
    page_size: StrictInt = Field(ge=1, le=100)
    total_count: LongString | None = None
    count_text: str | None = None
    value_text: str | None = None
    remind_msg: str | None = None
    source_endpoint: Endpoint
    signed_required: bool
    captured_at: IsoDateTime
    entries: list[RankEntryV2] = Field(max_length=200)
    evidence_object: LiveObjectRef
    status_code: StrictInt = Field(ge=1)
    duration_ms: StrictInt = Field(ge=0)
    raw_payload_storage_status: RawPayloadStorageStatus | None = None


def rank_wire_result(result: dict[str, Any], exact: bool) -> dict[str, Any]:
    precise = {**result}
    if "totalCount" in precise:
        precise["totalCount"] = str(precise["totalCount"])
    precise["entries"] = [
        {**entry, **({"score": str(entry["score"])} if "score" in entry else {})}
        for entry in result["entries"]
    ]
    value = RankFetchedSnapshotV2.model_validate(precise).model_dump(
        by_alias=True, exclude_none=True
    )
    if exact:
        return value
    # These are archive-only facts; the published public v1 entry stays unchanged.
    for entry in value["entries"]:
        for key in ("medalRuid", "medalIsLight", "rawEntryJson", "rawEntryStorageStatus"):
            entry.pop(key, None)
    invalid = "totalCount" in value and not 0 <= int(value["totalCount"]) <= MAX_SAFE_INTEGER
    for entry in value["entries"]:
        invalid |= "userUid" in entry and int(entry["userUid"]) <= 0
        invalid |= "rankNo" in entry and entry["rankNo"] <= 0
        invalid |= any(
            entry.get(key, 0) < 0
            for key in ("guardLevel", "wealthLevel", "medalLevel", "accompanyDays")
        )
        invalid |= "score" in entry and not 0 <= int(entry["score"]) <= MAX_SAFE_INTEGER
    if invalid:
        raise BilibiliCrawlerError(
            "WORKER_CONTRACT_PRECISION_UNSUPPORTED",
            "Legacy rank result cannot represent the original values; use v2.",
            retryable=False,
            endpoint=value["sourceEndpoint"],
            status_code=value["statusCode"],
        )
    if "totalCount" in value:
        value["totalCount"] = int(value["totalCount"])
    for entry in value["entries"]:
        if "score" in entry:
            entry["score"] = int(entry["score"])
    return value
