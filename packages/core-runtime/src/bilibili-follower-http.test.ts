import { resolve } from "node:path"
import { access } from "node:fs/promises"
import { expect, it, vi } from "vitest"
import { BilibiliFollowerWorkerSource } from "./bilibili-follower-worker-source"
import { followerConfigurationFixture, followerStoredRows } from "./__fixtures__/follower-configuration"
import { LocalCoreRuntime } from "./local-core-runtime"

it("passes configured follower HTTP options to both actual worker request types", async () => {
  const requests: Array<{ type: string; payload: unknown }> = []
  const httpConfiguration = { connectTimeoutMs: 1250, readTimeoutMs: 0,
    userAgent: "Fixture follower/2", referer: "https://www.bilibili.com/configured-follower" }
  const source = new BilibiliFollowerWorkerSource({ request: async (type, payload) => {
    requests.push({ type, payload })
    return { mid: "2", nickname: "Synthetic HTTP follower", profileUrl: "https://space.bilibili.com/2",
      followerCount: "20", fetchedAt: "2026-09-26T00:00:00Z", sourceEndpoint: type.endsWith("fetch-card.v2") ? "x/web-interface/card" : "x/relation/stat",
      statusCode: 200, durationMs: 1, evidenceObject: { objectId: `sha256:${"a".repeat(64)}`, sha256: "a".repeat(64),
        relativePath: "cas/synthetic-follower-http.json", sizeBytes: 2, mediaType: "application/json" } }
  } }, httpConfiguration)
  const request = { taskId: "t", attempt: 1, leaseId: "l", mid: "2" }
  await source.fetchCard(request)
  await source.fetchRelationStat(request)
  expect(requests).toEqual(["bilibili.follower.fetch-card.v2", "bilibili.follower.fetch-relation-stat.v2"]
    .map(type => ({ type, payload: { ...request, httpConfiguration } })))
})

it("uses configured actual Python HTTP for independent names when follower storage is disabled", async () => {
  const f = await followerConfigurationFixture({ storageEnabled: false, connectTimeoutMs: 1250,
    readTimeoutMs: 0, userAgent: "Fixture follower/2", referer: "https://www.bilibili.com/configured-follower" }, { enabled: false })
  let core: LocalCoreRuntime | undefined
  try {
    vi.stubEnv("BMD_PYTHON_WORKER_PATH", resolve(process.cwd(), "../../workers/python/tests/fixtures/follower_http_configuration"))
    // Omit the source override so the real configured Core -> Worker source is exercised.
    const { followerSource: _followerSource, ...options } = f.options
    core = await LocalCoreRuntime.start({ ...options, schedulerEnabled: false })
    const room = await core.addBilibiliLiveRoom({ uid: "2" })
    const connection = await core.startBilibiliLiveDanmaku({ roomMonitorId: room.id })
    const before = followerStoredRows(f.directory)
    const now = new Date().toISOString()
    f.realtime.listeners.get(connection.sessionId!)!({ type: "command", receivedAt: now,
      event: { command: "DANMU_MSG", kind: "DANMAKU", occurredAt: now, receivedAt: now,
        actor: { uid: "99", displayName: "合**" }, messageText: "合成独立HTTP事件", giftDelta: 0, superChatDelta: 0, rawJson: "{}" } })
    await vi.waitFor(() => expect(core!.getBilibiliLiveDanmakuRecent({ roomMonitorId: room.id })[0]?.displayName)
      .toBe("合成HTTP粉丝"), { timeout: 10_000 })
    expect(followerStoredRows(f.directory)).toEqual(before)
    await expect(access(resolve(f.directory, "cas"))).rejects.toMatchObject({ code: "ENOENT" })
    expect(f.calls).toEqual([])
  } finally { await core?.stop(); await f.close(); vi.unstubAllEnvs() }
}, 20_000)
