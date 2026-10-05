import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import type { BilibiliFollowerFetchRequest, BilibiliFollowerFetchedSnapshot } from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"
import { BilibiliFollowerMonitorService } from "../bilibili-follower-service"

// Only imported by tests. Public service methods still perform all writes and queries against real SQLite.
export async function followerMigrationFixture(maxAttempts = 3) {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-migration-"))
  const database = await ControlDatabase.open(directory)
  let sequence = 999999
  const calls: Array<{ endpoint: string; request: BilibiliFollowerFetchRequest }> = []
  const waits: number[] = []
  const state = {
    now: "2026-09-13T04:00:00.000Z", fetchedAt: "2026-09-13T04:00:00.000Z",
    count: 100, avatar: "https://example.com/synthetic-avatar.png" as string | undefined,
    cardError: undefined as Error | undefined, relationError: undefined as Error | undefined,
    beforeCard: undefined as ((request: BilibiliFollowerFetchRequest) => Promise<void>) | undefined
  }
  const snapshot = (mid: string, endpoint: "x/web-interface/card" | "x/relation/stat"): BilibiliFollowerFetchedSnapshot => ({
    mid, ...(endpoint === "x/web-interface/card" ? { nickname: `合成粉丝用户${mid}`, ...(state.avatar ? { avatarUrl: state.avatar } : {}) } : {}),
    profileUrl: `https://space.bilibili.com/${mid}`, followerCount: state.count, followingCount: 10,
    fetchedAt: state.fetchedAt, sourceEndpoint: endpoint, statusCode: 200, durationMs: 1,
    evidenceObject: { objectId: `sha256:${"f".repeat(64)}`, sha256: "f".repeat(64),
      relativePath: "cas/synthetic-follower.json", sizeBytes: 2, mediaType: "application/json" }
  })
  const service = new BilibiliFollowerMonitorService({
    database, now: () => new Date(state.now),
    // Reverse UUIDs make accidental UUID sorting observably different from original insertion order.
    idFactory: () => `018f0f39-7b5e-4cc1-862d-${String(sequence--).padStart(12, "0")}`,
    requestMinIntervalMs: 0, retryBackoffMs: 0, maxAttempts, jitter: () => 0,
    sleep: async value => { waits.push(value) },
    source: {
      fetchCard: async request => {
        calls.push({ endpoint: "x/web-interface/card", request })
        await state.beforeCard?.(request)
        if (state.cardError) throw state.cardError
        return snapshot(request.mid, "x/web-interface/card")
      },
      fetchRelationStat: async request => {
        calls.push({ endpoint: "x/relation/stat", request })
        if (state.relationError) throw state.relationError
        return snapshot(request.mid, "x/relation/stat")
      }
    }
  })
  return { service, database, state, calls, waits,
    close: async () => { await service.stop(); database.close(); await rm(directory, { recursive: true, force: true }) }
  }
}

export function followerError(code: string, retryable: boolean, endpoint = "x/web-interface/card", message = "合成采集失败") {
  return Object.assign(new Error(message), { code, retryable, endpoint, statusCode: 200 })
}
