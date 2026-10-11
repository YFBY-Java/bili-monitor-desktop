import { BilibiliLiveHttpConfigurationSchema, BilibiliDanmakuWorkerStartResultSchema,
  BilibiliDanmakuWorkerLifecycleEventSchema, type BilibiliLiveHttpConfiguration } from "@bmd/contracts"
import type {
  BilibiliLiveDanmakuSource,
  BilibiliLiveDanmakuSourceEvent,
  BilibiliLiveDanmakuSourceStartInput,
  BilibiliLiveDanmakuSourceStartResult,
  NormalizedBilibiliDanmakuEvent
} from "./bilibili-live-danmaku-service"
import type { RealtimeWorkerTransport } from "./ndjson-realtime-worker-transport"

export class BilibiliLiveDanmakuWorkerSource implements BilibiliLiveDanmakuSource {
  private readonly unsubscribe = new Map<string, () => void>()
  private stopped = false
  private stopPromise: Promise<void> | undefined

  constructor(private readonly transport: RealtimeWorkerTransport,
    private readonly httpConfiguration?: BilibiliLiveHttpConfiguration) {}

  async start(
    input: BilibiliLiveDanmakuSourceStartInput,
    onEvent: (event: BilibiliLiveDanmakuSourceEvent) => void
  ): Promise<BilibiliLiveDanmakuSourceStartResult> {
    if (this.stopped) throw Object.assign(new Error("Realtime Worker stopped."), { code: "REALTIME_WORKER_STOPPED", retryable: false })
    let rejectEventFailure!: (error: unknown) => void
    const eventFailure = new Promise<never>((_resolve, reject) => { rejectEventFailure = reject })
    this.unsubscribe.get(input.connectionId)?.()
    this.unsubscribe.set(input.connectionId, this.transport.subscribe(
      input.connectionId,
      (event) => {
        try {
          const parsed = parseSourceEvent(event)
          onEvent(parsed)
          if (parsed.type === "error" || parsed.type === "closed") {
            this.unsubscribe.get(input.connectionId)?.()
            this.unsubscribe.delete(input.connectionId)
          }
        } catch (error) {
          // A subscription runs on the NDJSON reader's stack, outside start's await.
          // Reject pending start and release the owned transport without escaping that reader.
          rejectEventFailure(error)
          this.unsubscribe.get(input.connectionId)?.()
          this.unsubscribe.delete(input.connectionId)
          void this.stop(input.connectionId).catch(() => console.error("Realtime event failure cleanup failed."))
          try {
            onEvent({ type: "error", receivedAt: new Date().toISOString(),
              errorType: "REALTIME_WORKER_EVENT_FAILED", message: "Realtime worker event could not be applied." })
          } catch {
            console.error("Realtime terminal event could not be persisted.")
          }
        }
      }
    ))
    try {
      const result = await Promise.race([eventFailure, this.transport.request("start", {
        ...(this.httpConfiguration ? { httpConfiguration: BilibiliLiveHttpConfigurationSchema.parse(this.httpConfiguration) } : {}),
        connectionId: input.connectionId,
        roomId: input.roomId,
        ...(input.protocolVersion === undefined ? {} : { protocolVersion: input.protocolVersion }),
        ...(input.preferredProtocolVersion === undefined ? {} : { preferredProtocolVersion: input.preferredProtocolVersion }),
        ...(input.connectionConfiguration ? { connectionConfiguration: input.connectionConfiguration } : {}),
        ...(input.cacheConfiguration ? { cacheConfiguration: input.cacheConfiguration } : {}),
        ...(input.credential ? { credential: input.credential } : {})
      })])
      return parseStartResult(result)
    } catch (error) {
      this.unsubscribe.get(input.connectionId)?.()
      this.unsubscribe.delete(input.connectionId)
      throw error
    }
  }

  async stop(connectionId: string): Promise<void> {
    if (this.stopped) return
    try {
      await this.transport.request("stop", { connectionId })
    } finally {
      this.unsubscribe.get(connectionId)?.()
      this.unsubscribe.delete(connectionId)
    }
  }

  stopAll(): Promise<void> {
    if (!this.stopPromise) {
      this.stopped = true
      for (const unsubscribe of this.unsubscribe.values()) unsubscribe()
      this.unsubscribe.clear()
      // Terminal shutdown must work even when the child no longer answers NDJSON.
      // Closing/killing the owned process also releases every socket it owns.
      this.stopPromise = this.transport.stop()
    }
    return this.stopPromise
  }
}

function parseStartResult(value: unknown): BilibiliLiveDanmakuSourceStartResult {
  return BilibiliDanmakuWorkerStartResultSchema.parse(value)
}

function parseSourceEvent(value: unknown): BilibiliLiveDanmakuSourceEvent {
  if (!isRecord(value)) throw new Error("Realtime Worker returned an invalid event.")
  const type = requiredString(value.type, "event.type")
  const receivedAt = requiredIso(value.receivedAt, "event.receivedAt")
  if (["connecting", "attempt-failed", "connected", "heartbeat-sent"].includes(type)) {
    return BilibiliDanmakuWorkerLifecycleEventSchema.parse(value)
  }
  const attemptNumber = value.attempt === undefined ? undefined : requiredInteger(value.attempt, "event.attempt")
  if (attemptNumber !== undefined && attemptNumber < 1) throw new Error("event.attempt must be positive.")
  const attempt = attemptNumber === undefined ? {} : { attempt: attemptNumber }
  if (type === "heartbeat") {
    return {
      type,
      ...attempt,
      popularity: nonNegativeInteger(value.popularity, "event.popularity"),
      receivedAt
    }
  }
  if (type === "closed") {
    return {
      type,
      ...attempt,
      code: requiredInteger(value.code, "event.code"),
      reason: typeof value.reason === "string" ? value.reason : "",
      receivedAt
    }
  }
  if (type === "error") {
    return {
      type,
      ...attempt,
      errorType: requiredString(value.errorType, "event.errorType"),
      message: requiredString(value.message, "event.message"),
      receivedAt
    }
  }
  if (type === "command") {
    return { type, ...attempt, receivedAt, event: parseNormalizedEvent(value.event) }
  }
  throw new Error(`Unknown Realtime Worker event type: ${type}`)
}

function parseNormalizedEvent(value: unknown): NormalizedBilibiliDanmakuEvent {
  if (!isRecord(value)) throw new Error("Realtime Worker command event is invalid.")
  const kinds = new Set([
    "DANMAKU", "GIFT", "SUPER_CHAT", "GUARD_BUY", "LIVE", "PREPARING",
    "METRICS", "NOTIFICATION", "UNKNOWN"
  ])
  const kind = requiredString(value.kind, "event.kind")
  if (!kinds.has(kind)) throw new Error(`Unknown Bilibili event kind: ${kind}`)
  const actorValue = isRecord(value.actor) ? value.actor : undefined
  const actorUid = actorValue ? optionalPositiveId(actorValue.uid) : undefined
  const actor = actorValue
    ? {
        ...(actorUid ? { uid: actorUid } : {}),
        ...(typeof actorValue.displayName === "string"
          ? { displayName: actorValue.displayName }
          : {}),
        ...(typeof actorValue.medalName === "string" ? { medalName: actorValue.medalName } : {})
      }
    : undefined
  const giftValue = isRecord(value.gift) ? value.gift : undefined
  const giftId = giftValue ? optionalPositiveId(giftValue.giftId) : undefined
  const gift = giftValue
    ? {
        ...(giftId ? { giftId } : {}),
        ...(typeof giftValue.giftName === "string" ? { giftName: giftValue.giftName } : {}),
        quantity: nonNegativeInteger(giftValue.quantity, "event.gift.quantity"),
        ...(giftValue.coinType === undefined
          ? {}
          : { coinType: requiredString(giftValue.coinType, "event.gift.coinType") }),
        ...(giftValue.price === undefined
          ? {}
          : { price: nonNegativeInteger(giftValue.price, "event.gift.price") }),
        ...(giftValue.totalCoin === undefined
          ? {}
          : { totalCoin: nonNegativeInteger(giftValue.totalCoin, "event.gift.totalCoin") }),
        paid: giftValue.paid === true,
        amountMilliYuan: nonNegativeInteger(
          giftValue.amountMilliYuan,
          "event.gift.amountMilliYuan"
        )
      }
    : undefined
  return {
    command: requiredString(value.command, "event.command"),
    kind: kind as NormalizedBilibiliDanmakuEvent["kind"],
    occurredAt: requiredIso(value.occurredAt, "event.occurredAt"),
    receivedAt: requiredIso(value.receivedAt, "event.receivedAt"),
    ...(actor && Object.keys(actor).length > 0 ? { actor } : {}),
    ...(typeof value.messageText === "string" ? { messageText: value.messageText } : {}),
    ...(typeof value.eventKey === "string" ? { eventKey: value.eventKey } : {}),
    ...(typeof value.sourceEventId === "string" ? { sourceEventId: value.sourceEventId } : {}),
    ...(typeof value.liveStartedAt === "string"
      ? { liveStartedAt: requiredIso(value.liveStartedAt, "event.liveStartedAt") }
      : {}),
    ...(typeof value.liveKey === "string" ? { liveKey: value.liveKey } : {}),
    ...(gift ? { gift } : {}),
    ...(value.amountMilliYuan === undefined
      ? {}
      : { amountMilliYuan: nonNegativeInteger(value.amountMilliYuan, "event.amountMilliYuan") }),
    ...(value.guardLevel === undefined
      ? {}
      : { guardLevel: nonNegativeInteger(value.guardLevel, "event.guardLevel") }),
    ...(value.quantity === undefined
      ? {}
      : { quantity: nonNegativeInteger(value.quantity, "event.quantity") }),
    ...(value.likeCount === undefined
      ? {}
      : { likeCount: nonNegativeInteger(value.likeCount, "event.likeCount") }),
    ...(value.likeIncrement === undefined
      ? {}
      : { likeIncrement: nonNegativeInteger(value.likeIncrement, "event.likeIncrement") }),
    ...(value.watchedCount === undefined
      ? {}
      : { watchedCount: nonNegativeInteger(value.watchedCount, "event.watchedCount") }),
    giftDelta: nonNegativeInteger(value.giftDelta, "event.giftDelta"),
    superChatDelta: nonNegativeInteger(value.superChatDelta, "event.superChatDelta"),
    rawJson: requiredString(value.rawJson, "event.rawJson")
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`)
  return value
}

function requiredInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${field} must be an integer.`)
  return value
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = requiredInteger(value, field)
  if (parsed < 0) throw new Error(`${field} must be non-negative.`)
  return parsed
}

function requiredIso(value: unknown, field: string): string {
  const parsed = requiredString(value, field)
  if (Number.isNaN(new Date(parsed).getTime())) throw new Error(`${field} must be an ISO timestamp.`)
  return parsed
}

function optionalPositiveId(value: unknown): string | undefined {
  return typeof value === "string" && /^[1-9]\d*$/.test(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
