import { ControlDatabase } from "@bmd/storage"
import { BilibiliDanmakuWorkerStartSchema } from "@bmd/contracts"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RealtimeSessionManager } from "../../../workers/node-realtime/src/realtime-session-manager"
import { danmakuConfigurationFixture } from "./__fixtures__/danmaku-configuration"
import { seedLoginRoom } from "./__fixtures__/login-connections"
import { LocalCoreRuntime } from "./local-core-runtime"
import { BilibiliLiveDanmakuWorkerSource } from "./bilibili-live-danmaku-worker-source"

describe("original capacity through Core, SQLite and the actual Realtime manager", () => {
  let fixture: Awaited<ReturnType<typeof danmakuConfigurationFixture>> | undefined
  let runtime: LocalCoreRuntime | undefined, manager: RealtimeSessionManager | undefined
  const opened = new Set<string>()
  afterEach(async () => {
    try { await runtime?.stop(); await manager?.shutdown() }
    finally { runtime = undefined; manager = undefined; opened.clear(); await fixture?.close(); fixture = undefined; vi.unstubAllEnvs() }
  })

  it("allows the configured 101 connections without a second Worker ceiling", async () => {
    fixture = await danmakuConfigurationFixture()
    vi.stubEnv("SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_MAX_CONNECTIONS", "101")
    const database = await ControlDatabase.open(fixture.directory)
    let rooms: string[]
    try { rooms = Array.from({ length: 102 }, (_, index) => seedLoginRoom(database, String(index + 1))) }
    finally { database.close() }
    manager = new RealtimeSessionManager(async input => {
      opened.add(input.roomId)
      return { status: "AUTHENTICATING", attempt: 1, connectHost: "wss://example.test/capacity",
        protocolVersion: 3, authMode: "ANONYMOUS", stop: async () => { opened.delete(input.roomId) } }
    })
    const listeners = new Map<string, (event: unknown) => void>()
    const source = new BilibiliLiveDanmakuWorkerSource({
      request: async (type, payload) => {
        if (type === "start") {
          const input = BilibiliDanmakuWorkerStartSchema.parse(payload)
          const { stop: _socketStop, ...result } = await manager!.start(input, event => listeners.get(input.connectionId)?.(event))
          return result
        }
        if (type === "stop") return manager!.stop(String(payload.connectionId))
        return manager!.stopAll()
      },
      subscribe: (connectionId, listener) => {
        listeners.set(connectionId, listener)
        return () => { listeners.delete(connectionId) }
      },
      stop: () => manager!.shutdown()
    })
    runtime = await LocalCoreRuntime.start({ ...fixture.options, schedulerEnabled: false, liveDanmakuSource: source })
    for (const roomMonitorId of rooms.slice(0, 101)) {
      expect(await runtime.startBilibiliLiveDanmaku({ roomMonitorId })).toMatchObject({ running: true, status: "AUTHENTICATING" })
    }
    expect(opened.size).toBe(101)
    const first = runtime.getBilibiliLiveDanmakuStatus(rooms[0]!)
    expect((await runtime.startBilibiliLiveDanmaku({ roomMonitorId: rooms[0]! })).sessionId).toBe(first.sessionId)
    await expect(runtime.startBilibiliLiveDanmaku({ roomMonitorId: rooms[101]! })).rejects
      .toMatchObject({ code: "BILIBILI_DANMAKU_CONNECTION_LIMIT" })
    expect(runtime.getBilibiliLiveDanmakuStatus(rooms[101]!)).toMatchObject({ status: "NOT_STARTED" })
    expect(opened.has("102")).toBe(false)
    await runtime.stopBilibiliLiveDanmaku(rooms[0]!)
    expect(opened.size).toBe(100)
    expect(await runtime.startBilibiliLiveDanmaku({ roomMonitorId: rooms[101]! })).toMatchObject({ running: true })
    expect(opened.size).toBe(101)
    await runtime.stop()
    expect(opened.size).toBe(0)
  })
})
