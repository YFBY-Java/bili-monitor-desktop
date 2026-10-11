/** Direct TEXT parameters match the observed pgjdbc UTF8 encoding boundary. */
export function postgresStoredText(value: string, entity: "Follower" | "Subject" | "Rank"): string {
  if (value.includes("\0")) throw new Error(`${entity} storage text contains NUL.`)
  let stored = ""
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        stored += value.slice(index, index + 2)
        index += 1
      } else stored += "?"
    } else stored += unit >= 0xdc00 && unit <= 0xdfff ? "?" : value[index]
  }
  return stored
}
