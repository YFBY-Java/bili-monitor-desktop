import { randomBytes } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { expect, it, vi } from "vitest"

import { LocalCoreRuntime } from "./local-core-runtime"

it("honors a one-second follower interval with Core scheduling while retaining the global request throttle", async () => {
  // BilibiliView.vue used a 1-second due timer; the desktop must retain it after the page closes.
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-scheduler-"))
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-05T02:00:00.000Z"))
  let calls = 0
  const runtime = await LocalCoreRuntime.start({
    dataDirectory: directory, version: "test", credentialKey: randomBytes(32),
    followerSource: {
      fetchCard: async ({ mid }) => {
        calls += 1
        return { mid, nickname: "定时采集测试", profileUrl: `https://space.bilibili.com/${mid}`,
          followerCount: 100 + calls, fetchedAt: new Date().toISOString(),
          sourceEndpoint: "x/web-interface/card", statusCode: 200, durationMs: 1,
          evidenceObject: { objectId: `sha256:${"b".repeat(64)}`, sha256: "b".repeat(64),
            relativePath: "cas/test.json", sizeBytes: 1, mediaType: "application/json" } }
      },
      fetchRelationStat: async () => { throw new Error("Unexpected fallback") }
    }
  })
  try {
    const user = await runtime.addBilibiliFollowerMonitor({ mid: "2", intervalSeconds: 1 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls).toBe(1) // Core has scheduled it; the 1500ms endpoint throttle still applies.
    await vi.advanceTimersByTimeAsync(500)
    expect(calls).toBe(2)
    expect(runtime.listBilibiliFollowerMonitors().items[0]).toMatchObject({ currentFollowerCount: 102 })
    runtime.updateBilibiliFollowerMonitorStatus(user.id, false)
    await vi.advanceTimersByTimeAsync(2000)
    expect(calls).toBe(2)
  } finally {
    await runtime.stop()
    vi.useRealTimers()
    await rm(directory, { recursive: true, force: true })
  }
})

it("closes Core during a reserved follower request and resumes the saved due time after restart", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-stop-restart-"))
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-13T04:00:00.000Z"))
  let calls = 0
  const options = { dataDirectory: directory, version: "test", credentialKey: randomBytes(32),
    followerSource: {
      fetchCard: async ({ mid }: { mid: string }) => {
        calls++
        return { mid, nickname: "重启排程合成用户", profileUrl: `https://space.bilibili.com/${mid}`,
          followerCount: 100 + calls, fetchedAt: new Date().toISOString(),
          sourceEndpoint: "x/web-interface/card" as const, statusCode: 200, durationMs: 1,
          evidenceObject: { objectId: `sha256:${"b".repeat(64)}`, sha256: "b".repeat(64),
            relativePath: "cas/synthetic-restart.json", sizeBytes: 2, mediaType: "application/json" } }
      },
      fetchRelationStat: async () => { throw new Error("Unexpected fallback") }
    }
  }
  let runtime: LocalCoreRuntime | undefined
  try {
    runtime = await LocalCoreRuntime.start(options)
    const user = await runtime.addBilibiliFollowerMonitor({ mid: "2", intervalSeconds: 1 })
    await vi.advanceTimersByTimeAsync(1000) // The next collection is waiting for its 1500ms slot.
    await runtime.stop()
    runtime = undefined
    await vi.advanceTimersByTimeAsync(10_000)
    expect(calls).toBe(1)
    runtime = await LocalCoreRuntime.start(options)
    expect(runtime.listBilibiliFollowerMonitors().items).toEqual([user])
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls).toBe(2)
    const refreshed = runtime.listBilibiliFollowerMonitors().items[0]!
    expect(refreshed).toMatchObject({ id: user.id, currentFollowerCount: 102 })
    expect(refreshed.lastErrorType).toBeUndefined()
    runtime.updateBilibiliFollowerMonitorStatus(user.id, false)
    await runtime.stop()
    runtime = await LocalCoreRuntime.start(options)
    await vi.advanceTimersByTimeAsync(3000)
    expect(calls).toBe(2)
    expect(runtime.listBilibiliFollowerMonitors().items[0]?.monitorStatus).toBe("PAUSED")
  } finally {
    await runtime?.stop()
    vi.useRealTimers()
    await rm(directory, { recursive: true, force: true })
  }
})
