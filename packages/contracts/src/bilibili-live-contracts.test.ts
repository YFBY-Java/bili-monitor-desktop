import { describe, expect, it } from "vitest"

import {
  AddBilibiliLiveRoomInputSchema,
  BilibiliLiveFetchedSnapshotSchema,
  BilibiliLiveRoomSchema,
  QueryBilibiliLiveEventsInputSchema
} from "./bilibili-live"

describe("Bilibili live contracts", () => {
  it("requires exactly one of uid and roomId when adding a room", () => {
    expect(AddBilibiliLiveRoomInputSchema.parse({ uid: "22" })).toEqual({ uid: "22" })
    expect(AddBilibiliLiveRoomInputSchema.parse({ roomId: "33", intervalSeconds: 300 }))
      .toEqual({ roomId: "33", intervalSeconds: 300 })
    expect(() => AddBilibiliLiveRoomInputSchema.parse({})).toThrow()
    expect(() => AddBilibiliLiveRoomInputSchema.parse({ uid: "22", roomId: "33" })).toThrow()
  })

  it("rejects unsupported live states and invalid collection intervals", () => {
    const fetchedAt = "2026-08-29T12:00:00.000Z"
    expect(() => BilibiliLiveFetchedSnapshotSchema.parse({
      uid: "22",
      roomId: "33",
      liveStatus: 3,
      fetchedAt,
      sourceEndpoint: "room/v1/Room/get_info",
      evidenceObject: {
        objectId: `sha256:${"a".repeat(64)}`,
        relativePath: "objects/aa/raw.json",
        sha256: "a".repeat(64),
        sizeBytes: 2,
        mediaType: "application/json"
      },
      statusCode: 200,
      durationMs: 1
    })).toThrow()
    expect(() => AddBilibiliLiveRoomInputSchema.parse({ uid: "22", intervalSeconds: 0 })).toThrow()
  })

  it("keeps the original room projection and event query limit", () => {
    const room = BilibiliLiveRoomSchema.parse({
      id: "81814b69-d0e0-49c2-a6cc-3803b169a7bf",
      uid: "22",
      roomId: "33",
      uname: "anchor",
      title: "title",
      liveStatus: 1,
      onlineCount: 100,
      monitorStatus: "ACTIVE",
      intervalSeconds: 300,
      recentTrend: [],
      version: 1
    })
    expect(room.liveStatus).toBe(1)
    expect(QueryBilibiliLiveEventsInputSchema.parse({})).toEqual({ limit: 20 })
    expect(QueryBilibiliLiveEventsInputSchema.parse({ limit: 201 })).toEqual({ limit: 200 })
  })
})
