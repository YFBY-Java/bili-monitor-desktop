"""Decode the first follower JSON value with Jackson's default reader limits."""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Literal, NoReturn

_WHITESPACE = " \t\r\n"
_MAX_DEPTH = 1_000
_MAX_NUMBER_DIGITS = 1_000
_MAX_NAME_UNITS = 50_000
_MAX_STRING_UNITS = 20_000_000
_STRING_BUFFER_LIMIT = 0x8000
_READER_BUFFER_UNITS = 4_000
_SUPPLEMENTARY = re.compile("[\U00010000-\U0010ffff]")
_STRING_DECODER = json.JSONDecoder()
_IDENTIFIER_CATEGORIES = frozenset(
    {"Lu", "Ll", "Lt", "Lm", "Lo", "Nl", "Sc", "Pc", "Nd", "Mc", "Mn", "Cf"}
)
# Last recorded source runtime: Java 20.0.1 (Unicode 15). These are its only
# BMP identifier additions over the bundled Python 3.11 Unicode 14 table,
# verified across all 65536 chars. Other source JVM baselines are not implied.
_OBSERVED_JDK20_IDENTIFIER_ADDITIONS = frozenset({0x0CF3, 0x0ECE})


def _fail(message: str = "Invalid follower JSON value.") -> NoReturn:
    # Never retain an upstream response in JSONDecodeError.doc or its message.
    raise json.JSONDecodeError(message, "", 0)


def _utf16_units(value: str) -> int:
    return len(value) + sum(1 for _ in _SUPPLEMENTARY.finditer(value))


def _identifier_part(character: str) -> bool:
    code = ord(character)
    # Jackson checks a Java char: a supplementary code point starts with a
    # surrogate, which is not a Java identifier part.
    if code > 0xFFFF:
        return False
    return (
        code in _OBSERVED_JDK20_IDENTIFIER_ADDITIONS
        or unicodedata.category(character) in _IDENTIFIER_CATEGORIES
        or (0 <= code <= 8 or 14 <= code <= 27 or 127 <= code <= 159)
    )


@dataclass
class _Frame:
    value: dict[str, object] | list[object]
    state: Literal["first", "item", "value", "separator"] = "first"
    key: str | None = None


class _FollowerJsonReader:
    def __init__(self, raw: str) -> None:
        self.raw = raw
        self.position = 0
        self.length = len(raw)
        # JsonFactory.createParser(String) uses the complete char array only up
        # to 0x8000 UTF-16 units. A fresh StringReader buffer has 4000 units;
        # shared JVM recycler caches may supply larger arrays and remain outside
        # this decoder's per-response model.
        self.reader_buffered = self.length > _STRING_BUFFER_LIMIT or (
            _utf16_units(raw) > _STRING_BUFFER_LIMIT
        )
        self.units_position = 0
        self.units_extra = 0

    def whitespace(self) -> None:
        while self.position < self.length and self.raw[self.position] in _WHITESPACE:
            self.position += 1

    def peek(self) -> str:
        return self.raw[self.position] if self.position < self.length else ""

    def units_offset(self, position: int) -> int:
        # Calls advance monotonically; count each intervening supplementary
        # character once without creating a second copy of a large response.
        self.units_extra += sum(
            1 for _ in _SUPPLEMENTARY.finditer(self.raw, self.units_position, position)
        )
        self.units_position = position
        return position + self.units_extra

    def string(self, *, name: bool = False) -> str:
        try:
            value, end = _STRING_DECODER.raw_decode(self.raw, self.position)
        except (ValueError, OverflowError):
            # The standard string scanner's error contains the original document.
            raise json.JSONDecodeError("Invalid follower JSON string.", "", 0) from None
        if not isinstance(value, str):
            _fail()
        maximum = _MAX_NAME_UNITS if name else _MAX_STRING_UNITS
        if len(value) > maximum or (len(value) * 2 > maximum and _utf16_units(value) > maximum):
            _fail("Follower JSON name/string exceeds maximum length.")
        self.position = end
        return value

    def literal(self, token: str, value: object) -> object:
        if not self.raw.startswith(token, self.position):
            _fail()
        self.position += len(token)
        following = self.peek()
        # ReaderBasedJsonParser._matchToken only checks identifier parts for
        # chars >= '0'. Hence root true!, true[] and true\x01 remain valid first values.
        if following and ord(following) >= ord("0") and _identifier_part(following):
            _fail()
        return value

    def number(self, *, root: bool) -> int | float:
        start = self.position
        negative = self.peek() == "-"
        if negative:
            self.position += 1
        digit_start = self.position
        first = self.peek()
        if first == "0":
            self.position += 1
            if "0" <= self.peek() <= "9":
                _fail()
        elif "1" <= first <= "9":
            while "0" <= self.peek() <= "9":
                self.position += 1
        else:
            _fail()
        integer_digits = self.position - digit_start
        fraction_digits: int | None = None
        exponent_digits: int | None = None
        if self.peek() == ".":
            self.position += 1
            fraction_start = self.position
            while "0" <= self.peek() <= "9":
                self.position += 1
            fraction_digits = self.position - fraction_start
            if fraction_digits == 0:
                _fail()
        if self.peek() in ("e", "E"):
            self.position += 1
            if self.peek() in ("+", "-"):
                self.position += 1
            exponent_start = self.position
            while "0" <= self.peek() <= "9":
                self.position += 1
            exponent_digits = self.position - exponent_start
            if exponent_digits == 0:
                _fail()

        if root and self.peek() and self.peek() not in _WHITESPACE:
            _fail()
        floating = fraction_digits is not None or exponent_digits is not None
        if floating:
            # ParserBase.resetFloat validates intLen + fractLen + expLen. The
            # slow ReaderBased._parseNumber2 initializes absent parts to -1,
            # whereas _parseFloat's fast path initializes them to 0.
            slow = first == "0" or self.position == self.length
            if self.reader_buffered:
                start_units = self.units_offset(start)
                end_units = self.units_offset(self.position)
                buffer_end = (start_units // _READER_BUFFER_UNITS + 1) * _READER_BUFFER_UNITS
                slow = slow or end_units >= buffer_end
            absent = -1 if slow else 0
            checked_digits = (
                integer_digits
                + (fraction_digits if fraction_digits is not None else absent)
                + (exponent_digits if exponent_digits is not None else absent)
            )
        else:
            checked_digits = integer_digits
        if checked_digits > _MAX_NUMBER_DIGITS:
            _fail("Follower JSON number exceeds maximum length.")
        token = self.raw[start : self.position]
        try:
            # Finite JSON lexemes may legitimately overflow IEEE-754 to infinity.
            return float(token) if floating else int(token)
        except (ValueError, OverflowError):
            raise json.JSONDecodeError("Invalid follower JSON number.", "", 0) from None

    def value(self, *, root: bool = False) -> object:
        self.whitespace()
        character = self.peek()
        if character == '"':
            return self.string()
        if character == "{":
            self.position += 1
            return {}
        if character == "[":
            self.position += 1
            return []
        if character == "t":
            return self.literal("true", True)
        if character == "f":
            return self.literal("false", False)
        if character == "n":
            return self.literal("null", None)
        if character == "-" or "0" <= character <= "9":
            return self.number(root=root)
        _fail()

    def decode(self) -> object:
        self.whitespace()
        if self.position == self.length:
            return {}  # ObjectMapper.readTree returns MissingNode for no first token.
        root = self.value(root=True)
        if not isinstance(root, (dict, list)):
            return root
        stack = [_Frame(root)]
        while stack:
            frame = stack[-1]
            self.whitespace()
            character = self.peek()
            closing = "}" if isinstance(frame.value, dict) else "]"
            if frame.state == "separator":
                if character == closing:
                    self.position += 1
                    stack.pop()
                elif character == ",":
                    self.position += 1
                    frame.state = "item"
                else:
                    _fail()
                continue
            if frame.state == "first" and character == closing:
                self.position += 1
                stack.pop()
                continue
            if isinstance(frame.value, dict) and frame.state in ("first", "item"):
                if character != '"':
                    _fail()
                frame.key = self.string(name=True)
                self.whitespace()
                if self.peek() != ":":
                    _fail()
                self.position += 1
                frame.state = "value"
                continue
            value = self.value()
            if isinstance(frame.value, dict):
                if frame.key is None:
                    _fail()
                frame.value[frame.key] = value
            else:
                frame.value.append(value)
            frame.state = "separator"
            if isinstance(value, (dict, list)):
                if len(stack) >= _MAX_DEPTH:
                    _fail("Follower JSON nesting exceeds maximum depth.")
                stack.append(_Frame(value))
        return root


def decode_follower_json(raw: str) -> object:
    """Return the first complete value, leaving following root tokens unread."""
    return _FollowerJsonReader(raw).decode()
