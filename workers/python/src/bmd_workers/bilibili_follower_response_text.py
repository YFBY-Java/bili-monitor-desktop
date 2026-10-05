"""String response conversion for the original follower HTTP interface."""

import codecs
import re

import httpx

_UTF8_SURROGATE_PREFIX = re.compile(b"\xed[\xa0-\xbf][\x80-\xbf]?")


def follower_response_text(response: httpx.Response) -> str | None:
    """Keep empty body distinct from an empty String and do not strip a BOM.

    Spring's String converter defaults JSON-compatible application media to
    UTF-8, otherwise ISO-8859-1. An explicit charset takes precedence. Invalid
    charset/MIME domains are not a complete Java alias compatibility layer.
    """
    media = response.headers.get("content-type", "").partition(";")[0].strip().lower()
    primary, _, subtype = media.partition("/")
    json_media = primary in {"application", "*"} and (
        subtype in {"json", "*"} or subtype.endswith("+json")
    )
    encoding = response.charset_encoding or ("utf-8" if json_media else "iso-8859-1")
    if encoding.lower() == "unicode-1-1-utf-8":
        encoding = "utf-8"
    # Python accepts this label, whereas the original Java Charset does not.
    if encoding.lower() == "utf_8":
        raise LookupError("Unsupported follower response charset.")
    codec = codecs.lookup(encoding).name
    body = response.content
    if not body:
        return None
    if codec == "utf-8":
        # JDK replaces this malformed two-/three-byte sequence once; Python
        # replaces each byte. Leave a non-continuation third byte untouched.
        body = _UTF8_SURROGATE_PREFIX.sub(b"\xef\xbf\xbd", body)
    return body.decode(codec, errors="replace")
