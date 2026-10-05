from pydantic import BaseModel, Field, field_validator

from .bilibili_live_http import BilibiliLiveHttpConfiguration, HeaderValue


class BilibiliFollowerHttpConfiguration(BilibiliLiveHttpConfiguration):
    user_agent: HeaderValue = Field(
        default="SocialDataMonitor/0.1 (+low-frequency public Bilibili follower monitor)",
        alias="userAgent",
    )
    referer: HeaderValue = "https://www.bilibili.com/"


class BilibiliFollowerHttpRequest(BaseModel):
    http_configuration: BilibiliFollowerHttpConfiguration | None = Field(
        default=None, alias="httpConfiguration", exclude_if=lambda value: value is None
    )

    @field_validator("http_configuration", mode="before")
    @classmethod
    def provided_configuration_must_be_object(cls, value: object) -> object:
        if value is None:
            raise ValueError("httpConfiguration must be an object when provided")
        return value
