"""The generic account adapter's signed request, separate from monitor requests."""

from pydantic import ConfigDict, Field, StrictBool, StrictStr

from .bilibili_follower_http import BilibiliFollowerHttpRequest
from .bilibili_follower_v2 import JavaLongString, PositiveInteger


class BilibiliPlatformAccountFetchRequestV1(BilibiliFollowerHttpRequest):
    # Do not inherit the follower request's positive_source_long validator.
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    mid: JavaLongString
    task_id: StrictStr = Field(alias="taskId", min_length=1)
    attempt: PositiveInteger
    lease_id: StrictStr = Field(alias="leaseId", min_length=1)
    capture_failure_evidence: StrictBool = Field(default=False, alias="captureFailureEvidence")
