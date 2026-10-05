function placeholderEnd(value: string, start: number): number {
  let nestedBraces = 0
  for (let index = start + 2; index < value.length; index++) {
    if (value[index] === "}") {
      if (nestedBraces === 0) return index
      nestedBraces--
    } else if (value[index] === "{") {
      nestedBraces++
    }
  }
  return -1
}

/** Original Binder is missing-tolerant; Environment and @Scheduled are strict. */
export function resolveFollowerPlaceholders(
  value: string,
  lookup: (name: string) => string | undefined,
  strict: boolean
): string {
  const active = new Set<string>()

  function expand(input: string): string {
    let result = input
    let start = result.indexOf("${")
    while (start !== -1) {
      const end = placeholderEnd(result, start)
      if (end === -1) break
      const original = result.slice(start + 2, end)
      if (active.has(original)) throw new Error("Circular follower configuration placeholder")
      active.add(original)

      // Expand the entire interior, including its default, before consulting the
      // source. A present property does not bypass an unresolved strict default.
      const name = expand(original)
      let replacement = lookup(name)
      if (replacement === undefined) {
        const separator = name.indexOf(":")
        if (separator !== -1) {
          replacement = lookup(name.slice(0, separator)) ?? name.slice(separator + 1)
        }
      }
      if (replacement !== undefined) {
        replacement = expand(replacement)
        result = result.slice(0, start) + replacement + result.slice(end + 1)
        // Do not rescan a new token assembled across neighboring replacements.
        start = result.indexOf("${", start + replacement.length)
      } else if (strict) {
        throw new Error("Unresolved follower configuration placeholder")
      } else {
        // Keep the original token, not the possibly expanded dynamic name.
        start = result.indexOf("${", end + 1)
      }
      active.delete(original)
    }
    return result
  }

  return expand(value)
}

export function lookupFollowerEnvironment(
  environment: NodeJS.ProcessEnv,
  name: string
): string | undefined {
  for (const variant of [name, name.toUpperCase()]) {
    const candidates = [variant, variant.replace(/\./gu, "_"), variant.replace(/-/gu, "_"),
      variant.replace(/[.-]/gu, "_")]
    for (const candidate of candidates) {
      if (!Object.hasOwn(environment, candidate)) continue
      const value = environment[candidate]
      if (value !== undefined) return value
    }
  }
  return undefined
}
