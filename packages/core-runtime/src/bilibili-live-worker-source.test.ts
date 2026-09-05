import { describe, expect, it } from "vitest"

import * as coreRuntime from "./index"

describe("BilibiliLiveWorkerSource", () => {
  it("maps all original REST live fetches onto the crawler NDJSON protocol", async () => {
    const exported = coreRuntime as unknown as Record<string, unknown>
    expect(typeof exported.BilibiliLiveWorkerSource).toBe("function")
    const Source = exported.BilibiliLiveWorkerSource as new (transport: {
      request: (type: string, payload: unknown) => Promise<unknown>
    }) => {
      fetchRoomInit: (input: Record<string, unknown>) => Promise<unknown>
      fetchRoomInfo: (input: Record<string, unknown>) => Promise<unknown>
      fetchRoomInfoOld: (input: Record<string, unknown>) => Promise<unknown>
      fetchStatusByUids: (input: Record<string, unknown>) => Promise<unknown>
    }
    const requests: Array<{ type: string; payload: unknown }> = []
    const artifact = {
      objectId: `sha256:${"a".repeat(64)}`,
      relativePath: "cas/sha256/aa/raw.json",
      sha256: "a".repeat(64),
      sizeBytes: 100,
      mediaType: "application/json"
    }
    const snapshot = {
      uid: "22",
      roomId: "33",
      uname: "anchor",
      liveStatus: 1,
      fetchedAt: "2026-08-29T12:00:00.000Z",
      sourceEndpoint: "room/v1/Room/get_info",
      evidenceObject: artifact,
      statusCode: 200,
      durationMs: 10
    }
    const source = new Source({
      request: async (type, payload) => {
        requests.push({ type, payload })
        if (type.endsWith("fetch-status-by-uids")) {
          return {
            snapshots: [{ uid: "22", roomId: "33", uname: "anchor", liveStatus: 1 }],
            fetchedAt: snapshot.fetchedAt,
            sourceEndpoint: "room/v1/Room/get_status_info_by_uids",
            evidenceObject: artifact,
            statusCode: 200,
            durationMs: 10
          }
        }
        if (type.endsWith("fetch-room-info-old")) {
          return {
            snapshot: { uid: "22", roomId: "33", liveStatus: 1 },
            fetchedAt: snapshot.fetchedAt,
            sourceEndpoint: "room/v1/Room/getRoomInfoOld",
            evidenceObject: artifact,
            statusCode: 200,
            durationMs: 10
          }
        }
        return {
          ...snapshot,
          sourceEndpoint: type.endsWith("fetch-room-init")
            ? "room/v1/Room/room_init"
            : "room/v1/Room/get_info"
        }
      }
    })
    const base = { taskId: "task-1", attempt: 1, leaseId: "lease-1" }

    await source.fetchRoomInit({ ...base, roomId: "33" })
    await source.fetchRoomInfo({ ...base, roomId: "33" })
    await source.fetchRoomInfoOld({ ...base, uid: "22" })
    await source.fetchStatusByUids({ ...base, uids: ["22"] })

    expect(requests.map((request) => request.type)).toEqual([
      "bilibili.live.fetch-room-init",
      "bilibili.live.fetch-room-info",
      "bilibili.live.fetch-room-info-old",
      "bilibili.live.fetch-status-by-uids"
    ])
  })
})
