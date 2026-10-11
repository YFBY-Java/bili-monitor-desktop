"""Follower error coercion from BilibiliApiClient and Jackson NumberInput."""

import math
import re

from .java_scalar_text import java_scalar_text

MIN_CODE = -(2**31)
MAX_CODE = 2**31 - 1
JAVA_TRIM = "".join(chr(value) for value in range(33))
JAVA_BLANK = re.compile(
    r"[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]*"
)
SIMPLE_INTEGER = re.compile(r"-?[0-9]*")
JAVA_DOUBLE = re.compile(
    r"[+-]?(?:NaN|Infinity|(?:(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?"
    r"|0[xX](?:[0-9a-fA-F]+\.?[0-9a-fA-F]*|\.[0-9a-fA-F]+)[pP][+-]?[0-9]+)[fFdD]?)"
)


def _double_to_int(value: float) -> int:
    # Java floating-point narrowing saturates instead of wrapping; NaN becomes zero.
    if math.isnan(value):
        return 0
    if value >= MAX_CODE:
        return MAX_CODE
    if value <= MIN_CODE:
        return MIN_CODE
    return int(value)


def response_code(value: object) -> int:
    """Match JsonNode.asInt(MIN_VALUE), including distinct text/number overflow."""
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return (value + 2**31) % 2**32 - 2**31
    if isinstance(value, float):
        return _double_to_int(value)
    if not isinstance(value, str):
        return MIN_CODE
    text = value.strip(JAVA_TRIM)
    if text.startswith("+"):
        text = text[1:]
    if SIMPLE_INTEGER.fullmatch(text):
        digits = text[1:] if text.startswith("-") else text
        if not digits:
            return MIN_CODE
        # Java permits arbitrarily many leading zeros. Convert only the bounded
        # significant digits, leaving Python's global string-digit guard intact.
        digits = digits.lstrip("0") or "0"
        if len(digits) > 10:
            return MIN_CODE
        integer = int(digits) * (-1 if text.startswith("-") else 1)
        return integer if MIN_CODE <= integer <= MAX_CODE else MIN_CODE
    # parseDouble allows whitespace revealed by removing '+'. Do not retrim
    # before the scan: '+ 2147483648' takes the saturating double branch.
    text = text.strip(JAVA_TRIM)
    if not JAVA_DOUBLE.fullmatch(text):
        return MIN_CODE
    literal = text[:-1] if text[-1] in "fFdD" else text
    if "x" in literal.lower():
        try:
            number = float.fromhex(literal)
        except OverflowError:
            number = -math.inf if literal.startswith("-") else math.inf
    else:
        number = float(literal)
    return _double_to_int(number)


def error_message(value: object, code: int) -> str:
    """Keep nonblank source text unchanged; containers are not scalar messages."""
    text = java_scalar_text(value)
    if text is not None and not JAVA_BLANK.fullmatch(text):
        return text
    return f"Bilibili API error: {code}"
