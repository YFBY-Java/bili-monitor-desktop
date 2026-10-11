/** Jackson String JSON passes through pgjdbc UTF8 encoding before JSONB. */
export function serializeJacksonPostgresJson(value: unknown, scope: "Subject" | "Bilibili API log"): string {
  const json = JSON.stringify(value)
  if (json === undefined) throw new Error(`${scope} JSON storage value is not serializable.`)
  // Consume whole escapes: a literal backslash-u string is not a Unicode escape.
  // JSON.stringify escapes isolated UTF16, while Jackson's String writer leaves
  // those units raw and pgjdbc encodes them as '?'. Valid emoji pairs stay intact.
  return json.replace(/\\(?:["\\/bfnrt]|u[\da-fA-F]{4})/g, escape => {
    if (!escape.startsWith("\\u")) return escape
    const unit = Number.parseInt(escape.slice(2), 16)
    if (unit === 0) throw new Error(`${scope} JSON storage contains NUL.`)
    return unit >= 0xd800 && unit <= 0xdfff ? "?" : escape
  })
}
