import {
  BilibiliFollowerFetchRequestSchema,
  BilibiliFollowerFetchedSnapshotSchema,
  type BilibiliFollowerFetchRequest,
  type BilibiliFollowerFetchedSnapshot
} from "@bmd/contracts"

import type { BilibiliFollowerSource } from "./bilibili-follower-service"

export interface WorkerRequestTransport {
  request: (type: string, payload: unknown) => Promise<unknown>
  stop?: () => Promise<void>
}

export class BilibiliFollowerWorkerSource implements BilibiliFollowerSource {
  constructor(private readonly transport: WorkerRequestTransport) {}

  fetchCard(request: BilibiliFollowerFetchRequest): Promise<BilibiliFollowerFetchedSnapshot> {
    return this.fetch("bilibili.follower.fetch-card", request)
  }

  fetchRelationStat(request: BilibiliFollowerFetchRequest): Promise<BilibiliFollowerFetchedSnapshot> {
    return this.fetch("bilibili.follower.fetch-relation-stat", request)
  }

  async stop(): Promise<void> {
    await this.transport.stop?.()
  }

  private async fetch(
    type: string,
    request: BilibiliFollowerFetchRequest
  ): Promise<BilibiliFollowerFetchedSnapshot> {
    const payload = BilibiliFollowerFetchRequestSchema.parse(request)
    return BilibiliFollowerFetchedSnapshotSchema.parse(
      await this.transport.request(type, payload)
    )
  }
}
