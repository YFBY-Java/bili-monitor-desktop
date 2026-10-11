import { BilibiliLiveFetchedOptionalSnapshotSchema, BilibiliLiveFetchedSnapshotSchema, BilibiliLiveFetchedStatusBatchSchema,
  BilibiliLiveFetchedOptionalSnapshotV2Schema, BilibiliLiveFetchedSnapshotV2Schema, BilibiliLiveFetchedStatusBatchV2Schema,
  BilibiliLiveRoomRequestSchema, BilibiliLiveStatusByUidsRequestSchema, BilibiliLiveUidRequestSchema,
  type BilibiliLiveRoomRequest, type BilibiliLiveStatusByUidsRequest, type BilibiliLiveUidRequest,
  type BilibiliLiveHttpConfiguration } from "@bmd/contracts"
import type { WorkerRequestTransport } from "./bilibili-follower-worker-source"

export class BilibiliLiveWorkerSource {
  constructor(private readonly transport: WorkerRequestTransport,
    private readonly httpConfiguration?: BilibiliLiveHttpConfiguration) {}

  async fetchRoomInit(request: BilibiliLiveRoomRequest) {
    return BilibiliLiveFetchedSnapshotSchema.parse(await this.fetch("room-init", BilibiliLiveRoomRequestSchema.parse(this.configuredRequest(request)), false))
  }
  async fetchRoomInfo(request: BilibiliLiveRoomRequest) {
    return BilibiliLiveFetchedSnapshotSchema.parse(await this.fetch("room-info", BilibiliLiveRoomRequestSchema.parse(this.configuredRequest(request)), false))
  }
  async fetchRoomInfoOld(request: BilibiliLiveUidRequest) {
    return BilibiliLiveFetchedOptionalSnapshotSchema.parse(await this.fetch("room-info-old", BilibiliLiveUidRequestSchema.parse(this.configuredRequest(request)), false))
  }
  async fetchStatusByUids(request: BilibiliLiveStatusByUidsRequest) {
    return BilibiliLiveFetchedStatusBatchSchema.parse(await this.fetch("status-by-uids", BilibiliLiveStatusByUidsRequestSchema.parse(this.configuredRequest(request)), false))
  }
  async fetchRoomInitV2(request: BilibiliLiveRoomRequest) {
    return BilibiliLiveFetchedSnapshotV2Schema.parse(await this.fetch("room-init", BilibiliLiveRoomRequestSchema.parse(this.configuredRequest(request)), true))
  }
  async fetchRoomInfoV2(request: BilibiliLiveRoomRequest) {
    return BilibiliLiveFetchedSnapshotV2Schema.parse(await this.fetch("room-info", BilibiliLiveRoomRequestSchema.parse(this.configuredRequest(request)), true))
  }
  async fetchRoomInfoOldV2(request: BilibiliLiveUidRequest) {
    return BilibiliLiveFetchedOptionalSnapshotV2Schema.parse(await this.fetch("room-info-old", BilibiliLiveUidRequestSchema.parse(this.configuredRequest(request)), true))
  }
  async fetchStatusByUidsV2(request: BilibiliLiveStatusByUidsRequest) {
    return BilibiliLiveFetchedStatusBatchV2Schema.parse(await this.fetch("status-by-uids", BilibiliLiveStatusByUidsRequestSchema.parse(this.configuredRequest(request)), true))
  }
  async stop(): Promise<void> { await this.transport.stop?.() }

  private fetch(endpoint: string, request: object, exact: boolean) {
    return this.transport.request(`bilibili.live.fetch-${endpoint}${exact ? ".v2" : ""}`, request)
  }
  private configuredRequest<T>(request: T) {
    return this.httpConfiguration ? { ...request, httpConfiguration: this.httpConfiguration } : request
  }
}
