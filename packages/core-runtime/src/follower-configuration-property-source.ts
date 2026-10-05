import { lookupFollowerEnvironment } from "./follower-configuration-placeholders"

function canonicalName(name: string): string | undefined {
  if (name.startsWith(".") || name.endsWith(".")) return undefined
  const elements = name.split(".").filter(element => element.length !== 0)
  if (elements.length === 0 || elements.some(element => !/^[a-z0-9][a-z0-9-]*$/u.test(element))) return undefined
  return elements.join(".")
}

function canonicalUniformName(name: string): string | undefined {
  return canonicalName(name)?.replace(/-/gu, "")
}

interface SourceElement { value: string; indexed: boolean }

/** Source brackets separate elements; they are not ordinary punctuation to remove. */
function sourceElements(name: string, separator: "." | "_"): SourceElement[] {
  const elements: SourceElement[] = []
  let start = 0
  let depth = 0
  function add(end: number, indexed: boolean): void {
    const value = name.slice(start, end)
    if (value.length === 0) return
    if (!indexed && !/[a-z0-9]/u.test(value.toLowerCase()) && !value.slice(1).includes("-")) return
    elements.push({ value, indexed })
  }
  for (let index = 0; index < name.length; index++) {
    const character = name[index]
    if (character === "[") {
      if (depth === 0) { add(index, false); start = index + 1 }
      depth++
    } else if (character === "]" && depth > 0) {
      depth--
      if (depth === 0) { add(index, true); start = index + 1 }
    } else if (character === separator && depth === 0) {
      add(index, false); start = index + 1
    }
  }
  add(name.length, false)
  return elements
}

function scalarUniformElements(elements: SourceElement[]): string | undefined {
  const values: string[] = []
  for (const element of elements) {
    // An indexed token is case-sensitive and retains '-', unlike an ordinary
    // scalar. Only a literal uniform token can equal one of our known fields.
    if (element.indexed && !/^[a-z0-9]+$/u.test(element.value)) return undefined
    values.push(element.indexed ? element.value : element.value.toLowerCase().replace(/[^a-z0-9]/gu, ""))
  }
  return values.join(".")
}

/** Scalar source keys only: '_' is the system mapper separator, '.' the fallback. */
function enumerableUniformName(name: string): string | undefined {
  const systemElements: SourceElement[] = []
  for (const segment of sourceElements(name, "_")) {
    const elements = sourceElements(segment.value.toLowerCase(), ".")
    // The system mapper's processed value must be exactly one element. A
    // boundary dot can still leave one; an interior dot can trigger fallback.
    if (elements.length !== 1) return scalarUniformElements(sourceElements(name, "."))
    const element = elements[0]
    if (element !== undefined) systemElements.push(element)
  }
  return scalarUniformElements(systemElements)
}

/** The caller supplies one of the existing follower scalar property names. */
export function lookupFollowerCanonicalEnvironment(
  environment: NodeJS.ProcessEnv,
  name: string
): string | undefined {
  const normalizedName = canonicalName(name)
  if (normalizedName === undefined) return undefined
  const uniformName = normalizedName.replace(/-/gu, "")
  const modern = uniformName.replace(/\./gu, "_").toUpperCase()
  const legacy = normalizedName.replace(/[.-]/gu, "_").toUpperCase()
  for (const candidate of [modern, legacy, normalizedName]) {
    const value = lookupFollowerEnvironment(environment, candidate)
    if (value !== undefined) return value
  }
  // No flattened canonical-value cache: the original query spelling affects the
  // fast candidates. Multiple same-layer enumerable collisions remain unaudited.
  for (const sourceName of Object.keys(environment)) {
    if (enumerableUniformName(sourceName) !== uniformName) continue
    const value = lookupFollowerEnvironment(environment, sourceName)
    if (value !== undefined) return value
  }
  return undefined
}

/** Only known follower fields participate in the adapted source; other refs stay raw. */
export function createFollowerPropertyLookup(
  environment: NodeJS.ProcessEnv,
  properties: ReadonlyMap<string, string>,
  knownPropertyNames: readonly string[]
): (name: string) => string | undefined {
  return name => {
    const uniformName = canonicalUniformName(name)
    if (uniformName !== undefined && knownPropertyNames.some(known => canonicalUniformName(known) === uniformName)) {
      const environmentValue = lookupFollowerCanonicalEnvironment(environment, name)
      if (environmentValue !== undefined) return environmentValue
      const exact = properties.get(name)
      if (exact !== undefined) return exact
      for (const [sourceName, value] of properties) {
        if (canonicalUniformName(sourceName) === uniformName) return value
      }
    }
    return lookupFollowerEnvironment(environment, name)
  }
}
