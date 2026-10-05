import { describe, expect, it } from "vitest"

import * as coreRuntime from "./index"

describe("BilibiliFollowerWorkerSource", () => {
  it("maps typed follower requests onto the crawler NDJSON protocol", async () => {
    const exported = coreRuntime as unknown as Record<string, unknown>
    expect(typeof exported.BilibiliFollowerWorkerSource).toBe("function")
    const Source = exported.BilibiliFollowerWorkerSource as new (transport: {
      request: (type: string, payload: unknown) => Promise<unknown>
    }) => {
      fetchCard: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
      fetchRelationStat: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
    }
    const requests: Array<{ type: string; payload: unknown }> = []
    const result = {
      mid: "2",
      nickname: "碧诗",
      profileUrl: "https://space.bilibili.com/2",
      followerCount: "9007199254740993",
      followingCount: "-9223372036854775808",
      fetchedAt: "2026-08-29T12:00:00.000Z",
      sourceEndpoint: "x/web-interface/card",
      evidenceObject: {
        objectId: `sha256:${"a".repeat(64)}`,
        relativePath: "cas/a.json",
        sha256: "a".repeat(64),
        sizeBytes: 100,
        mediaType: "application/json"
      },
      statusCode: 200,
      durationMs: 10
    }
    const source = new Source({
      request: async (type, payload) => {
        requests.push({ type, payload })
        return result
      }
    })
    const input = { taskId: "task-1", attempt: 1, leaseId: "lease-1", mid: "2" }

    expect(await source.fetchCard(input)).toMatchObject(result)
    expect(await source.fetchRelationStat(input)).toMatchObject(result)
    expect(requests).toEqual([
      { type: "bilibili.follower.fetch-card.v2", payload: input },
      { type: "bilibili.follower.fetch-relation-stat.v2", payload: input }
    ])
  })
})
