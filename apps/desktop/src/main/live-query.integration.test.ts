import { randomBytes, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { createRuntimeEnvelope } from "@bmd/contracts"
import { LocalCoreRuntime } from "@bmd/core-runtime"
import { ControlDatabase } from "@bmd/storage"
import { expect, it } from "vitest"
import { createDesktopBridge } from "../preload/bridge"
import { dispatchBusinessRequest } from "./core-request-router"

function seedQueryRoom(database: ControlDatabase, roomId: string): string {
  const monitorId = randomUUID(), now = new Date().toISOString()
  database.applyBilibiliLiveRoomSnapshot({
    monitor: { monitorId, uid: roomId, roomId, shortId: null, uname: "合成查询桥接主播", faceUrl: null,
      title: "合成查询桥接直播间", coverUrl: null, keyframeUrl: null, areaId: null, areaName: null,
      parentAreaId: null, parentAreaName: null, liveStatus: 0, liveTime: null, onlineCount: Number(roomId),
      attentionCount: 0, intervalSeconds: 300, nextCollectAt: now, capturedAt: now, sourceEndpoint: "room/v1/Room/get_info" },
    snapshot: { snapshotId: randomUUID(), capturedBucket: `${now.slice(0, 19)}Z` },
    artifact: { objectId: `sha256:${"b".repeat(64)}`, sha256: "b".repeat(64), relativePath: "cas/synthetic-live-query-bridge.json", sizeBytes: 1, mediaType: "application/json", createdAt: now },
    outbox: { messageId: randomUUID(), topic: "seed", envelopeJson: "{}", createdAt: now }
  })
  return monitorId
}

// Actual preload schemas + message serialization + router + Core + isolated SQLite.
// The native Electron transport is replaced, not the business/query implementation.
it("queries every stored room and normalized offset history through the real local boundaries after reopen", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-live-query-bridge-"))
  let runtime: LocalCoreRuntime | undefined
  const database = await ControlDatabase.open(directory)
  const ids: string[] = []
  let capturedAt = ""
  try {
    database.runInTransaction(() => {
      for (let index = 1; index <= 505; index++) ids.push(seedQueryRoom(database, String(index)))
    })
    capturedAt = database.findBilibiliLiveRoomById(ids[504]!)!.lastSnapshotAt!
  } finally { database.close() }
  const requests: Array<{ type: string; input: unknown }> = []
  const methods: Record<string, string> = {
    "bilibili-live:rooms-list": "bilibili-live.rooms.list",
    "bilibili-live:summary": "bilibili-live.summary",
    "bilibili-live:trend": "bilibili-live.trend",
    "bilibili-live:trends": "bilibili-live.trends",
    "bilibili-live:events": "bilibili-live.events"
  }
  const bridge = createDesktopBridge(async (channel, input) => {
    const type = methods[channel]
    if (!runtime || !type) throw new Error("Unexpected synthetic live-query transport request")
    requests.push({ type, input })
    const id = randomUUID()
    const request = createRuntimeEnvelope({ id, type, timestamp: new Date().toISOString(), correlationId: id,
      traceId: id, payload: input ?? {} })
    const result = await dispatchBusinessRequest(runtime, JSON.parse(JSON.stringify(request)))
    expect(result.responseType).toBe(`${type}.result`)
    return JSON.parse(JSON.stringify(result.payload))
  }).bilibiliLive
  const options = { dataDirectory: directory, version: "test", schedulerEnabled: false, credentialKey: randomBytes(32) }
  try {
    runtime = await LocalCoreRuntime.start(options)
    expect((await bridge.list()).total).toBe(505)
    expect(requests[0]).toEqual({ type: "bilibili-live.rooms.list", input: {} })
    expect((await bridge.list({ limit: 20 })).items).toHaveLength(20)
    expect(await bridge.summary()).toMatchObject({ totalRooms: 505, offlineRooms: 505 })
    const offset = new Date(Date.parse(capturedAt) + 8 * 3600000).toISOString().replace("Z", "+08:00")
    expect((await bridge.trend({ roomMonitorId: ids[504]!, from: offset, to: capturedAt, limit: 0 })).points).toHaveLength(1)
    expect(requests.at(-1)?.input).toMatchObject({ limit: 500, from: offset, to: capturedAt })
    expect((await bridge.trends({ roomMonitorIds: ids.slice().reverse(), limitPerRoom: 9999 })).map(item => item.room.id)).toEqual(ids.slice().reverse())
    expect(requests.at(-1)?.input).toMatchObject({ limitPerRoom: 2000 })
    expect(await bridge.events({ limit: 0 })).toEqual([])
    expect(requests.at(-1)?.input).toEqual({ limit: 1 })
    const previousRequests = requests.length
    await expect(bridge.trends({ from: "2026-09-13T12:00:00" })).rejects.toThrow()
    expect(requests).toHaveLength(previousRequests)
    await runtime.stop()
    runtime = await LocalCoreRuntime.start(options)
    expect((await bridge.trends({}))).toHaveLength(505)
  } finally { await runtime?.stop(); await rm(directory, { recursive: true, force: true }) }
}, 30_000)
