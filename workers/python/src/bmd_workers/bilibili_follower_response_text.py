"""Shared String conversion for the original Bilibili HTTP interfaces."""

import codecs
import re

import httpx

from .bilibili_follower_errors import JAVA_DOUBLE, JAVA_TRIM

_UTF8_SURROGATE_PREFIX = re.compile(b"\xed[\xa0-\xbf][\x80-\xbf]?")
_TOKEN = re.compile(r"[!#$%&\'*+\-.0-9A-Z^_`a-z|~]+")
_CHARSET_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9.+:_-]*")


class FollowerResponseConversionError(ValueError):
    """HTTP header/codec errors are internal failures, not Bilibili fetch errors."""

    def __init__(self) -> None:
        # Never expose an upstream header or body through Worker diagnostics.
        super().__init__("Unable to convert Bilibili response content type or charset.")


def _unquote(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def bilibili_response_encoding(response: httpx.Response) -> str:
    """Validate Content-Type before the caller classifies HTTP status."""
    # Spring uses the first Content-Type header, not HTTPX's comma-joined value.
    headers = response.headers.get_list("content-type")
    media = headers[0] if headers else ""
    if not media:
        return "iso-8859-1"
    full_type, _, remainder = media.partition(";")
    full_type = full_type.strip(JAVA_TRIM)
    if full_type == "*":
        full_type = "*/*"
    primary, _, subtype = full_type.partition("/")
    if not _TOKEN.fullmatch(primary) or not _TOKEN.fullmatch(subtype):
        raise FollowerResponseConversionError()
    if primary == "*" and subtype != "*":
        raise FollowerResponseConversionError()
    # Parse quoted semicolons and retain case until parameter validation, as in
    # the source MimeType constructor. Duplicate exact names use the last value.
    parameters: dict[str, str] = {}
    start = 0
    quoted = False
    for index in range(len(remainder) + 1):
        at_end = index == len(remainder)
        character = "" if at_end else remainder[index]
        if not at_end and character == '"':
            quoted = not quoted
        if not at_end and (character != ";" or quoted):
            continue
        parameter = remainder[start:index].strip(JAVA_TRIM)
        start = index + 1
        attribute, equals, value = parameter.partition("=")
        if equals:
            parameters[attribute.strip(JAVA_TRIM)] = value.strip(JAVA_TRIM)
    encoding: str | None = None
    for attribute, value in parameters.items():
        if not _TOKEN.fullmatch(attribute) or not value:
            raise FollowerResponseConversionError()
        unquoted = _unquote(value)
        if attribute == "charset":
            if not _CHARSET_NAME.fullmatch(unquoted):
                raise FollowerResponseConversionError()
            label = "utf-8" if unquoted.lower() == "unicode-1-1-utf-8" else unquoted
            # Python accepts this label; the observed source Java Charset does not.
            if label.lower() == "utf_8":
                raise FollowerResponseConversionError()
            try:
                encoding = codecs.lookup(label).name
            except LookupError:
                raise FollowerResponseConversionError() from None
        elif unquoted == value and not _TOKEN.fullmatch(value):
            raise FollowerResponseConversionError()
        if attribute == "q":
            quality = unquoted.strip(JAVA_TRIM)
            if not JAVA_DOUBLE.fullmatch(quality):
                raise FollowerResponseConversionError()
            literal = quality[:-1] if quality[-1] in "fFdD" else quality
            try:
                number = float.fromhex(literal) if "x" in literal.lower() else float(literal)
            except (ValueError, OverflowError):
                raise FollowerResponseConversionError() from None
            if not 0 <= number <= 1:
                raise FollowerResponseConversionError()
    primary, subtype = primary.lower(), subtype.lower()
    json_media = primary in {"application", "*"} and (
        subtype in {"json", "*"} or subtype.endswith("+json")
    )
    return encoding or ("utf-8" if json_media else "iso-8859-1")


def bilibili_response_text(body: bytes, codec: str) -> str | None:
    """Decode a successful String response without changing its source bytes."""
    if not body:
        return None
    if codec == "utf-8":
        # JDK replaces this malformed two-/three-byte sequence once; Python
        # replaces each byte. Leave a non-continuation third byte untouched.
        body = _UTF8_SURROGATE_PREFIX.sub(b"\xef\xbf\xbd", body)
    try:
        return body.decode(codec, errors="replace")
    except (LookupError, UnicodeError, TypeError):
        raise FollowerResponseConversionError() from None


def follower_response_text(response: httpx.Response) -> str | None:
    """Preserve the existing follower conversion and empty-body distinction.

    JSON-compatible application media defaults to UTF-8; other media defaults
    to ISO-8859-1. This is not a complete Java codec alias layer.
    """
    codec = bilibili_response_encoding(response)
    return bilibili_response_text(response.content, codec)
