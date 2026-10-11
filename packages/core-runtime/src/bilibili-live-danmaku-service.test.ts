import type { BilibiliCredential } from "@bmd/contracts"
import { randomUUID } from "node:crypto"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  BilibiliLiveDanmakuService,
  type BilibiliLiveDanmakuSource,
  type BilibiliLiveDanmakuSourceEvent
} from "./bilibili-live-danmaku-service"
import { danmakuConfigurationFixture } from "./__fixtures__/danmaku-configuration"

type RetentionCleanup = () => void | Promise<void>
type RetentionResourceOwner = { cleanups: RetentionCleanup[]; disposed: boolean; cleanupErrors: unknown[]; cleanupPromise: Promise<void> | undefined }
const resourceOwner = (): RetentionResourceOwner => ({ cleanups: [], disposed: false, cleanupErrors: [], cleanupPromise: undefined })
function cleanRetentionResources(owner: RetentionResourceOwner): Promise<void> {
  if (owner.cleanupPromise) return owner.cleanupPromise
  owner.disposed = true
  const owned = owner.cleanups.splice(0).reverse()
  owner.cleanupPromise = (async () => {
    for (const cleanup of owned) {
      try { await cleanup() } catch (error) { owner.cleanupErrors.push(error) }
    }
  })()
  return owner.cleanupPromise
}
async function withRetentionResources(operation: (own: (cleanup: RetentionCleanup) => Promise<void>) => Promise<void>, owner = resourceOwner()): Promise<void> {
  const errors: unknown[] = []
  try { await operation(async cleanup => {
    if (owner.disposed) {
      await cleanup()
      throw new Error("Retention resource acquired after teardown")
    }
    owner.cleanups.push(cleanup)
  }) } catch (error) { errors.push(error) }
  await cleanRetentionResources(owner)
  errors.push(...owner.cleanupErrors)
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, "Retention test and resource cleanup failed")
}

describe("retention resource cleanup fault injection", () => {
  it.each(["seed", "open", "construct"] as const)("cleans acquired resources and restores globals after %s setup failure", async phase => {
    const failure = new Error(`synthetic ${phase}`), calls: string[] = []
    const original = process.env.BMD_RETENTION_CLEANUP_SYNTHETIC
    const target = { method: () => "original" }
    try {
      const error = await withRetentionResources(async own => {
        await own(() => { calls.push("mocks"); vi.restoreAllMocks() })
        await own(() => { calls.push("env"); vi.unstubAllEnvs() })
        vi.stubEnv("BMD_RETENTION_CLEANUP_SYNTHETIC", "synthetic")
        vi.spyOn(target, "method").mockReturnValue("stubbed")
        await own(() => { calls.push("fixture") })
        if (phase === "seed") throw failure
        if (phase === "open") throw failure
        await own(() => { calls.push("database") })
        throw failure
      }).catch((caught: unknown) => caught)
      expect(error).toBe(failure)
      expect(calls).toEqual(phase === "construct" ? ["database", "fixture", "env", "mocks"] : ["fixture", "env", "mocks"])
      expect(process.env.BMD_RETENTION_CLEANUP_SYNTHETIC).toBe(original)
      expect(target.method()).toBe("original")
    } finally { vi.unstubAllEnvs(); vi.restoreAllMocks() }
  })
  it("continues every cleanup after stop and close errors and preserves all error identities", async () => {
    const primary = new Error("primary"), stop = new Error("stop"), close = new Error("close"), calls: string[] = []
    const error = await withRetentionResources(async own => {
      await own(() => { calls.push("mocks") })
      await own(() => { calls.push("env") })
      await own(() => { calls.push("fixture"); throw close })
      await own(() => { calls.push("database") })
      await own(() => { calls.push("stop"); throw stop })
      throw primary
    }).catch((caught: unknown) => caught)
    expect(calls).toEqual(["stop", "database", "fixture", "env", "mocks"])
    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError)) throw new Error("Expected aggregate cleanup evidence")
    expect(error.errors).toHaveLength(3)
    expect(error.errors[0]).toBe(primary)
    expect(error.errors[1]).toBe(stop)
    expect(error.errors[2]).toBe(close)
  })
  it("preserves a sole cleanup error by identity and clears ownership before awaiting cleanup", async () => {
    const stop = new Error("stop"), calls: string[] = []
    const error = await withRetentionResources(async own => {
      await own(() => { calls.push("env") })
      await own(async () => { calls.push("stop"); await Promise.resolve(); throw stop })
    }).catch((caught: unknown) => caught)
    expect(error).toBe(stop)
    expect(calls).toEqual(["stop", "env"])
  })
  it("cleans a pending body's acquired resources during teardown and does not repeat cleanup after it settles", async () => {
    const owner = resourceOwner(), laterOwner = resourceOwner(), calls: string[] = []
    let release = () => {}, ready = () => {}
    const pending = new Promise<void>(resolve => { release = resolve })
    const acquired = new Promise<void>(resolve => { ready = resolve })
    const running = withRetentionResources(async own => {
      await own(() => { calls.push("env") })
      await own(() => { calls.push("database") })
      await own(() => { expect(owner.cleanups).toEqual([]); calls.push("stop") })
      ready()
      await pending
    }, owner)
    await acquired
    await withRetentionResources(async () => {}, owner) // The same fallback invoked by afterEach.
    laterOwner.cleanups.push(() => { calls.push("later") })
    release()
    await running
    expect(calls).toEqual(["stop", "database", "env"])
    expect(laterOwner.cleanups).toHaveLength(1)
    await withRetentionResources(async () => {}, laterOwner)
    expect(calls).toEqual(["stop", "database", "env", "later"])
  })
})

describe("BilibiliLiveDanmakuService", () => {
  let activeRetentionOwner: RetentionResourceOwner | undefined
  afterEach(async () => {
    const owner = activeRetentionOwner
    activeRetentionOwner = undefined
    if (owner) await withRetentionResources(async () => {}, owner)
  })
  it.each([[-1, 20], [1, 20], [19, 20], [20, 20], [25, 25], [501, 501]] as const)
    ("forwards raw recent %i as effective %i on qualifying messages without changing heartbeat admission", async (raw, effective) => {
      const owner = resourceOwner()
      activeRetentionOwner = owner
      await withRetentionResources(async own => {
        await own(() => { vi.restoreAllMocks() })
        await own(() => { vi.unstubAllEnvs() })
        const fixture = await danmakuConfigurationFixture()
        await own(() => fixture.close())
        const room = await fixture.seedRoom({ liveStatus: 1 })
        const database = await ControlDatabase.open(fixture.directory)
        await own(() => database.close())
        const record = vi.spyOn(database, "recordBilibiliLiveDanmakuEvent")
        await own(() => record.mockRestore())
        const service = new BilibiliLiveDanmakuService({ database, source: fixture.realtime,
          now: () => new Date(), idFactory: randomUUID, credentialProvider: async () => undefined,
          recentMessageLimitPerRoom: raw })
        await own(() => service.stopAll())
        const session = await service.start({ roomMonitorId: room.id })
        const emit = fixture.realtime.listeners.get(session.sessionId!)!, timestamp = new Date().toISOString()
        emit({ type: "command", receivedAt: timestamp, event: { command: "DANMU_MSG", kind: "DANMAKU",
          occurredAt: timestamp, receivedAt: timestamp, messageText: "合成消费弹幕",
          giftDelta: 0, superChatDelta: 0, rawJson: "{}" } })
        expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ recentLimit: effective,
          recent: expect.objectContaining({ messageText: "合成消费弹幕" }) }))
        expect(database.findBilibiliLiveDanmakuRecent(room.id, 200)).toHaveLength(1)
        emit({ type: "heartbeat", popularity: 42, receivedAt: timestamp })
        expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ recentLimit: effective, recent: null }))
      }, owner)
    })
  it("runs the original start, event persistence, status, recent, metrics and stop flow", async () => {
    let listener: ((event: BilibiliLiveDanmakuSourceEvent) => void) | undefined
    const database = {
      markOrphanedBilibiliLiveDanmakuSessions: vi.fn(() => 0),
      findBilibiliLiveRoomById: vi.fn(() => ({
        monitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
        roomId: "7734200",
        liveStatus: 1,
        monitorStatus: "ACTIVE"
      })),
      createBilibiliLiveDanmakuSession: vi.fn((input) => ({ ...input, status: "CONNECTING" })),
      updateBilibiliLiveDanmakuSessionTransport: vi.fn(),
      markBilibiliLiveDanmakuSessionConnected: vi.fn(),
      markBilibiliLiveDanmakuSessionStatus: vi.fn(),
      markBilibiliLiveDanmakuSessionHeartbeat: vi.fn(),
      markBilibiliLiveDanmakuSessionError: vi.fn(),
      findLatestBilibiliLiveDanmakuSession: vi.fn(() => undefined),
      getBilibiliLiveDanmakuStats: vi.fn(() => ({
        ratePerMinute: 1,
        last5MinutesCount: 1,
        likeCount: 120,
        likeIncrement: 7,
        watchedCount: 999,
        heartbeatPopularity: 42,
        latestBucketAt: "2026-08-29T12:00:00.000Z",
        latestMessageAt: "2026-08-29T12:00:05.000Z"
      })),
      recordBilibiliLiveDanmakuEvent: vi.fn(),
      runInTransaction: vi.fn((operation: () => unknown) => operation()),
      findBilibiliLiveDanmakuRecent: vi.fn(() => [{
        recentId: "recent-1",
        monitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
        roomId: "7734200",
        senderUid: "1001",
        messageText: "hello danmaku",
        displayName: "完整昵称",
        medalName: "详细粉丝牌",
        sentAt: "2026-08-29T12:00:05.000Z",
        createdAt: "2026-08-29T12:00:05.000Z"
      }]),
      findBilibiliLiveDanmakuMetricBuckets: vi.fn(() => [{
        bucketId: "bucket-1",
        monitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
        sessionId: "018f0f39-7b5e-7cc1-962d-9a208b3d0901",
        roomId: "7734200",
        bucketStart: "2026-08-29T12:00:00.000Z",
        bucketSeconds: 60,
        danmuCount: 1,
        likeCount: 120,
        likeIncrement: 7,
        watchedCount: 999,
        heartbeatPopularity: 42,
        giftCount: 0,
        superChatCount: 0,
        rawEventCount: 2,
        updatedAt: "2026-08-29T12:00:20.000Z",
        createdAt: "2026-08-29T12:00:05.000Z"
      }]),
      listBilibiliLiveDanmakuAutoStartRoomIds: vi.fn(() => [])
    } as unknown as ControlDatabase
    const source: BilibiliLiveDanmakuSource = {
      start: vi.fn(async (_input, callback) => {
        listener = callback
        return {
          connectHost: "wss://broadcastlv.chat.bilibili.com/sub",
          protocolVersion: 3,
          authMode: "LOGIN" as const,
          authUid: "1001"
        }
      }),
      stop: vi.fn(async () => undefined),
      stopAll: vi.fn(async () => undefined)
    }
    const credential = {
      cookieHeader: "SESSDATA=secret",
      account: { mid: "1001" }
    } as BilibiliCredential
    const resolveDisplayName = vi.fn(async () => "完整昵称")
    const service = new BilibiliLiveDanmakuService({
      database,
      source,
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      idFactory: vi.fn()
        .mockReturnValueOnce("018f0f39-7b5e-7cc1-962d-9a208b3d0901"),
      credentialProvider: async () => credential,
      resolveDisplayName
    })

    const started = await service.start({
      roomMonitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
      protocolVersion: -1
    })
    expect(started).toMatchObject({
      running: true,
      status: "CONNECTED",
      protocolVersion: 3,
      authMode: "LOGIN",
      authUid: "1001"
    })
    listener?.({
      type: "command",
      receivedAt: "2026-08-29T12:00:05.000Z",
      event: {
        command: "DANMU_MSG",
        kind: "DANMAKU",
        occurredAt: "2026-08-29T12:00:05.000Z",
        receivedAt: "2026-08-29T12:00:05.000Z",
        actor: { uid: "1001", displayName: "用**户", medalName: "详细粉丝牌" },
        messageText: "hello danmaku",
        giftDelta: 0,
        superChatDelta: 0,
        rawJson: "{}"
      }
    })
    listener?.({
      type: "heartbeat",
      popularity: 42,
      receivedAt: "2026-08-29T12:00:30.000Z"
    })
    listener?.({
      type: "command",
      receivedAt: "2026-08-29T12:00:31.000Z",
      event: {
        command: "NOTICE_MSG",
        kind: "UNKNOWN",
        occurredAt: "2026-08-29T12:00:31.000Z",
        receivedAt: "2026-08-29T12:00:31.000Z",
        giftDelta: 0,
        superChatDelta: 0,
        rawJson: "{}"
      }
    })
    await vi.waitFor(() => {
      expect(database.recordBilibiliLiveDanmakuEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          danmuDelta: 1,
          rawEventDelta: 1,
          recent: expect.objectContaining({
            senderUid: "1001",
            displayName: "完整昵称",
            messageText: "hello danmaku"
          })
        })
      )
    })
    expect(resolveDisplayName).toHaveBeenCalledTimes(1)
    expect(database.markBilibiliLiveDanmakuSessionHeartbeat).toHaveBeenCalled()
    expect(database.recordBilibiliLiveDanmakuEvent).toHaveBeenCalledWith(
      expect.objectContaining({ rawEventDelta: 1, danmuDelta: 0 })
    )
    expect(service.recent({
      roomMonitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
      limit: 30
    })).toMatchObject([{ senderUid: "1001", messageText: "hello danmaku" }])
    expect(service.recent({
      roomMonitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
      limit: 0
    })).toMatchObject([{ senderUid: "1001", messageText: "hello danmaku" }])
    expect(database.findBilibiliLiveDanmakuRecent).toHaveBeenLastCalledWith(
      "018f0f39-7b5e-7cc1-962d-9a208b3d0900", 1
    )
    expect(service.metrics({
      roomMonitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
      range: "1h"
    })).toMatchObject([{ danmuCount: 1, likeIncrement: 7, rawEventCount: 2 }])

    const stopped = await service.stop("018f0f39-7b5e-7cc1-962d-9a208b3d0900")
    expect(stopped).toMatchObject({ running: false, status: "STOPPED" })
    expect(source.stop).toHaveBeenCalledWith("018f0f39-7b5e-7cc1-962d-9a208b3d0901")
  })

  it("reports persisted active transport as PROCESS_RESTART instead of pretending it is live", () => {
    const database = {
      markOrphanedBilibiliLiveDanmakuSessions: vi.fn(() => 1),
      findBilibiliLiveRoomById: vi.fn(() => ({ roomId: "7734200" })),
      findLatestBilibiliLiveDanmakuSession: vi.fn(() => ({
        sessionId: "018f0f39-7b5e-7cc1-962d-9a208b3d0901",
        monitorId: "018f0f39-7b5e-7cc1-962d-9a208b3d0900",
        roomId: "7734200",
        status: "CONNECTED",
        connectHost: "wss://broadcastlv.chat.bilibili.com/sub",
        startedAt: "2026-08-29T11:55:00.000Z",
        connectedAt: "2026-08-29T11:55:01.000Z",
        endedAt: null,
        reconnectCount: 0,
        lastHeartbeatAt: "2026-08-29T11:59:30.000Z",
        lastErrorAt: null,
        lastErrorType: null,
        lastErrorMessage: null,
        createdAt: "2026-08-29T11:55:00.000Z"
      })),
      getBilibiliLiveDanmakuStats: vi.fn(() => ({
        ratePerMinute: 0,
        last5MinutesCount: 0,
        likeCount: null,
        likeIncrement: 0,
        watchedCount: null,
        heartbeatPopularity: null,
        latestBucketAt: null,
        latestMessageAt: null
      }))
    } as unknown as ControlDatabase
    const service = new BilibiliLiveDanmakuService({
      database,
      source: { start: vi.fn(), stop: vi.fn(), stopAll: vi.fn() },
      now: () => new Date("2026-08-29T12:00:00.000Z"),
      idFactory: vi.fn(),
      credentialProvider: async () => undefined
    })
    expect(service.status("018f0f39-7b5e-7cc1-962d-9a208b3d0900")).toMatchObject({
      running: false,
      status: "ERROR",
      lastErrorType: "PROCESS_RESTART"
    })
  })
})
