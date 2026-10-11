import {
  BilibiliFollowerFetchRequestV2Schema,
  BilibiliPlatformAccountFetchRequestV1Schema,
  BilibiliFollowerFetchedSnapshotV2Schema,
  BilibiliFollowerProfileV2Schema,
  type BilibiliFollowerProfileV2,
  type BilibiliFollowerFetchRequest,
  type BilibiliFollowerFetchRequestV2,
  type BilibiliFollowerFetchedSnapshotV2,
  type BilibiliFollowerHttpConfiguration
} from "@bmd/contracts"

import type { BilibiliFollowerSource } from "./bilibili-follower-service"

export interface WorkerRequestTransport {
  request: (type: string, payload: unknown) => Promise<unknown>
  stop?: () => Promise<void>
}

export class BilibiliFollowerWorkerSource implements BilibiliFollowerSource {
  constructor(
    private readonly transport: WorkerRequestTransport,
    private readonly httpConfiguration?: BilibiliFollowerHttpConfiguration
  ) {}

  fetchCard(request: BilibiliFollowerFetchRequestV2, purpose?: "platform-account"): Promise<BilibiliFollowerFetchedSnapshotV2> {
    return this.fetch(purpose === "platform-account" ? "bilibili.platform.fetch-account.v1" : "bilibili.follower.fetch-card.v2", request)
  }

  fetchRelationStat(request: BilibiliFollowerFetchRequest): Promise<BilibiliFollowerFetchedSnapshotV2> {
    return this.fetch("bilibili.follower.fetch-relation-stat.v2", request)
  }

  async fetchProfile(request: BilibiliFollowerFetchRequest): Promise<BilibiliFollowerProfileV2> {
    const payload = BilibiliFollowerFetchRequestV2Schema.parse({ ...request,
      ...(this.httpConfiguration ? { httpConfiguration: this.httpConfiguration } : {}) })
    return BilibiliFollowerProfileV2Schema.parse(
      await this.transport.request("bilibili.follower.fetch-profile.v2", payload)
    )
  }

  async stop(): Promise<void> {
    await this.transport.stop?.()
  }

  private async fetch(
    type: string,
    request: BilibiliFollowerFetchRequestV2
  ): Promise<BilibiliFollowerFetchedSnapshotV2> {
    const schema = type === "bilibili.platform.fetch-account.v1"
      ? BilibiliPlatformAccountFetchRequestV1Schema : BilibiliFollowerFetchRequestV2Schema
    const payload = schema.parse({ ...request,
      ...(this.httpConfiguration ? { httpConfiguration: this.httpConfiguration } : {}) })
    return BilibiliFollowerFetchedSnapshotV2Schema.parse(
      await this.transport.request(type, payload)
    )
  }
}
