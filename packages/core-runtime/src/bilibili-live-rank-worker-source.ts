import {
  BilibiliLiveRankFetchedSnapshotSchema,
  BilibiliLiveRankWorkerRequestSchema,
  type BilibiliLiveHttpConfiguration,
  type BilibiliLiveRankFetchedSnapshot,
  type BilibiliLiveRankWorkerRequest
} from "@bmd/contracts"

import type { WorkerRequestTransport } from "./bilibili-follower-worker-source"

export class BilibiliLiveRankWorkerSource {
  constructor(
    private readonly transport: WorkerRequestTransport,
    private readonly httpConfiguration?: BilibiliLiveHttpConfiguration
  ) {}

  async fetch(request: BilibiliLiveRankWorkerRequest): Promise<BilibiliLiveRankFetchedSnapshot> {
    const payload = BilibiliLiveRankWorkerRequestSchema.parse({
      ...request,
      ...(this.httpConfiguration ? { httpConfiguration: this.httpConfiguration } : {})
    })
    return BilibiliLiveRankFetchedSnapshotSchema.parse(
      await this.transport.request("bilibili.live.rank.fetch", payload)
    )
  }

  async stop(): Promise<void> {
    await this.transport.stop?.()
  }
}
