import {
  BilibiliFollowerFetchedSnapshotV2Schema,
  PlatformAdapterListSchema,
  PlatformCapabilitySchema,
  PlatformCollectionAccountDataSchema,
  PlatformCollectionExecutionSchema,
  RunPlatformCollectionInputSchema,
  javaLongToBigInt,
  type PlatformAdapterList,
  type PlatformCollectionExecution,
  type PlatformCollectionFetchErrorType,
  type PlatformCollectionFetchResult,
  type PlatformCollectionRiskLevel,
  type RunPlatformCollectionInput
} from "@bmd/contracts"

import { CoreApplicationError } from "./account-subject-service"
import type { BilibiliFollowerSource } from "./bilibili-follower-service"
import { BilibiliWorkerError } from "./ndjson-python-worker-transport"
import { parseJavaDecimalLong } from "./follower-configuration-values"

const unsupportedMessages = new Map<string, string>([
  ["contents", "Bilibili content list fetch is reserved for future implementation."],
  ["content-detail", "Bilibili content detail fetch is reserved for future implementation."],
  ["comments", "Bilibili comments fetch is reserved for future implementation."],
  ["danmaku", "Bilibili danmaku fetch is reserved for future implementation."],
  ["interactions", "Bilibili interaction fetch is reserved for future implementation."],
  ["followers", "Bilibili followers fetch is reserved for future implementation."],
  ["trends", "Bilibili trend fetch is reserved for future implementation."]
])
const workerErrorTypes = new Map<string, PlatformCollectionFetchErrorType>([
  ["BILIBILI_AUTH_EXPIRED", "AUTH_EXPIRED"], ["BILIBILI_RATE_LIMITED", "RATE_LIMITED"],
  ["BILIBILI_RISK_CONTROL", "RISK_CONTROL"], ["BILIBILI_NETWORK_ERROR", "NETWORK_ERROR"],
  ["BILIBILI_SERVER_ERROR", "SERVER_ERROR"], ["BILIBILI_PARSE_ERROR", "PARSE_ERROR"],
  ["BILIBILI_UNKNOWN_ERROR", "UNKNOWN"]
])

export class PlatformCollectionService {
  private readonly lifetime = new AbortController()

  constructor(private readonly options: {
    source: Pick<BilibiliFollowerSource, "fetchCard">
    idFactory: () => string
  }) {}

  listAdapters(): PlatformAdapterList {
    this.ensureRunning()
    return PlatformAdapterListSchema.parse([{ platformCode: "bilibili",
      capabilities: PlatformCapabilitySchema.options, implementedDataTypes: ["account"] }])
  }

  async runOnce(input: RunPlatformCollectionInput): Promise<PlatformCollectionExecution> {
    this.ensureRunning()
    const command = RunPlatformCollectionInputSchema.parse(input)
    if (command.platformCode !== "bilibili") {
      throw new CoreApplicationError("PLATFORM_ADAPTER_NOT_FOUND", "没有注册该平台的通用采集 adapter。")
    }
    if (command.dataType !== "account") {
      return this.execution(command, this.failure("UNSUPPORTED", false, "LOW",
        unsupportedMessages.get(command.dataType) ?? `Unsupported task data type: ${command.dataType}`, "unsupported"))
    }
    const externalId = command.externalId ?? ""
    let mid: string
    try {
      mid = parseJavaDecimalLong(externalId).toString()
    } catch (error) {
      if (!(error instanceof RangeError)) throw error
      return this.execution(command, this.failure("PARSE_ERROR", false, "LOW", "Bilibili mid must be numeric."))
    }
    try {
      // The original generic acquire() is empty and fetchAccount performs one card request.
      const fetched = await this.options.source.fetchCard({ mid, attempt: 1,
        taskId: this.options.idFactory(), leaseId: this.options.idFactory(), captureFailureEvidence: true }, "platform-account")
      this.ensureRunning()
      const snapshot = BilibiliFollowerFetchedSnapshotV2Schema.parse({ ...fetched,
        mid: javaLongToBigInt(fetched.mid).toString(), followerCount: javaLongToBigInt(fetched.followerCount).toString(),
        ...(fetched.followingCount !== undefined ? { followingCount: javaLongToBigInt(fetched.followingCount).toString() } : {}) })
      const data = PlatformCollectionAccountDataSchema.parse({ platform: "bilibili", externalAccountId: snapshot.mid,
        displayName: snapshot.nickname, avatarUrl: snapshot.avatarUrl ?? "", profileUrl: snapshot.profileUrl,
        followerCount: snapshot.followerCount, followingCount: snapshot.followingCount ?? "0",
        fetchedAt: snapshot.fetchedAt, sourceEndpoint: snapshot.sourceEndpoint })
      return this.execution(command, { success: true, data, rawPayload: null, rawPayloadObject: snapshot.evidenceObject,
        nextCursor: null, rateLimitInfo: { limited: false, remaining: null, resetAt: null, policyKey: "default" },
        errorType: "NONE", retryable: false, riskLevel: "LOW", message: "ok" })
    } catch (error) {
      this.ensureRunning()
      const errorType = error instanceof BilibiliWorkerError ? workerErrorTypes.get(error.code) : undefined
      // The original adapter catches BilibiliFetchException, not every exception.
      // Internal conversion/contract/Worker failures are request errors, not a
      // platform FetchResult. Keep the cause in Core without sending its raw
      // SQL/path/diagnostics through the public error message.
      if (!(error instanceof BilibiliWorkerError) || errorType === undefined) {
        const internal = new CoreApplicationError("INTERNAL_ERROR", "本地平台采集发生内部错误。")
        internal.cause = error
        throw internal
      }
      const retryable = error.retryable
      const riskLevel = errorType === "RISK_CONTROL" ? "HIGH" : errorType === "PARSE_ERROR"
        || (retryable && (error.statusCode ?? 0) >= 400) ? "MEDIUM" : "LOW"
      return this.execution(command, { ...this.failure(errorType, retryable, riskLevel, error.message),
        rawPayloadObject: error.evidenceObject ?? null })
    }
  }

  stop(): void { this.lifetime.abort() }

  private execution(command: RunPlatformCollectionInput, fetchResult: PlatformCollectionFetchResult): PlatformCollectionExecution {
    return PlatformCollectionExecutionSchema.parse({ status: fetchResult.success ? "SUCCESS" : "MANUAL_REVIEW",
      platformCode: command.platformCode, dataType: command.dataType, fetchResult })
  }

  private failure(errorType: PlatformCollectionFetchErrorType, retryable: boolean, riskLevel: PlatformCollectionRiskLevel,
    message: string, policyKey = "failure"): PlatformCollectionFetchResult {
    return { success: false, data: null, rawPayload: null, rawPayloadObject: null, nextCursor: null,
      rateLimitInfo: { limited: false, remaining: null, resetAt: null, policyKey }, errorType, retryable, riskLevel, message }
  }

  private ensureRunning(): void {
    if (this.lifetime.signal.aborted) throw new CoreApplicationError("CORE_STOPPED", "本地通用采集已停止。")
  }
}
