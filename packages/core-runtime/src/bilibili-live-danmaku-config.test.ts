import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { assertDanmakuTempPath } from "./__fixtures__/danmaku-configuration"
import { loadLiveDanmakuConfiguration } from "./bilibili-live-danmaku-config"

describe("read-only danmaku startup binding and separate scheduled consumption", () => {
  let directory: string
  afterEach(async () => { if (directory) { assertDanmakuTempPath(directory, true); await rm(directory, { recursive: true, force: true }) } })
  async function setup(contents?: string) {
    assertDanmakuTempPath()
    directory = await mkdtemp(resolve(tmpdir(), "bmd-danmaku-loader-"))
    const path = resolve(directory, "config/bilibili-live-danmaku.json")
    if (contents !== undefined) { await mkdir(resolve(directory, "config")); await writeFile(path, contents, "utf8") }
    return path
  }
  it("defaults missing file without writing", async () => {
    await setup()
    expect(await loadLiveDanmakuConfiguration(directory, {}, true)).toEqual({ enabled: true, autoStartEnabled: true, schedulerDelayMs: 5000, maxConnections: 10, protocolVersion: 3, recentMessageLimitPerRoom: 200,
      heartbeatSeconds: 30, connectTimeoutMs: 8000, useLoginCredential: true, webLocation: "444.8", clientVersion: "1.14.3",
      wbiCacheSeconds: 43200, buvidCacheSeconds: 43200, bucketSeconds: 60, listenProbeSeconds: 20 })
    await expect(access(resolve(directory, "config"))).rejects.toMatchObject({ code: "ENOENT" })
  })
  it("binds connection aliases, canonical precedence and raw strings with safe failures", async () => {
    const path = await setup('{}')
    const environment = {
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_HEARTBEAT_SECONDS: "${BMD_SYNTHETIC_MISSING:7}",
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_CONNECT_TIMEOUT_MS: "-2147483648",
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_USE_LOGIN_CREDENTIAL: "off",
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_WEB_LOCATION: " location! ",
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_CLIENT_VERSION: " alias ",
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_WBI_CACHE_SECONDS: "${BMD_SYNTHETIC_MISSING:350}",
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_BUVID_CACHE_SECONDS: "-8",
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_BUCKET_SECONDS: "7200",
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_PROBE_SECONDS: "-8",
      APP_BILIBILI_LIVEMONITOR_DANMAKU_CLIENTVERSION: " version ${BMD_SYNTHETIC_MISSING:2} "
    }
    expect(await loadLiveDanmakuConfiguration(directory, environment, true)).toMatchObject({
      heartbeatSeconds: 7, connectTimeoutMs: -2147483648, useLoginCredential: false,
      webLocation: " location! ", clientVersion: " version 2 ", wbiCacheSeconds: 350, buvidCacheSeconds: -8,
      bucketSeconds: 7200, listenProbeSeconds: -8
    })
    expect(await loadLiveDanmakuConfiguration(directory, { ...environment,
      APP_BILIBILI_LIVEMONITOR_DANMAKU_WBICACHESECONDS: "2147483647",
      APP_BILIBILI_LIVEMONITOR_DANMAKU_BUVIDCACHESECONDS: "-2147483648" }, true))
      .toMatchObject({ wbiCacheSeconds: 2147483647, buvidCacheSeconds: -2147483648 })
    const error = await loadLiveDanmakuConfiguration(directory, { ...environment,
      APP_BILIBILI_LIVEMONITOR_DANMAKU_HEARTBEATSECONDS: "synthetic-private" }, false).catch(error => error)
    expect(error).toMatchObject({ code: "BILIBILI_DANMAKU_CONFIG_INVALID" })
    expect(String(error)).not.toContain("synthetic-private")
    await writeFile(path, JSON.stringify({ webLocation: "{", clientVersion: "a}b" }), "utf8")
    expect(await loadLiveDanmakuConfiguration(directory, {}, true)).toMatchObject({ webLocation: "{", clientVersion: "a}b" })
    const overrides = {
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_CLIENT_VERSION: " override! ",
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_WEB_LOCATION: "${app.bilibili.live-monitor.danmaku.client-version}"
    }
    expect(await loadLiveDanmakuConfiguration(directory, overrides, true)).toMatchObject({ webLocation: " override! ", clientVersion: " override! " })
    expect(await loadLiveDanmakuConfiguration(directory, { ...overrides,
      APP_BILIBILI_LIVEMONITOR_DANMAKU_CLIENTVERSION: " canonical } ${BMD_SYNTHETIC_MISSING:2} " }, true))
      .toMatchObject({ webLocation: " canonical } 2 ", clientVersion: " canonical } 2 " })
    await writeFile(path, JSON.stringify({ webLocation: "", clientVersion: "${BMD_SYNTHETIC_MISSING:a}b" }), "utf8")
    expect(await loadLiveDanmakuConfiguration(directory, {}, true)).toMatchObject({ webLocation: "", clientVersion: "ab" })
  })
  it("binds raw protocol preference with alias and canonical precedence, including zero", async () => {
    await setup('{"protocolVersion":4}')
    expect(await loadLiveDanmakuConfiguration(directory, {}, true)).toMatchObject({ protocolVersion: 4 })
    const alias = { SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_PROTOCOL_VERSION: "${BMD_SYNTHETIC_MISSING:2}" }
    expect(await loadLiveDanmakuConfiguration(directory, alias, true)).toMatchObject({ protocolVersion: 2 })
    expect(await loadLiveDanmakuConfiguration(directory, { ...alias,
      APP_BILIBILI_LIVEMONITOR_DANMAKU_PROTOCOLVERSION: "0" }, true)).toMatchObject({ protocolVersion: 0 })
  })
  it("reads BOM and aliases unchanged and gives canonical properties precedence", async () => {
    const contents = '\uFEFF{"maxConnections":3}', path = await setup(contents)
    expect(await loadLiveDanmakuConfiguration(directory, {
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_ENABLED: "off",
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_AUTO_START_ENABLED: "no",
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_SCHEDULER_DELAY_MS: "250",
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_MAX_CONNECTIONS: "7",
      APP_BILIBILI_LIVEMONITOR_DANMAKU_MAXCONNECTIONS: "2"
    }, true)).toEqual({ enabled: false, autoStartEnabled: false, schedulerDelayMs: 250, maxConnections: 2, protocolVersion: 3, recentMessageLimitPerRoom: 200,
      heartbeatSeconds: 30, connectTimeoutMs: 8000, useLoginCredential: true, webLocation: "444.8", clientVersion: "1.14.3",
      wbiCacheSeconds: 43200, buvidCacheSeconds: 43200, bucketSeconds: 60, listenProbeSeconds: 20 })
    expect(await readFile(path, "utf8")).toBe(contents)
  })
  it.each(["true", "on", "yes", "1", "false", "off", "no", "0"])("binds primitive bool token %s", async value => {
    await setup('{}')
    expect((await loadLiveDanmakuConfiguration(directory, { APP_BILIBILI_LIVEMONITOR_DANMAKU_ENABLED: value }, true)).enabled)
      .toBe(["true", "on", "yes", "1"].includes(value))
  })
  it("gives every canonical property precedence over its legacy alias and disk", async () => {
    await setup('{"enabled":true,"autoStartEnabled":true,"schedulerDelayMs":1000,"maxConnections":9}')
    expect(await loadLiveDanmakuConfiguration(directory, {
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_ENABLED: "true",
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_AUTO_START_ENABLED: "true",
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_SCHEDULER_DELAY_MS: "1000",
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_MAX_CONNECTIONS: "9",
      APP_BILIBILI_LIVEMONITOR_DANMAKU_ENABLED: "false",
      APP_BILIBILI_LIVEMONITOR_DANMAKU_AUTOSTARTENABLED: "false",
      APP_BILIBILI_LIVEMONITOR_DANMAKU_SCHEDULERDELAYMS: "25",
      APP_BILIBILI_LIVEMONITOR_DANMAKU_MAXCONNECTIONS: "2"
    }, true)).toEqual({ enabled: false, autoStartEnabled: false, schedulerDelayMs: 25, maxConnections: 2, protocolVersion: 3, recentMessageLimitPerRoom: 200,
      heartbeatSeconds: 30, connectTimeoutMs: 8000, useLoginCredential: true, webLocation: "444.8", clientVersion: "1.14.3",
      wbiCacheSeconds: 43200, buvidCacheSeconds: 43200, bucketSeconds: 60, listenProbeSeconds: 20 })
  })
  it("reports file I/O failure safely rather than defaulting", async () => {
    const path = await setup()
    await mkdir(path, { recursive: true })
    await expect(loadLiveDanmakuConfiguration(directory, {}, true)).rejects.toMatchObject({ code: "BILIBILI_DANMAKU_CONFIG_INVALID" })
  })
  it("binds the exact original RECENT_LIMIT alias with canonical then disk precedence", async () => {
    const contents = '{"recentMessageLimitPerRoom":75}', path = await setup(contents)
    expect(await loadLiveDanmakuConfiguration(directory, {}, true)).toMatchObject({ recentMessageLimitPerRoom: 75 })
    const alias = { SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_RECENT_LIMIT: "25" }
    expect(await loadLiveDanmakuConfiguration(directory, alias, true)).toMatchObject({ recentMessageLimitPerRoom: 25 })
    expect(await loadLiveDanmakuConfiguration(directory, { ...alias,
      APP_BILIBILI_LIVEMONITOR_DANMAKU_RECENTMESSAGELIMITPERROOM: "21" }, true))
      .toMatchObject({ recentMessageLimitPerRoom: 21 })
    expect(await loadLiveDanmakuConfiguration(directory, {
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_RECENT_MESSAGE_LIMIT_PER_ROOM: "99" }, true))
      .toMatchObject({ recentMessageLimitPerRoom: 75 })
    expect(await readFile(path, "utf8")).toBe(contents)
  })
  it.each([["-2147483648", -2147483648], ["2147483647", 2147483647], ["0", 0], ["19", 19],
    ["20", 20], ["501", 501], ["0x19", 25], ["+25", 25], ["２５", 25], [" 2 5 ", 25]] as const)
    ("binds recent raw original integer %s without applying the service floor", async (value, expected) => {
      await setup('{}')
      expect(await loadLiveDanmakuConfiguration(directory, {
        SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_RECENT_LIMIT: value }, true))
        .toMatchObject({ recentMessageLimitPerRoom: expected })
    })
  it("expands recent placeholders and canonical property references", async () => {
    await setup('{}')
    expect(await loadLiveDanmakuConfiguration(directory, {
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_RECENT_LIMIT: "${BMD_SYNTHETIC_MISSING:${BMD_SYNTHETIC_RECENT:25}}",
      APP_BILIBILI_LIVEMONITOR_DANMAKU_MAXCONNECTIONS: "${app.bilibili.live-monitor.danmaku.recent-message-limit-per-room}"
    }, true)).toMatchObject({ recentMessageLimitPerRoom: 25, maxConnections: 25 })
  })
  it.each(["", "1.5", "2147483648", "-2147483649", "synthetic-private", "PT5S", "+#19"])
    ("rejects invalid recent canonical value safely even when alias is valid and storage=false: %s", async value => {
      await setup('{}')
      const error = await loadLiveDanmakuConfiguration(directory, {
        APP_BILIBILI_LIVEMONITOR_DANMAKU_RECENTMESSAGELIMITPERROOM: value,
        SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_RECENT_LIMIT: "25"
      }, false).catch((caught: unknown) => caught)
      expect(error).toMatchObject({ code: "BILIBILI_DANMAKU_CONFIG_INVALID" })
      expect(String(error)).not.toContain("synthetic-private")
    })
  it.each(['{"recentMessageLimitPerRoom":"synthetic-private"}', '{"recentMessageLimitPerRoom":null}',
    '{"unknown":"synthetic-private"}', 'synthetic-private{'])
    ("validates disk before applying valid recent override: %s", async contents => {
      await setup(contents)
      const error = await loadLiveDanmakuConfiguration(directory, {
        SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_RECENT_LIMIT: "25"
      }, false).catch((caught: unknown) => caught)
      expect(error).toMatchObject({ code: "BILIBILI_DANMAKU_CONFIG_INVALID" })
      expect(String(error)).not.toContain("synthetic-private")
    })
  it.each([["0x10", 16], ["-#f", -15], ["１２", 12], [" 2 5 ", 25], ["-2147483648", -2147483648], ["2147483647", 2147483647]] as const)("binds original int text %s", async (value, expected) => {
    await setup('{}')
    expect((await loadLiveDanmakuConfiguration(directory, { APP_BILIBILI_LIVEMONITOR_DANMAKU_MAXCONNECTIONS: value }, true)).maxConnections).toBe(expected)
  })
  it.each([" 5000 ", "0x10", "PT5S", "0", "-1"])("validates raw scheduled %j even with both flags false", async value => {
    await setup('{"enabled":false,"autoStartEnabled":false}')
    await expect(loadLiveDanmakuConfiguration(directory, { APP_BILIBILI_LIVEMONITOR_DANMAKU_SCHEDULERDELAYMS: value }, true))
      .rejects.toMatchObject({ code: "BILIBILI_DANMAKU_CONFIG_INVALID" })
  })
  it.each([[" 5000 ", 5000], ["0x10", 16], ["0", 0], ["-1", -1]] as const)("storage=false skips only raw scheduled %s", async (value, expected) => {
    await setup('{}')
    expect((await loadLiveDanmakuConfiguration(directory, { APP_BILIBILI_LIVEMONITOR_DANMAKU_SCHEDULERDELAYMS: value }, false)).schedulerDelayMs).toBe(expected)
  })
  it.each(["PT5S", "2147483648", "", "1.5"])("storage=false still rejects invalid int %s", async value => {
    await setup('{}')
    await expect(loadLiveDanmakuConfiguration(directory, { APP_BILIBILI_LIVEMONITOR_DANMAKU_SCHEDULERDELAYMS: value }, false))
      .rejects.toMatchObject({ code: "BILIBILI_DANMAKU_CONFIG_INVALID" })
  })
  it.each(['{"enabled":"false"}', '{"unknown":"synthetic-private"}', 'synthetic-private{'])("does not mask bad file with environment: %s", async contents => {
    await setup(contents)
    const error = await loadLiveDanmakuConfiguration(directory, { APP_BILIBILI_LIVEMONITOR_DANMAKU_ENABLED: "true" }, false).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: "BILIBILI_DANMAKU_CONFIG_INVALID" })
    expect(String(error)).not.toContain("synthetic-private")
  })
  it("expands nested aliases and canonical property references through existing helpers", async () => {
    await setup('{}')
    expect(await loadLiveDanmakuConfiguration(directory, {
      SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_MAX_CONNECTIONS: "${BMD_SYNTHETIC_MISSING:${BMD_SYNTHETIC_COUNT:2}}",
      APP_BILIBILI_LIVEMONITOR_DANMAKU_SCHEDULERDELAYMS: "${app.bilibili.live-monitor.danmaku.max-connections}"
    }, true)).toMatchObject({ maxConnections: 2, schedulerDelayMs: 2 })
  })
  it("rejects circular references and empty primitive booleans even without storage", async () => {
    await setup('{}')
    for (const environment of [{ APP_BILIBILI_LIVEMONITOR_DANMAKU_ENABLED: "" }, {
      APP_BILIBILI_LIVEMONITOR_DANMAKU_MAXCONNECTIONS: "${app.bilibili.live-monitor.danmaku.scheduler-delay-ms}",
      APP_BILIBILI_LIVEMONITOR_DANMAKU_SCHEDULERDELAYMS: "${app.bilibili.live-monitor.danmaku.max-connections}"
    }]) await expect(loadLiveDanmakuConfiguration(directory, environment, false)).rejects.toMatchObject({ code: "BILIBILI_DANMAKU_CONFIG_INVALID" })
  })
})
