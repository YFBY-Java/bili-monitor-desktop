import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import type { BilibiliFollowerFetchedSnapshot } from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"

// Reference: BilibiliFollowerMonitorRepository.updateSuccessfulSnapshot and RateLimitService.
describe("original follower collection semantics", () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    vi.useRealTimers()
    for (const cleanup of cleanups.splice(0)) await cleanup()
  })

  async function setup(requestMinIntervalMs = 0) {
    const directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-parity-"))
    const database = await ControlDatabase.open(directory)
    cleanups.push(async () => { database.close(); await rm(directory, { recursive: true, force: true }) })
    let now = new Date("2026-09-05T02:00:00.000Z")
    let beforeResponse = async (): Promise<void> => undefined
    const calls: number[] = []
    const service = new BilibiliFollowerMonitorService({
      database, idFactory: randomUUID, requestMinIntervalMs,
      now: () => requestMinIntervalMs ? new Date() : now,
      source: {
        fetchCard: async ({ mid }): Promise<BilibiliFollowerFetchedSnapshot> => {
          calls.push(Date.now())
          await beforeResponse()
          return {
            mid, nickname: "迁移测试用户", profileUrl: `https://space.bilibili.com/${mid}`,
            followerCount: 100 + calls.length, followingCount: 12, fetchedAt: now.toISOString(),
            sourceEndpoint: "x/web-interface/card", statusCode: 200, durationMs: 10,
            evidenceObject: { objectId: `sha256:${"a".repeat(64)}`, sha256: "a".repeat(64),
              relativePath: "cas/follower.json", sizeBytes: 100, mediaType: "application/json" }
          }
        },
        fetchRelationStat: async () => { throw new Error("Unexpected fallback") }
      }
    })
    return { service, database, calls,
      advance: () => { now = new Date(now.getTime() + 60_000) },
      beforeResponse: (callback: () => Promise<void>) => { beforeResponse = callback }
    }
  }

  it("keeps a paused monitor paused after a manual successful refresh", async () => {
    const { service, advance } = await setup()
    const user = await service.addUser({ mid: "2", intervalSeconds: 1 })
    service.updateStatus(user.id, false)
    advance()
    await service.refreshNow(user.id)
    expect(service.listUsers().items[0]).toMatchObject({ monitorStatus: "PAUSED", currentFollowerCount: 102 })
    advance()
    expect(await service.collectDueUsers()).toEqual([])
  })

  it("preserves a pause and interval edit made while collection is in flight", async () => {
    const fixture = await setup()
    const user = await fixture.service.addUser({ mid: "2", intervalSeconds: 60 })
    fixture.advance()
    fixture.beforeResponse(async () => {
      fixture.service.updateStatus(user.id, false)
      fixture.service.updateInterval(user.id, 7200)
    })
    await fixture.service.refreshNow(user.id)
    expect(fixture.service.listUsers().items[0]).toMatchObject({ monitorStatus: "PAUSED", intervalSeconds: 7200 })
  })

  it("does not recreate a deleted monitor when an old collection finishes", async () => {
    const fixture = await setup()
    const user = await fixture.service.addUser({ mid: "2" })
    fixture.beforeResponse(async () => { fixture.service.deleteUser(user.id) })
    await expect(fixture.service.refreshNow(user.id)).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(fixture.service.listUsers().items).toEqual([])
    expect(fixture.database.findBilibiliFollowerSnapshots(user.id, { limit: 500 })).toEqual([])
  })

  it("still activates an existing paused UID when explicitly added again, as the original does", async () => {
    const { service } = await setup()
    const user = await service.addUser({ mid: "2" })
    service.updateStatus(user.id, false)
    expect(await service.addUser({ mid: "2", intervalSeconds: 120 })).toMatchObject({
      id: user.id, monitorStatus: "ACTIVE", intervalSeconds: 120
    })
  })

  it("reuses the UID if another add finishes during the card request", async () => {
    const fixture = await setup()
    let release: () => void = () => undefined
    const pending = new Promise<void>((resolve) => { release = resolve })
    fixture.beforeResponse(() => pending)
    const first = fixture.service.addUser({ mid: "2" })
    const second = fixture.service.addUser({ mid: "2" })
    release()
    const users = await Promise.all([first, second])
    expect(users[0]?.id).toBe(users[1]?.id)
    expect(fixture.service.listUsers().items).toHaveLength(1)
  })

  it("serializes concurrent request slots to preserve the original global endpoint throttle", async () => {
    const fixture = await setup(1500)
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-05T02:00:00.000Z"))
    const requests = ["2", "3", "4"].map((mid) => fixture.service.addUser({ mid }))
    await vi.advanceTimersByTimeAsync(3000)
    await Promise.all(requests)
    expect(fixture.calls.map((time) => time - fixture.calls[0]!)).toEqual([0, 1500, 3000])
  })
})
