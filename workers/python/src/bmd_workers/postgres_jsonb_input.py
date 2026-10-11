"""Validate the decoded HTTP text used by the original snapshot JSONB cast.

This does not rewrite evidence or parse numbers through binary64. The result is
deferred to the Core snapshot write, never raised as a platform fetch failure.
"""

from __future__ import annotations

import json
import re
from typing import Literal

RawPayloadStorageStatus = Literal[
    "ACCEPTED", "INVALID_JSON", "NUL", "INVALID_UNICODE", "NUMBER_OUT_OF_RANGE"
]
_NUMBER = re.compile(
    r"-?(?P<integer>0|[1-9][0-9]*)(?:\.(?P<fraction>[0-9]+))?" r"(?:[eE](?P<exponent>[+-]?[0-9]+))?"
)
_SURROGATE = re.compile("[\ud800-\udfff]")
_STRING_DECODER = json.JSONDecoder()


def _numeric_fits(token: re.Match[str]) -> bool:
    # PostgreSQL 16 set_var_from_str/make_result: exponent int32/2,
    # stored base-10000 weight int16, and stored display scale 14 bits.
    exponent_text = token.group("exponent") or "0"
    exponent_digits = exponent_text.lstrip("+-").lstrip("0") or "0"
    if len(exponent_digits) > 10 or (len(exponent_digits) == 10 and exponent_digits > "1073741823"):
        return False
    exponent = int(exponent_digits) * (-1 if exponent_text.startswith("-") else 1)
    fraction = token.group("fraction") or ""
    if max(0, len(fraction) - exponent) > 16383:
        return False
    integer = token.group("integer")
    digits = integer + fraction
    significant = digits.lstrip("0")
    if not significant:
        return True  # PostgreSQL strips zero digits and forces zero's weight to 0.
    decimal_weight = len(integer) - 1 + exponent - (len(digits) - len(significant))
    return -32768 <= decimal_weight // 4 <= 32767


def raw_payload_storage_status(raw: str) -> RawPayloadStorageStatus:
    """Scan the entire JSON text, including duplicate keys, without a second tree.

    The caller's HTTP String conversion has already decoded bytes into Unicode.
    This scanner has no Python-recursion or integer-digit limit and retains no
    response text in exceptions. Storage continues to reference the original CAS.
    """
    position = 0
    length = len(raw)
    stack = ["root"]
    while stack:
        while position < length and raw[position] in " \t\r\n":
            position += 1
        state = stack[-1]
        if state == "done":
            return "ACCEPTED" if position == length else "INVALID_JSON"
        if position == length:
            return "INVALID_JSON"
        character = raw[position]
        if state in ("object-first", "object-key"):
            if state == "object-first" and character == "}":
                stack.pop()
                position += 1
                continue
            if character != '"':
                return "INVALID_JSON"
            stack[-1] = "object-colon"
        elif state == "object-colon":
            if character != ":":
                return "INVALID_JSON"
            stack[-1] = "object-value"
            position += 1
            continue
        elif state in ("object-separator", "array-separator"):
            closing = "}" if state == "object-separator" else "]"
            if character == closing:
                stack.pop()
            elif character == ",":
                stack[-1] = "object-key" if closing == "}" else "array-value"
            else:
                return "INVALID_JSON"
            position += 1
            continue
        else:
            if state == "array-first" and character == "]":
                stack.pop()
                position += 1
                continue
            stack[-1] = (
                "done"
                if state == "root"
                else "object-separator" if state == "object-value" else "array-separator"
            )
            if character in "{[":
                stack.append("object-first" if character == "{" else "array-first")
                position += 1
                continue
            if character != '"':
                number = _NUMBER.match(raw, position)
                if number:
                    if not _numeric_fits(number):
                        return "NUMBER_OUT_OF_RANGE"
                    position = number.end()
                    continue
                literal = next(
                    (item for item in ("true", "false", "null") if raw.startswith(item, position)),
                    None,
                )
                if literal is None:
                    return "INVALID_JSON"
                position += len(literal)
                continue
        try:
            text, position = _STRING_DECODER.raw_decode(raw, position)
        except ValueError:
            return "INVALID_JSON"
        if not isinstance(text, str):
            return "INVALID_JSON"
        if "\0" in text:
            return "NUL"
        if _SURROGATE.search(text):
            return "INVALID_UNICODE"
    return "INVALID_JSON"
