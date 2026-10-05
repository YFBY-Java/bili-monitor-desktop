"""Follower Long64 conversion for the observed JDK20/Jackson2.17.3 baseline."""

import math
import re

MIN_LONG = -(2**63)
MAX_LONG = 2**63 - 1
MAX_SAFE_INTEGER = 2**53 - 1

# Character.digit(char, 10), exhaustively observed across JDK20's 65536 chars.
# Java Long.parseLong iterates UTF-16 chars, so supplementary digits fail.
_BMP_DECIMAL_STARTS = (
    0x0030,
    0x0660,
    0x06F0,
    0x07C0,
    0x0966,
    0x09E6,
    0x0A66,
    0x0AE6,
    0x0B66,
    0x0BE6,
    0x0C66,
    0x0CE6,
    0x0D66,
    0x0DE6,
    0x0E50,
    0x0ED0,
    0x0F20,
    0x1040,
    0x1090,
    0x17E0,
    0x1810,
    0x1946,
    0x19D0,
    0x1A80,
    0x1A90,
    0x1B50,
    0x1BB0,
    0x1C40,
    0x1C50,
    0xA620,
    0xA8D0,
    0xA900,
    0xA9D0,
    0xA9F0,
    0xAA50,
    0xABF0,
    0xFF10,
)
_BMP_DECIMAL_DIGITS = {
    chr(start + digit): digit for start in _BMP_DECIMAL_STARTS for digit in range(10)
}
_CANONICAL_LONG = re.compile(r"(?:0|[1-9][0-9]*|-[1-9][0-9]*)\Z")


def parse_java_long(value: object) -> int | None:
    """JsonNode number.asLong or textual Long.parseLong, never Python int coercion."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return (value - MIN_LONG) % (2**64) + MIN_LONG
    if isinstance(value, float):
        if math.isnan(value):
            return 0
        if value >= MAX_LONG:
            return MAX_LONG
        if value <= MIN_LONG:
            return MIN_LONG
        return int(value)
    if not isinstance(value, str) or not value:
        return None
    negative = value[0] == "-"
    start = 1 if value[0] in "+-" else 0
    if start == len(value):
        return None
    limit = -MIN_LONG if negative else MAX_LONG
    result = 0
    for index in range(start, len(value)):
        digit = _BMP_DECIMAL_DIGITS.get(value[index])
        if digit is None or result > (limit - digit) // 10:
            return None
        result = result * 10 + digit
    return -result if negative else result


def canonical_long_string(value: object) -> str:
    if not isinstance(value, str) or not _CANONICAL_LONG.fullmatch(value):
        raise ValueError("Expected a canonical signed Long64 decimal string")
    magnitude = value[1:] if value.startswith("-") else value
    boundary = "9223372036854775808" if value.startswith("-") else "9223372036854775807"
    if len(magnitude) > 19 or (len(magnitude) == 19 and magnitude > boundary):
        raise ValueError("Long64 decimal string is out of range")
    return value


def positive_long_string(value: object) -> str:
    result = canonical_long_string(value)
    if result == "0" or result.startswith("-"):
        raise ValueError("Expected a positive Long64 decimal string")
    return result
