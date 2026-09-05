import { describe, expect, it } from "vitest"

import { BilibiliLiveRankWorkerSource } from "./bilibili-live-rank-worker-source"

describe("BilibiliLiveRankWorkerSource", () => {
  it("maps rank collection to the crawler NDJSON protocol", async () => {
    const requests: Array<{ type: string; payload: unknown }> = []
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
      }
    })

    await source.fetch({
      taskId: "task-1",
      attempt: 1,
      leaseId: "lease-1",
      roomId: "33",
      ruid: "22",
      family: "AUDIENCE",
      type: "online_rank",
      rankSwitch: "contribution_rank",
      periodScope: "REALTIME",
      page: 1,
      pageSize: 50,
      forceRefreshWbi: false
    })

    expect(requests).toEqual([{
      type: "bilibili.live.rank.fetch",
      payload: expect.objectContaining({ roomId: "33", ruid: "22", page: 1 })
    }])
  })
})
