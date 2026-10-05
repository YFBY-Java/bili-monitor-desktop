import { describe, expect, it } from "vitest"
import { createFollowerPropertyLookup, lookupFollowerCanonicalEnvironment } from "./follower-configuration-property-source"

const prefix = "app.bilibili.follower-monitor."
const known = ["enabled", "storage-enabled", "scheduler-delay-ms", "due-batch-size", "default-interval-seconds",
  "min-interval-seconds", "max-interval-seconds", "short-interval-warning-seconds", "failure-backoff-seconds",
  "request-min-interval-ms", "max-attempts", "retry-backoff-ms", "connect-timeout-ms", "read-timeout-ms",
  "user-agent", "referer"].map(field => prefix + field)
const name = prefix + "due-batch-size"
const uniformName = "app.bilibili.followermonitor.duebatchsize"
const modern = "APP_BILIBILI_FOLLOWERMONITOR_DUEBATCHSIZE"
const legacy = "APP_BILIBILI_FOLLOWER_MONITOR_DUE_BATCH_SIZE"

function create(environment: NodeJS.ProcessEnv = {}, properties: ReadonlyMap<string, string> = new Map([[name, "24"]])) {
  return createFollowerPropertyLookup(environment, properties, known)
}

describe("bounded follower property-source lookup", () => {
  it("keeps modern, legacy and local source priority for a canonical reference", () => {
    expect(create({ [modern]: "21", [legacy]: "22", [name]: "23" })(name)).toBe("21")
    expect(create({ [legacy]: "22", [name]: "23" })(name)).toBe("22")
    expect(create({ [name]: "23" })(name)).toBe("23")
    expect(create()(name)).toBe("24")
  })

  it("does not flatten legacy values across dash-equivalent queries", () => {
    const lookup = create({ [legacy]: "22", [name]: "23" })
    expect(lookup(name)).toBe("22")
    expect(lookup(uniformName)).toBe("23")
    expect(create({ [legacy]: "22" })(uniformName)).toBe("24")
  })

  it("finds the same modern value for all valid dash-equivalent known queries", () => {
    const lookup = create({ [modern]: "21", [legacy]: "22", [name]: "23" })
    for (const query of [name, uniformName, prefix + "duebatchsize", "app.bilibili.followermonitor.due-batch-size"]) {
      expect(lookup(query)).toBe("21")
    }
  })

  it("ignores internal empty dot segments in an otherwise canonical known query", () => {
    const query = "app..bilibili.follower-monitor..due-batch-size"
    expect(create({ [modern]: "21" })(query)).toBe("21")
    expect(create({ [legacy]: "22" })(query)).toBe("22")
    expect(create()(query)).toBe("24")
  })

  it.each(known)("allows direct environment overrides for the known field %j", query => {
    const key = query.replace(/-/gu, "").replace(/\./gu, "_").toUpperCase()
    expect(create({ [key]: "environment" }, new Map())(query)).toBe("environment")
  })

  it.each([
    name,
    prefix + "dueBatchSize",
    prefix + "due_batch_size",
    uniformName,
    "app_bilibili_followermonitor_duebatchsize",
    "App_Bilibili_FollowerMonitor_DueBatchSize",
    "APP.BILIBILI.FOLLOWER-MONITOR.DUE-BATCH-SIZE",
    "_APP__BILIBILI_FOLLOWERMONITOR_DUEBATCHSIZE_",
    "APP_BILIBILI_FOLLOWER-MONITOR_DUE-BATCH-SIZE",
    "APP_BILIBILI_FOLLOWER!MONITOR_DUE$BATCHSIZE"
  ])("adapts a single enumerable source key %j before the local source", source => {
    expect(create({ [source]: "23" })(name)).toBe("23")
  })

  it.each([
    "APP._BILIBILI_FOLLOWERMONITOR_DUEBATCHSIZE",
    ".APP_BILIBILI_FOLLOWERMONITOR_DUEBATCHSIZE."
  ])("keeps the underscore mapper when boundary dots leave each segment singular: %j", source => {
    expect(create({ [source]: "23" })(name)).toBe("23")
  })

  it("keeps a pure bracketed underscore leaf that the system mapper turns into a scalar", () => {
    const environment = { "APP_BILIBILI_FOLLOWERMONITOR_[DUEBATCHSIZE]": "23" }
    expect(create(environment)(name)).toBe("23")
    expect(lookupFollowerCanonicalEnvironment(environment, name)).toBe("23")
  })

  it("does not flatten a dotted indexed leaf into a known scalar field", () => {
    const environment = { "app.bilibili.follower-monitor.[due-batch-size]": "23" }
    expect(create(environment)(name)).toBe("24")
    expect(lookupFollowerCanonicalEnvironment(environment, name)).toBeUndefined()
  })

  it("does not concatenate embedded bracket components into a known scalar field", () => {
    const environment = { "APP_BILIBILI_FOLLOWERMONITOR_DUE[BATCH]SIZE": "23" }
    expect(create(environment)(name)).toBe("24")
    expect(lookupFollowerCanonicalEnvironment(environment, name)).toBeUndefined()
  })

  it.each([
    "APP_BILIBILI_FOLLOWERMONITOR_DUE_BATCH_SIZE",
    "APP_BILIBILI_FOLLOWER_MONITOR_DUEBATCHSIZE"
  ])("does not merge separate underscore segments in %j", source => {
    expect(create({ [source]: "23" })(name)).toBe("24")
    expect(lookupFollowerCanonicalEnvironment({ [source]: "23" }, name)).toBeUndefined()
  })

  it("finds a lowercase legacy key through the original raw query, not enumeration", () => {
    const environment = { app_bilibili_follower_monitor_due_batch_size: "23" }
    expect(create(environment)(name)).toBe("23")
    expect(create(environment)(uniformName)).toBe("24")
  })

  it.each([
    prefix + "dueBatchSize",
    prefix + "due_batch_size",
    "APP.BILIBILI.FOLLOWER-MONITOR.DUE-BATCH-SIZE",
    " " + name,
    name + " ",
    "." + name,
    name + "."
  ])("does not relax the query syntax itself: %j", query => {
    expect(create({ [modern]: "21" })(query)).toBeUndefined()
  })

  it("still resolves a noncanonical query through its exact raw environment entry", () => {
    const query = prefix + "dueBatchSize"
    expect(create({ [query]: "raw-exact", [modern]: "adapted" })(query)).toBe("raw-exact")
  })

  it("does not treat Java-only initializers as a published local property", () => {
    expect(create()(prefix + "max-attempts")).toBeUndefined()
    expect(create({}, new Map([[prefix + "max-attempts", "4"]]))(prefix + "maxattempts")).toBe("4")
    expect(create({ APP_BILIBILI_FOLLOWERMONITOR_MAXATTEMPTS: "5" })(prefix + "max-attempts")).toBe("5")
  })

  it("returns local raw templates without binding or expanding them", () => {
    expect(create({}, new Map([[name, "${SYNTHETIC_ALIAS:10}"]]))(name)).toBe("${SYNTHETIC_ALIAS:10}")
  })

  it("keeps empty higher-priority values instead of consulting the local source", () => {
    expect(create({ [modern]: "", [legacy]: "22" })(name)).toBe("")
    expect(create({ [legacy]: "", [name]: "23" })(name)).toBe("")
    expect(create({ [prefix + "dueBatchSize"]: "" })(name)).toBe("")
    expect(create({}, new Map([[name, ""]]))(uniformName)).toBe("")
  })

  it("leaves fields outside the known set to raw environment lookup only", () => {
    const unknown = "other.root-setting"
    expect(create({ OTHER_ROOTSETTING: "adapted-only" }, new Map([[unknown, "local"]]))(unknown)).toBeUndefined()
    expect(create({ OTHER_ROOT_SETTING: "raw" }, new Map([[unknown, "local"]]))(unknown)).toBe("raw")
  })

  it("does not infer adjacent modules or arbitrary local settings", () => {
    const adjacent = "app.bilibili.live-monitor.due-batch-size"
    expect(create({ APP_BILIBILI_LIVEMONITOR_DUEBATCHSIZE: "adapted-only" })(adjacent)).toBeUndefined()
    expect(create({ SYNTHETIC_ALIAS: "raw" })("SYNTHETIC_ALIAS")).toBe("raw")
    expect(create()("SYNTHETIC_MISSING")).toBeUndefined()
  })

  it("does not access inherited environment values", () => {
    const environment: NodeJS.ProcessEnv = {}
    Object.setPrototypeOf(environment, { [modern]: "inherited", SYNTHETIC_ALIAS: "inherited" })
    expect(create(environment)(name)).toBe("24")
    expect(create(environment)("SYNTHETIC_ALIAS")).toBeUndefined()
    expect(create(environment)("toString")).toBeUndefined()
  })

  it("looks up source values sequentially without rewriting or storing expanded data", () => {
    const environment = { [modern]: "21" }
    const properties = new Map([[name, "24"]])
    const lookup = create(environment, properties)
    expect(lookup(name)).toBe("21")
    environment[modern] = "25"
    expect(lookup(name)).toBe("25")
    expect(properties.get(name)).toBe("24")
  })
})

describe("canonical follower environment lookup", () => {
  it("checks modern then legacy then the original raw name before enumeration", () => {
    expect(lookupFollowerCanonicalEnvironment({ [modern]: "21", [legacy]: "22", [name]: "23" }, name)).toBe("21")
    expect(lookupFollowerCanonicalEnvironment({ [legacy]: "22", [name]: "23" }, name)).toBe("22")
    expect(lookupFollowerCanonicalEnvironment({ [name]: "23" }, name)).toBe("23")
  })

  it("uses raw SystemEnvironment candidate lookup for each fast-path name", () => {
    expect(lookupFollowerCanonicalEnvironment({ "APP.BILIBILI.FOLLOWER-MONITOR.DUE-BATCH-SIZE": "raw-upper" }, name))
      .toBe("raw-upper")
  })

  it("does not apply canonical adaptation to invalid names", () => {
    expect(lookupFollowerCanonicalEnvironment({ [modern]: "21" }, prefix + "dueBatchSize")).toBeUndefined()
  })

  it("returns undefined when no environment source defines the field", () => {
    expect(lookupFollowerCanonicalEnvironment({}, name)).toBeUndefined()
  })
})
