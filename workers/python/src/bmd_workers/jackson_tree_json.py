"""Serialize parsed Rank entry trees as the original JsonNode.toString value.

This is distinct from the unmodified HTTP evidence. Unknown fields, exact
integers and scalar/array entries stay in the archive; Double nodes use the
existing observed JDK20 conversion. An explicit stack preserves reader depth.
"""

import json
import math
from typing import Literal

from .java_scalar_text import jdk20_double_text


def jackson_tree_json(value: object) -> str:
    parts: list[str] = []
    stack: list[tuple[Literal["value", "text"], object]] = [("value", value)]
    while stack:
        kind, item = stack.pop()
        if kind == "text":
            if not isinstance(item, str):
                raise TypeError("Invalid JSON serialization token.")
            parts.append(item)
        elif item is None:
            parts.append("null")
        elif isinstance(item, bool):
            parts.append("true" if item else "false")
        elif isinstance(item, str):
            parts.append(json.dumps(item, ensure_ascii=False))
        elif isinstance(item, int):
            parts.append(str(item))
        elif isinstance(item, float):
            text = jdk20_double_text(item)
            parts.append(text if math.isfinite(item) else json.dumps(text))
        elif isinstance(item, list):
            parts.append("[")
            stack.append(("text", "]"))
            for index in range(len(item) - 1, -1, -1):
                stack.append(("value", item[index]))
                if index:
                    stack.append(("text", ","))
        elif isinstance(item, dict):
            parts.append("{")
            stack.append(("text", "}"))
            entries = list(item.items())
            for index in range(len(entries) - 1, -1, -1):
                key, child = entries[index]
                if not isinstance(key, str):
                    raise TypeError("Parsed JSON keys must be strings.")
                stack.extend(
                    [("value", child), ("text", ":"), ("text", json.dumps(key, ensure_ascii=False))]
                )
                if index:
                    stack.append(("text", ","))
        else:
            raise TypeError("Unsupported parsed JSON value.")
    return "".join(parts)
