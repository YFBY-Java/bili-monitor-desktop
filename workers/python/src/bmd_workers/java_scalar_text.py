"""Scalar asText semantics for the observed JDK20 ordinary binary64 baseline."""

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class _Decimal:
    digits: str
    exponent: int

    def rational(self) -> tuple[int, int]:
        significand = int(self.digits)
        if self.exponent < 0:
            return significand, 10**-self.exponent
        return significand * 10**self.exponent, 1


def _canonical_decimal(text: str) -> _Decimal:
    mantissa, _, scientific_exponent = text.partition("e")
    integer, point, fraction = mantissa.partition(".")
    digits = (integer + fraction).lstrip("0")
    exponent = int(scientific_exponent or "0") - (len(fraction) if point else 0)
    stripped = digits.rstrip("0")
    return _Decimal(stripped, exponent + len(digits) - len(stripped))


def _nearest_decimal(value: float, anchor: _Decimal) -> _Decimal:
    numerator, denominator = value.as_integer_ratio()
    precision = len(anchor.digits)
    best = anchor
    best_numerator, best_denominator = best.rational()
    best_distance = abs(best_numerator * denominator - numerator * best_denominator)
    # repr supplies the shortest precision and an anchor, not the final choice.
    # All roundtripping positive decimals lie in [x/2, 3x/2], including the
    # minimum subnormal. Their canonical exponents differ from the anchor by
    # at most two for the allowed precision (p=1 additionally permits p=2).
    for exponent in range(anchor.exponent - 2, anchor.exponent + 3):
        if precision == 1:
            significands: range | tuple[int, int] = range(1, 100)
        else:
            # At a fixed exponent only the two neighbors of the exact binary
            # rational can minimize distance; this avoids a 10**p enumeration.
            scaled_numerator = numerator * 10 ** max(-exponent, 0)
            scaled_denominator = denominator * 10 ** max(exponent, 0)
            lower = scaled_numerator // scaled_denominator
            significands = (lower, lower + 1)
        for significand in significands:
            if significand <= 0 or significand % 10 == 0:
                continue
            digits = str(significand)
            if precision >= 2 and len(digits) != precision:
                continue
            if float(f"{significand}e{exponent}") != value:
                continue
            candidate = _Decimal(digits, exponent)
            candidate_numerator, candidate_denominator = candidate.rational()
            distance = abs(candidate_numerator * denominator - numerator * candidate_denominator)
            comparison = distance * best_denominator - best_distance * candidate_denominator
            if comparison < 0 or (
                comparison == 0 and significand % 2 == 0 and int(best.digits) % 2 != 0
            ):
                best = candidate
                best_denominator = candidate_denominator
                best_distance = distance
    return best


def _java_decimal_layout(decimal: _Decimal) -> str:
    digits, exponent = decimal.digits, decimal.exponent
    order = exponent + len(digits) - 1
    if order < -3 or order >= 7:
        return f"{digits[0]}.{digits[1:] or '0'}E{order}"
    point = len(digits) + exponent
    if point <= 0:
        return "0." + "0" * -point + digits
    if point >= len(digits):
        return digits + "0" * (point - len(digits)) + ".0"
    return digits[:point] + "." + digits[point:]


def jdk20_double_text(value: float) -> str:
    """Use exact distance/even ties and JDK20's layout for a decoded Double."""
    if math.isnan(value):
        return "NaN"
    if math.isinf(value):
        return "-Infinity" if value < 0 else "Infinity"
    if value == 0:
        return "-0.0" if math.copysign(1, value) < 0 else "0.0"
    magnitude = abs(value)
    decimal = _nearest_decimal(magnitude, _canonical_decimal(repr(magnitude)))
    return ("-" if value < 0 else "") + _java_decimal_layout(decimal)


def java_scalar_text(value: object) -> str | None:
    """Convert scalar types only; each caller keeps its own blank/fallback rule."""
    if isinstance(value, str):
        return value
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return jdk20_double_text(value)
    return None
