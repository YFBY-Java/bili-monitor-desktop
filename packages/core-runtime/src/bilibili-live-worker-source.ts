import {
  BilibiliLiveFetchedOptionalSnapshotSchema,
  BilibiliLiveFetchedSnapshotSchema,
  BilibiliLiveFetchedStatusBatchSchema,
  BilibiliLiveRoomRequestSchema,
  BilibiliLiveStatusByUidsRequestSchema,
  BilibiliLiveUidRequestSchema,
  type BilibiliLiveFetchedOptionalSnapshot,
  type BilibiliLiveFetchedSnapshot,
  type BilibiliLiveFetchedStatusBatch,
  type BilibiliLiveRoomRequest,
  type BilibiliLiveStatusByUidsRequest,
  type BilibiliLiveUidRequest,
  type BilibiliLiveHttpConfiguration
} from "@bmd/contracts"

import type { WorkerRequestTransport } from "./bilibili-follower-worker-source"

export class BilibiliLiveWorkerSource {
  constructor(private readonly transport: WorkerRequestTransport,
    private readonly httpConfiguration?: BilibiliLiveHttpConfiguration) {}

  fetchRoomInit(request: BilibiliLiveRoomRequest): Promise<BilibiliLiveFetchedSnapshot> {
    return this.fetchRoom("bilibili.live.fetch-room-init", request)
  }

  fetchRoomInfo(request: BilibiliLiveRoomRequest): Promise<BilibiliLiveFetchedSnapshot> {
    return this.fetchRoom("bilibili.live.fetch-room-info", request)
  }

  async fetchRoomInfoOld(
    request: BilibiliLiveUidRequest
  ): Promise<BilibiliLiveFetchedOptionalSnapshot> {
    const payload = BilibiliLiveUidRequestSchema.parse(this.configuredRequest(request))
    return BilibiliLiveFetchedOptionalSnapshotSchema.parse(
      await this.transport.request("bilibili.live.fetch-room-info-old", payload)
    )
  }

  async fetchStatusByUids(
    request: BilibiliLiveStatusByUidsRequest
  ): Promise<BilibiliLiveFetchedStatusBatch> {
    const payload = BilibiliLiveStatusByUidsRequestSchema.parse(this.configuredRequest(request))
    return BilibiliLiveFetchedStatusBatchSchema.parse(
      await this.transport.request("bilibili.live.fetch-status-by-uids", payload)
    )
  }

  async stop(): Promise<void> {
    await this.transport.stop?.()
  }

  private async fetchRoom(
    type: "bilibili.live.fetch-room-init" | "bilibili.live.fetch-room-info",
    request: BilibiliLiveRoomRequest
  ): Promise<BilibiliLiveFetchedSnapshot> {
    const payload = BilibiliLiveRoomRequestSchema.parse(this.configuredRequest(request))
    return BilibiliLiveFetchedSnapshotSchema.parse(
      await this.transport.request(type, payload)
    )
  }

  private configuredRequest<T>(request: T) {
    return this.httpConfiguration ? { ...request, httpConfiguration: this.httpConfiguration } : request
  }
}
