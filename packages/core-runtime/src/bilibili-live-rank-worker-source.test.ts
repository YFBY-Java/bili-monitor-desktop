import { describe, expect, it } from "vitest"

import { BilibiliLiveRankWorkerSource } from "./bilibili-live-rank-worker-source"

describe("BilibiliLiveRankWorkerSource", () => {
  it("maps rank collection to the crawler NDJSON protocol", async () => {
    const requests: Array<{ type: string; payload: unknown }> = []
    const keyRequests: Array<{ forceRefresh: boolean; signal: AbortSignal }> = []
    const wbiKeys = { imgKey: "a".repeat(32), subKey: "b".repeat(32) }
    let stopCount = 0
    const source = new BilibiliLiveRankWorkerSource({
      request: async (type, payload) => {
        requests.push({ type, payload })
        return {
          rankFamily: "AUDIENCE",
          rankType: "online_rank",
          rankSwitch: "contribution_rank",
          periodScope: "REALTIME",
          pageNo: 1,
          pageSize: 50,
          sourceEndpoint: "xlive/general-interface/v1/rank/queryContributionRank",
          signedRequired: true,
          capturedAt: "2026-08-29T12:00:00.000Z",
          entries: [],
          evidenceObject: {
            objectId: `sha256:${"a".repeat(64)}`,
            relativePath: `cas/sha256/aa/${"a".repeat(64)}.json`,
            sha256: "a".repeat(64),
            sizeBytes: 100,
            mediaType: "application/json"
          },
          statusCode: 200,
          durationMs: 10
        }
      },
      stop: async () => { stopCount += 1 }
    }, undefined, -8, async (forceRefresh, signal) => {
      keyRequests.push({ forceRefresh, signal })
      return wbiKeys
    })

    const request = {
      taskId: "task-1",
      attempt: 1,
      leaseId: "lease-1",
      roomId: "33",
      ruid: "22",
      family: "AUDIENCE" as const,
      type: "online_rank",
      rankSwitch: "contribution_rank",
      periodScope: "REALTIME",
      page: 1,
      pageSize: 50,
      forceRefreshWbi: true
    }
    await source.fetch(request)

    expect(requests).toEqual([{
      type: "bilibili.live.rank.fetch.v2",
      payload: expect.objectContaining({ roomId: "33", ruid: "22", page: 1, wbiCacheSeconds: -8, wbiKeys })
    }])
    expect(keyRequests).toEqual([{ forceRefresh: true, signal: expect.any(AbortSignal) }])
    await Promise.all([source.stop(), source.stop()])
    expect(stopCount).toBe(1)
    await expect(source.fetch(request)).rejects.toMatchObject({ code: "CORE_STOPPED" })
    expect(requests).toHaveLength(1)
  })
})
