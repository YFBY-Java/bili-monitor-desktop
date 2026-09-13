import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { createLiveSessionFixture } from "./__fixtures__/live-session"

async function populatedFixture() {
  const fixture = await createLiveSessionFixture()
  const { database, room, start } = fixture
  const insertedIds: string[] = []
  for (let index = 0; index < 205; index++) {
    const sessionId = randomUUID()
    // Pairs have the same start time: the newer persisted row must win the tie.
    const startedAt = new Date(Date.parse(start) + Math.floor(index / 2) * 60_000).toISOString()
    database.insertBilibiliLiveSession({
      sessionId, monitorId: room.monitorId, uid: room.uid, roomId: room.roomId,
      state: "CLOSED", platformLiveTime: null, liveKey: `synthetic-session-${index}`,
      startedAt, startDetectedAt: startedAt, startSource: "REST_STATUS", endSignalAt: null,
      endedAt: startedAt, endDetectedAt: startedAt, endSource: "REST_STATUS",
      lastLiveObservedAt: startedAt, lastObservedAt: startedAt,
      titleAtStart: "合成场次", titleAtEnd: "合成场次", createdAt: startedAt, updatedAt: startedAt
    })
    insertedIds.push(sessionId)
  }
  return { ...fixture, insertedIds }
}

describe("original recent-session query parity", () => {
  it("returns the latest 200 real SQLite rows with deterministic ties and room isolation", async () => {
    const fixture = await populatedFixture()
    const { database, room, insertedIds } = fixture
    try {
      const expected = [...insertedIds].reverse().slice(0, 200)
      expect(database.listBilibiliLiveSessions(room.monitorId, 200).map(item => item.sessionId)).toEqual(expected)
      expect(database.listBilibiliLiveSessions(room.monitorId, 1000).map(item => item.sessionId)).toEqual(expected)
      expect(database.listBilibiliLiveSessions(randomUUID(), 200)).toEqual([])
    } finally { await fixture.close() }
  })

  it("applies original defaults and limits through the real Core query without deleting older rows", async () => {
    const fixture = await populatedFixture()
    const { service, database, room, insertedIds } = fixture
    try {
      for (const [limit, expected] of [[undefined, 20], [0, 20], [-1, 20], [1, 1], [150, 150], [200, 200], [201, 200]] as const) {
        const result = service.list({ roomMonitorId: room.monitorId, ...(limit === undefined ? {} : { limit }) })
        expect(result.map(item => item.id)).toEqual([...insertedIds].reverse().slice(0, expected))
        expect(result.every(item => item.monitorId === room.monitorId)).toBe(true)
      }
      expect(database.findBilibiliLiveSessionById(insertedIds[0]!)).toBeDefined()
      expect(service.list({ roomMonitorId: randomUUID(), limit: 200 })).toEqual([])
    } finally { await fixture.close() }
  })
})
