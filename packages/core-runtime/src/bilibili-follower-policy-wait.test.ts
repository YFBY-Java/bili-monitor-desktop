import { randomUUID } from "node:crypto"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"
import { followerConfigurationFixture } from "./__fixtures__/follower-configuration"

describe("original follower integer backoff beyond a single Node timer", () => {
  const maximumTimer = 2_147_483_647
  let fixture: Awaited<ReturnType<typeof followerConfigurationFixture>> | undefined
  let database: ControlDatabase | undefined
  let service: BilibiliFollowerMonitorService | undefined
  afterEach(async () => {
    await service?.stop(); service = undefined
    database?.close(); database = undefined
    await fixture?.close(); fixture = undefined
    vi.useRealTimers(); vi.unstubAllEnvs()
  })
  async function setup() {
    fixture = await followerConfigurationFixture()
    database = await ControlDatabase.open(fixture.directory)
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-26T00:00:00Z"))
    service = new BilibiliFollowerMonitorService({ database, source: fixture.options.followerSource,
      now: () => new Date(), idFactory: randomUUID, requestMinIntervalMs: 0,
      maxAttempts: 3, retryBackoffMs: maximumTimer, jitter: () => 0.5 })
    const user = await service.addUser({ mid: "2" })
    fixture.calls.length = 0
    fixture.state.failure = Object.assign(new Error("Synthetic long follower retry"), { code: "BILIBILI_RATE_LIMITED", retryable: true })
    return { ...fixture, database, service, user }
  }
  it("waits the entire first and doubled backoffs including jitter without overflowing to 1ms", async () => {
    const f = await setup()
    const pending = f.service.refreshNow(f.user.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(maximumTimer + 148)
    expect(f.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(maximumTimer * 2 + 149)
    expect(f.calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toMatchObject({ code: "BILIBILI_RATE_LIMITED" })
    expect(f.calls).toHaveLength(3)
    expect(vi.getTimerCount()).toBe(0)
  })
  it("cancels a later wait segment without writing a terminal collection failure", async () => {
    const f = await setup()
    const pending = f.service.refreshNow(f.user.id).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(maximumTimer)
    expect(f.calls).toHaveLength(1)
    await f.service.stop()
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    expect(f.service.listUsers().items).toEqual([f.user])
    expect(vi.getTimerCount()).toBe(0)
  })
})
