import {
  BilibiliLiveRankFetchedSnapshotV2Schema,
  BilibiliLiveRankWorkerRequestSchema,
  BilibiliWbiKeysSchema,
  type BilibiliLiveHttpConfiguration,
  type BilibiliLiveRankFetchedSnapshotV2,
  type BilibiliLiveRankWorkerRequest,
  type BilibiliWbiKeys
} from "@bmd/contracts"

import { CoreApplicationError } from "./account-subject-service"
import type { WorkerRequestTransport } from "./bilibili-follower-worker-source"

export class BilibiliLiveRankWorkerSource {
  private stopped = false
  private stopPromise: Promise<void> | undefined
  private readonly keyWaitControllers = new Set<AbortController>()

  constructor(
    private readonly transport: WorkerRequestTransport,
    private readonly httpConfiguration?: BilibiliLiveHttpConfiguration,
    private readonly wbiCacheSeconds = 43200,
    private readonly getWbiKeys?: (forceRefresh: boolean, signal: AbortSignal) => Promise<BilibiliWbiKeys>
  ) {}

  async fetch(request: BilibiliLiveRankWorkerRequest): Promise<BilibiliLiveRankFetchedSnapshotV2> {
    this.ensureRunning()
    const payload = BilibiliLiveRankWorkerRequestSchema.parse({
      ...request,
      wbiCacheSeconds: this.wbiCacheSeconds,
      ...(this.httpConfiguration ? { httpConfiguration: this.httpConfiguration } : {})
    })
    const audienceEndpoint = "xlive/general-interface/v1/rank/queryContributionRank"
    if (this.getWbiKeys && (payload.endpoint === audienceEndpoint
      || (payload.endpoint === undefined && payload.family === "AUDIENCE"))) {
      const controller = new AbortController()
      this.keyWaitControllers.add(controller)
      try {
        this.ensureRunning(controller.signal)
        const keys = await this.getWbiKeys(payload.forceRefreshWbi, controller.signal)
        this.ensureRunning(controller.signal)
        payload.wbiKeys = BilibiliWbiKeysSchema.parse(keys)
      } catch (error) {
        this.ensureRunning(controller.signal)
        throw error
      } finally {
        this.keyWaitControllers.delete(controller)
      }
    }
    this.ensureRunning()
    const result = await this.transport.request("bilibili.live.rank.fetch.v2", payload)
    this.ensureRunning()
    return BilibiliLiveRankFetchedSnapshotV2Schema.parse(result)
  }

  stop(): Promise<void> {
    if (!this.stopPromise) {
      this.stopped = true
      for (const controller of this.keyWaitControllers) controller.abort()
      this.stopPromise = Promise.resolve().then(() => this.transport.stop?.())
    }
    return this.stopPromise
  }

  private ensureRunning(signal?: AbortSignal): void {
    if (this.stopped || signal?.aborted) {
      throw new CoreApplicationError("CORE_STOPPED", "本地榜单采集已停止。", false)
    }
  }
}
