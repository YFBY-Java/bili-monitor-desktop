import { randomBytes, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { createRuntimeEnvelope } from "@bmd/contracts"
import { LocalCoreRuntime, type BilibiliFollowerSource } from "@bmd/core-runtime"
import { expect, it } from "vitest"
import { createDesktopBridge } from "../preload/bridge"
import { dispatchBusinessRequest } from "./core-request-router"

// Real preload validation, router, Core and SQLite. Only Electron transport and platform I/O
// are replaced; no browser server, user data, credentials or Bilibili requests are involved.
it("retains the original follower operations through the local boundary, restart and cascade delete", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-workflow-"))
  let timestamp = Date.parse("2026-09-13T04:00:00.000Z")
  let count = 100
  let failure = true
  const calls: string[] = []
  const methods = new Set<string>()
  const source: BilibiliFollowerSource = {
    fetchCard: async ({ mid }) => {
      calls.push(mid)
      if (failure) throw Object.assign(new Error("合成风控错误"), { code: "BILIBILI_RISK_CONTROL", retryable: false })
      return { mid, nickname: "完整链路合成用户", profileUrl: `https://space.bilibili.com/${mid}`,
        followerCount: count, followingCount: 83, fetchedAt: new Date(timestamp).toISOString(),
        sourceEndpoint: "x/web-interface/card", statusCode: 200, durationMs: 1,
        evidenceObject: { objectId: `sha256:${"b".repeat(64)}`, sha256: "b".repeat(64),
          relativePath: "cas/synthetic-workflow.json", sizeBytes: 2, mediaType: "application/json" } }
    },
    fetchRelationStat: async () => { throw new Error("Risk control must not fall back") }
  }
  const options = { dataDirectory: directory, version: "test", schedulerEnabled: false,
    credentialKey: randomBytes(32), now: () => new Date(timestamp), followerSource: source }
  let runtime: LocalCoreRuntime | undefined
  const bridge = createDesktopBridge(async (channel, input) => {
    if (!runtime || !channel.startsWith("bilibili-followers:")) throw new Error("Unexpected test transport request")
    const type = channel.replace(":", ".")
    methods.add(type)
    const id = randomUUID()
    const request = createRuntimeEnvelope({ id, type, timestamp: new Date(timestamp).toISOString(),
      correlationId: id, traceId: id, payload: input })
    const result = await dispatchBusinessRequest(runtime, structuredClone(request))
    expect(result.responseType).toBe(`${type}.result`)
    return structuredClone(result.payload)
  }).bilibiliFollowers
  const advance = () => { timestamp += 2000 }
  try {
    runtime = await LocalCoreRuntime.start(options)
    await expect(bridge.add({ mid: "0" })).rejects.toThrow()
    expect(calls).toEqual([])
    await expect(bridge.add({ mid: "2" })).rejects.toMatchObject({ code: "BILIBILI_RISK_CONTROL" })
    expect((await bridge.list()).total).toBe(0)

    advance()
    failure = false
    const user = await bridge.add({ mid: "2", intervalSeconds: 60 })
    expect(user).toMatchObject({ nickname: "完整链路合成用户", currentFollowerCount: 100,
      followingCount: 83, monitorStatus: "ACTIVE", intervalSeconds: 60, recentTrend: [{ followerCount: 100 }] })
    expect(Date.parse(user.nextCollectAt!)).toBe(timestamp + 60_000)
    expect((await bridge.updateStatus({ userId: user.id, enabled: false })).nextCollectAt).toBe(user.nextCollectAt)
    advance()
    expect(await bridge.updateSettings({ userId: user.id, intervalSeconds: 120 })).toMatchObject({
      monitorStatus: "PAUSED", intervalSeconds: 120, nextCollectAt: user.nextCollectAt
    })
    advance()
    count = 130
    await bridge.refresh({ userId: user.id })
    expect((await bridge.list()).items[0]).toMatchObject({ monitorStatus: "PAUSED", deltaSincePrevious: 30, growthRateSincePrevious: 0.3 })
    expect((await bridge.trend({ userId: user.id })).points.map(point => point.followerCount)).toEqual([100, 130])

    advance()
    count = 140
    const repeated = await bridge.add({ mid: "2", intervalSeconds: 300 })
    expect(repeated).toMatchObject({ id: user.id, monitorStatus: "ACTIVE", intervalSeconds: 300 })
    expect((await bridge.list()).total).toBe(1)
    advance()
    expect(Date.parse((await bridge.updateSettings({ userId: user.id, intervalSeconds: 1 })).nextCollectAt!)).toBe(timestamp + 1000)
    advance()
    failure = true
    await expect(bridge.refresh({ userId: user.id })).rejects.toMatchObject({ code: "BILIBILI_RISK_CONTROL" })
    const failed = (await bridge.list()).items[0]!
    expect(failed).toMatchObject({ currentFollowerCount: 140, lastErrorType: "BILIBILI_RISK_CONTROL", lastSuccessAt: repeated.lastSuccessAt })
    expect(Date.parse(failed.nextCollectAt!)).toBe(timestamp + 300_000)
    expect((await bridge.trend({ userId: user.id })).points).toHaveLength(3)

    advance()
    expect(Date.parse((await bridge.updateStatus({ userId: user.id, enabled: true })).nextCollectAt!)).toBe(timestamp)
    failure = false
    count = 150
    await bridge.refresh({ userId: user.id })
    const saved = (await bridge.list()).items[0]!
    expect(saved.lastErrorType).toBeUndefined()
    const history = await bridge.trends({ userIds: [user.id], limitPerUser: 500 })
    expect(history[0]?.points.map(point => point.followerCount)).toEqual([100, 130, 140, 150])

    await runtime.stop()
    runtime = await LocalCoreRuntime.start(options)
    expect((await bridge.list()).items).toEqual([saved])
    expect(await bridge.trends({ userIds: [user.id] })).toEqual(history)
    expect(await bridge.remove({ userId: user.id })).toEqual({ deleted: true })
    expect((await bridge.list()).items).toEqual([])
    await expect(bridge.trend({ userId: user.id })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await runtime.stop()
    runtime = undefined
    const stored = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
    try {
      expect(stored.prepare("SELECT count(*) AS count FROM bilibili_follower_snapshot WHERE monitor_id = ?").get(user.id)?.count).toBe(0)
    } finally { stored.close() }
    expect([...methods].sort()).toEqual(["add", "delete", "list", "refresh", "trend", "trends", "update-settings", "update-status"].map(method => `bilibili-followers.${method}`).sort())
  } finally { await runtime?.stop(); await rm(directory, { recursive: true, force: true }) }
})
