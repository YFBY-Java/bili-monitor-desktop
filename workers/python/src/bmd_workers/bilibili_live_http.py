from typing import Annotated

import httpx
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints, field_validator

TimeoutMilliseconds = Annotated[StrictInt, Field(ge=0, le=2147483647)]
HeaderValue = Annotated[str, StringConstraints(strict=True, pattern=r"^[\t\x20-\x7e]*$")]


class BilibiliLiveHttpConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    connect_timeout_ms: TimeoutMilliseconds = Field(default=5000, alias="connectTimeoutMs")
    read_timeout_ms: TimeoutMilliseconds = Field(default=10000, alias="readTimeoutMs")
    user_agent: HeaderValue = Field(
        default="SocialDataMonitor/0.1 (+low-frequency public Bilibili live monitor)",
        alias="userAgent",
    )
    referer: HeaderValue = "https://live.bilibili.com/"

    def timeout(self) -> httpx.Timeout:
        return httpx.Timeout(
            None,
            connect=self.connect_timeout_ms / 1000 or None,
            read=self.read_timeout_ms / 1000 or None,
        )

    def headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "User-Agent": self.user_agent,
            "Referer": self.referer,
        }


class BilibiliLiveHttpRequest(BaseModel):
    http_configuration: BilibiliLiveHttpConfiguration | None = Field(
        default=None, alias="httpConfiguration", exclude_if=lambda value: value is None
    )

    @field_validator("http_configuration", mode="before")
    @classmethod
    def provided_configuration_must_be_object(cls, value: object) -> object:
        if value is None:
            raise ValueError("httpConfiguration must be an object when provided")
        return value
