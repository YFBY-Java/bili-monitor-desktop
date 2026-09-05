import {
  BilibiliLiveRankFetchedSnapshotSchema,
  BilibiliLiveRankWorkerRequestSchema,
  type BilibiliLiveRankFetchedSnapshot,
  type BilibiliLiveRankWorkerRequest
} from "@bmd/contracts"

import type { WorkerRequestTransport } from "./bilibili-follower-worker-source"

export class BilibiliLiveRankWorkerSource {
  constructor(private readonly transport: WorkerRequestTransport) {}

  async fetch(request: BilibiliLiveRankWorkerRequest): Promise<BilibiliLiveRankFetchedSnapshot> {
    const payload = BilibiliLiveRankWorkerRequestSchema.parse(request)
    return BilibiliLiveRankFetchedSnapshotSchema.parse(
      await this.transport.request("bilibili.live.rank.fetch", payload)
    )
  }

  async stop(): Promise<void> {
    await this.transport.stop?.()
  }
}
