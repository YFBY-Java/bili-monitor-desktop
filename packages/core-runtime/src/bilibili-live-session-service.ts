import {
  BilibiliLiveSessionEventPageSchema,
  BilibiliLiveSessionInsightSchema,
  BilibiliLiveSessionSummaryListSchema,
  BilibiliLiveSessionSummarySchema,
  BilibiliLiveSessionUserListSchema,
  BilibiliLiveSessionIdInputSchema,
  ListBilibiliLiveSessionsInputSchema,
  ListBilibiliLiveSessionUsersInputSchema,
  QueryBilibiliLiveSessionEventsInputSchema,
  QueryBilibiliLiveSessionInsightInputSchema,
  type BilibiliLiveSessionEvent,
  type BilibiliLiveSessionEventPage,
  type BilibiliLiveSessionInsight,
  type BilibiliLiveSessionSummary,
  type BilibiliLiveSessionUser,
  type ListBilibiliLiveSessionsInput,
  type ListBilibiliLiveSessionUsersInput,
  type QueryBilibiliLiveSessionEventsInput,
  type QueryBilibiliLiveSessionInsightInput
} from "@bmd/contracts"
import type {
  ControlDatabase,
  StoredBilibiliLiveRoomMonitor,
  StoredBilibiliLiveSession,
  StoredBilibiliLiveSessionEvent
} from "@bmd/storage"

import { CoreApplicationError } from "./account-subject-service"
import type { NormalizedBilibiliDanmakuEvent } from "./bilibili-live-danmaku-service"

const FACT_KINDS = new Set(["DANMAKU", "GIFT", "SUPER_CHAT", "GUARD_BUY"])
const PAID_KINDS = new Set(["GIFT", "SUPER_CHAT", "GUARD_BUY"])

export interface BilibiliLiveRestObservation {
  liveStatus: number
  liveTime: string | null
  title: string | null
  fetchedAt: string
}

export class BilibiliLiveSessionService {
  constructor(private readonly options: {
    database: ControlDatabase
    idFactory: () => string
    now?: () => Date
  }) {}

  reconcileRest(
    room: StoredBilibiliLiveRoomMonitor,
    observation: BilibiliLiveRestObservation
  ): StoredBilibiliLiveSession | undefined {
    const active = this.options.database.findActiveBilibiliLiveSession(room.monitorId)
    if (
      active?.state === "END_PENDING"
      && active.endSignalAt
      && observation.fetchedAt < active.endSignalAt
    ) return active
    if (observation.liveStatus !== 1) {
      if (active) this.options.database.updateBilibiliLiveSession(
        this.close(active, observation.fetchedAt, "REST_STATUS", observation.title)
      )
      return undefined
    }
    const liveKey = platformKey(observation.liveTime, observation.fetchedAt)
    if (active) {
      if (changedIdentity(active, observation.liveTime, liveKey)) {
        this.options.database.updateBilibiliLiveSession(
          this.close(active, observation.fetchedAt, "RESTART_DETECTED", observation.title)
        )
        return this.open(
          room,
          observation.fetchedAt,
          observation.fetchedAt,
          observation.liveTime,
          liveKey,
          "REST_STATUS",
          observation.title
        )
      }
      const resumed = this.resume(
        active,
        observation.fetchedAt,
        observation.liveTime,
        liveKey,
        true
      )
      this.options.database.updateBilibiliLiveSession(resumed)
      return resumed
    }
    const existing = this.findByIdentity(room.monitorId, observation.liveTime, liveKey)
    if (existing) {
      const resumed = this.resume(
        existing,
        observation.fetchedAt,
        observation.liveTime,
        liveKey,
        true
      )
      this.options.database.updateBilibiliLiveSession(resumed)
      return resumed
    }
    return this.open(
      room,
      observation.fetchedAt,
      observation.fetchedAt,
      observation.liveTime,
      liveKey,
      "REST_STATUS",
      observation.title
    )
  }

  ingest(
    room: StoredBilibiliLiveRoomMonitor,
    transportSessionId: string,
    receiptOrdinal: number,
    protocolVersion: number | undefined,
    event: NormalizedBilibiliDanmakuEvent
  ): boolean {
    if (event.kind === "UNKNOWN") return false
    if (
      event.sourceEventId
      && !event.sourceEventId.startsWith("semantic:")
      && this.options.database.hasBilibiliLiveSessionStrongSourceEvent(
        room.monitorId,
        event.kind,
        event.sourceEventId
      )
    ) return false
    const session = this.routeSession(room, event)
    if (!session || !belongsToSession(session, event.occurredAt)) return false
    const quantity = event.kind === "GIFT"
      ? event.gift?.quantity ?? event.quantity ?? null
      : event.kind === "SUPER_CHAT" || event.kind === "GUARD_BUY"
        ? event.quantity ?? null
        : null
    const paidAmount = nonNegative(event.amountMilliYuan ?? event.gift?.amountMilliYuan)
    const paid = event.kind === "GIFT"
      ? event.gift?.paid === true
      : (event.kind === "SUPER_CHAT" || event.kind === "GUARD_BUY")
        && (paidAmount ?? 0) > 0
    const unitPrice = event.kind === "GIFT"
      ? paid ? nonNegative(event.gift?.price) : null
      : paidAmount !== null && quantity && quantity > 0
        ? Math.floor(paidAmount / quantity)
        : null
    return this.options.database.insertBilibiliLiveSessionEvent({
      eventId: this.options.idFactory(),
      liveSessionId: session.sessionId,
      transportSessionId,
      receiptOrdinal,
      monitorId: room.monitorId,
      roomId: room.roomId,
      eventKey: event.sourceEventId && !event.sourceEventId.startsWith("semantic:")
        ? event.eventKey ?? `${normalizeCommand(event.command)}:${event.sourceEventId}`
        : `receipt:${transportSessionId}:${receiptOrdinal}`,
      sourceEventId: event.sourceEventId ?? null,
      eventKind: event.kind,
      command: event.command || null,
      protocolVersion: protocolVersion === undefined || protocolVersion < 0
        ? null
        : protocolVersion,
      senderUid: positiveId(event.actor?.uid),
      senderName: textOrNull(event.actor?.displayName),
      medalName: textOrNull(event.actor?.medalName),
      messageText: event.messageText ?? null,
      giftId: positiveId(event.gift?.giftId),
      giftName: textOrNull(event.gift?.giftName),
      giftCount: quantity === null ? null : Math.max(0, quantity),
      coinType: textOrNull(event.gift?.coinType),
      unitPriceMilliYuan: unitPrice,
      paidAmountMilliYuan: paidAmount,
      paid,
      guardLevel: nonNegative(event.guardLevel),
      amountSource: amountSource(event, paid),
      occurredAt: event.occurredAt,
      receivedAt: event.receivedAt,
      rawPayloadJson: event.rawJson || "{}",
      createdAt: event.receivedAt
    })
  }

  list(input: ListBilibiliLiveSessionsInput): BilibiliLiveSessionSummary[] {
    const parsed = ListBilibiliLiveSessionsInputSchema.parse(input)
    return BilibiliLiveSessionSummaryListSchema.parse(
      this.options.database.listBilibiliLiveSessions(parsed.roomMonitorId, parsed.limit)
        .map((session) => this.summary(session))
    )
  }

  get(sessionId: string): BilibiliLiveSessionSummary {
    const parsed = BilibiliLiveSessionIdInputSchema.parse({ sessionId })
    const session = this.options.database.findBilibiliLiveSessionById(parsed.sessionId)
    if (!session) {
      throw new CoreApplicationError(
        "BILIBILI_LIVE_SESSION_NOT_FOUND",
        `直播场次不存在：${parsed.sessionId}`
      )
    }
    return BilibiliLiveSessionSummarySchema.parse(this.summary(session))
  }

  users(input: ListBilibiliLiveSessionUsersInput): BilibiliLiveSessionUser[] {
    const parsed = ListBilibiliLiveSessionUsersInputSchema.parse(input)
    this.get(parsed.sessionId)
    return BilibiliLiveSessionUserListSchema.parse(
      aggregateSessionUsers(this.factEvents(parsed.sessionId)).slice(0, parsed.limit)
    )
  }

  events(input: QueryBilibiliLiveSessionEventsInput): BilibiliLiveSessionEventPage {
    const parsed = QueryBilibiliLiveSessionEventsInputSchema.parse(input)
    this.get(parsed.sessionId)
    const keyword = parsed.keyword?.trim().toLocaleLowerCase()
    const filtered = this.factEvents(parsed.sessionId).filter((event) => {
      if (parsed.kind && event.eventKind !== parsed.kind) return false
      if (parsed.userUid && event.senderUid !== parsed.userUid) return false
      if (parsed.paid !== undefined && event.paid !== parsed.paid) return false
      if (keyword && ![
        event.messageText,
        event.senderName,
        event.medalName,
        event.giftName
      ].some((value) => value?.toLocaleLowerCase().includes(keyword))) return false
      return true
    })
    const offset = (parsed.page - 1) * parsed.size
    return BilibiliLiveSessionEventPageSchema.parse({
      items: filtered.slice(offset, offset + parsed.size).map(toEventView),
      total: filtered.length,
      page: parsed.page,
      size: parsed.size
    })
  }

  insight(input: QueryBilibiliLiveSessionInsightInput): BilibiliLiveSessionInsight {
    const parsed = QueryBilibiliLiveSessionInsightInputSchema.parse(input)
    const summary = this.get(parsed.sessionId)
    const session = this.requireSession(parsed.sessionId)
    const events = this.factEvents(parsed.sessionId)
    const users = aggregateSessionUsers(events)
    const verified = users.filter((user) => user.identityQuality === "VERIFIED_UID")
    const payers = verified.filter((user) => user.paidAmountMilliYuan > 0)
    const coveredSeconds = mergeCoverageIntervals(coverageIntervals(
      session,
      this.options.database.listBilibiliLiveDanmakuSessionsForMonitor(session.monitorId),
      (this.options.now ?? (() => new Date()))().toISOString()
    ))
    const timeline = timeBuckets(events, parsed.bucketSeconds)
    const paidAmount = summary.paidAmountMilliYuan
    const topPaid = payers.map((user) => user.paidAmountMilliYuan).sort((a, b) => b - a)
    const kpis = {
      danmakuPerMinute: summary.danmakuCount === null || coveredSeconds <= 0
        ? null
        : round(summary.danmakuCount * 60 / coveredSeconds),
      payerConversionRate: summary.paidUserCount === null || summary.interactingUserCount === null
        ? null
        : summary.interactingUserCount === 0
          ? 0
          : round(summary.paidUserCount / summary.interactingUserCount),
      arppuMilliYuan: paidAmount === null || summary.paidUserCount === null
        ? null
        : summary.paidUserCount === 0 ? 0 : Math.round(paidAmount / summary.paidUserCount),
      paidAmountMilliYuan: paidAmount,
      topFiveRevenueShare: paidAmount === null
        ? null
        : paidAmount === 0
          ? 0
          : round(Math.min(1, topPaid.slice(0, 5).reduce((a, b) => a + b, 0) / paidAmount))
    }
    const danmakuEvents = events.filter((event) => event.eventKind === "DANMAKU")
    const identifiedDanmaku = danmakuEvents.filter((event) => event.senderUid)
    const danmakuByUser = counts(identifiedDanmaku.map((event) => event.senderUid as string))
    const nonblankMessages = danmakuEvents.map((event) => event.messageText?.trim()).filter(Boolean) as string[]
    const normalizedMessages = new Map<string, string[]>()
    for (const message of nonblankMessages) {
      const key = message.toLocaleLowerCase()
      const values = normalizedMessages.get(key) ?? []
      values.push(message)
      normalizedMessages.set(key, values)
    }
    const repeatedMessages = [...normalizedMessages.entries()]
      .filter(([, values]) => values.length > 1)
      .map(([key, values]) => ({ key, values }))
      .sort((left, right) =>
        right.values.length - left.values.length
        || identifiedMessageUsers(danmakuEvents, right.key) - identifiedMessageUsers(danmakuEvents, left.key)
        || left.key.localeCompare(right.key)
      )
      .slice(0, 5)
      .map(({ key, values }) => ({
        messageText: [...values].sort()[0] ?? key,
        messageCount: values.length,
        userCount: identifiedMessageUsers(danmakuEvents, key)
      }))
    const stages = sessionStages(danmakuEvents)
    const giftMix = giftMixRows(events, paidAmount)
    const spendTiers = spendTierRows(payers, paidAmount)
    const returningPayerUids = new Set(
      this.options.database.findPriorBilibiliLivePaidUserUids(session.monitorId, session.startedAt)
    )
    const returningPayerRate = payers.length === 0
      ? 0
      : round(payers.filter((user) => user.userUid && returningPayerUids.has(user.userUid)).length / payers.length)
    const latencies = events.map((event) => Math.max(
      0,
      new Date(event.receivedAt).getTime() - new Date(event.occurredAt).getTime()
    )).sort((a, b) => a - b)
    const insight = {
      sessionId: parsed.sessionId,
      bucketSeconds: parsed.bucketSeconds,
      kpis,
      timeline,
      peaks: peaks(timeline),
      userSegments: userSegments(verified),
      giftMix,
      findings: [] as BilibiliLiveSessionInsight["findings"],
      danmakuDepth: summary.danmakuCount === null
        ? {
            identifiedDanmakuUserCount: null,
            identifiedDanmakuCount: null,
            messagesPerActiveUser: null,
            repeatInteractionRate: null,
            sustainedParticipationRate: null,
            duplicateMessageRate: null,
            stages: [],
            repeatedMessages: []
          }
        : {
            identifiedDanmakuUserCount: danmakuByUser.size,
            identifiedDanmakuCount: identifiedDanmaku.length,
            messagesPerActiveUser: danmakuByUser.size === 0
              ? 0
              : round(identifiedDanmaku.length / danmakuByUser.size),
            repeatInteractionRate: danmakuByUser.size === 0
              ? 0
              : round([...danmakuByUser.values()].filter((count) => count >= 3).length / danmakuByUser.size),
            sustainedParticipationRate: danmakuByUser.size === 0
              ? 0
              : round(sustainedUsers(identifiedDanmaku) / danmakuByUser.size),
            duplicateMessageRate: nonblankMessages.length === 0
              ? 0
              : round(1 - normalizedMessages.size / nonblankMessages.length),
            stages,
            repeatedMessages
          },
      paymentDepth: paidAmount === null || summary.paidUserCount === null
        ? {
            payerCount: null,
            repeatPayerRate: null,
            engagedPayerRate: null,
            returningPayerRate: null,
            medianPayerAmountMilliYuan: null,
            medianConversionLagSeconds: null,
            topOneRevenueShare: null,
            spendTiers: []
          }
        : {
            payerCount: payers.length,
            repeatPayerRate: payers.length === 0
              ? 0
              : round(payers.filter((user) => user.paidEventCount >= 2).length / payers.length),
            engagedPayerRate: payers.length === 0
              ? 0
              : round(payers.filter((user) => user.danmakuCount > 0).length / payers.length),
            returningPayerRate,
            medianPayerAmountMilliYuan: median(topPaid),
            medianConversionLagSeconds: medianConversionLag(events),
            topOneRevenueShare: paidAmount === 0
              ? 0
              : round(Math.min(1, (topPaid[0] ?? 0) / paidAmount)),
            spendTiers
          },
      quality: {
        coverageStatus: summary.coverageStatus,
        coveredSeconds: Math.floor(coveredSeconds),
        identityResolvedEventShare: events.length === 0
          ? null
          : round(events.filter((event) => event.senderUid).length / events.length),
        supportedEventCount: events.length,
        unresolvedInteractionEventCount: summary.unresolvedInteractingEventCount ?? 0,
        eventLatencyP95Millis: percentile95(latencies),
        caveat: caveat(summary.coverageStatus)
      }
    }
    insight.findings = insightFindings(
      timeline,
      kpis,
      insight.danmakuDepth,
      insight.paymentDepth
    )
    return BilibiliLiveSessionInsightSchema.parse(insight)
  }

  private routeSession(
    room: StoredBilibiliLiveRoomMonitor,
    event: NormalizedBilibiliDanmakuEvent
  ): StoredBilibiliLiveSession | undefined {
    if (event.kind === "LIVE") return this.observeLive(room, event)
    if (event.kind === "PREPARING") return this.observePreparing(room, event)
    const active = this.options.database.findActiveBilibiliLiveSession(room.monitorId)
    if (FACT_KINDS.has(event.kind)) {
      if (!active) {
        const historical = this.options.database.findBilibiliLiveSessionByEventTime(
          room.monitorId,
          event.occurredAt
        )
        return historical ?? this.open(
          room,
          event.receivedAt,
          event.occurredAt,
          null,
          `activity:${event.occurredAt}`,
          "WS_EVENT_ACTIVITY",
          room.title
        )
      }
      if (event.occurredAt < active.startedAt) {
        return this.options.database.findBilibiliLiveSessionByEventTime(
          room.monitorId,
          event.occurredAt
        ) ?? active
      }
      if (
        active.state === "END_PENDING"
        && active.endSignalAt
        && event.occurredAt <= active.endSignalAt
      ) return active
      const resumed = this.resume(active, event.receivedAt, null, null, false)
      this.options.database.updateBilibiliLiveSession(resumed)
      return resumed
    }
    return active
  }

  private observeLive(
    room: StoredBilibiliLiveRoomMonitor,
    event: NormalizedBilibiliDanmakuEvent
  ): StoredBilibiliLiveSession {
    const observationTime = event.receivedAt || event.occurredAt
    const signalTime = event.occurredAt || observationTime
    const resolvedKey = event.liveKey?.trim() || platformKey(event.liveStartedAt ?? null, observationTime)
    const active = this.options.database.findActiveBilibiliLiveSession(room.monitorId)
    if (!active) {
      const existing = this.findByIdentity(room.monitorId, event.liveStartedAt ?? null, resolvedKey)
      if (existing) {
        const resumed = this.resume(existing, observationTime, event.liveStartedAt ?? null, resolvedKey, true)
        this.options.database.updateBilibiliLiveSession(resumed)
        return resumed
      }
      return this.open(
        room,
        observationTime,
        signalTime,
        event.liveStartedAt ?? null,
        resolvedKey,
        "WS_LIVE",
        room.title
      )
    }
    if (
      changedIdentity(active, event.liveStartedAt ?? null, resolvedKey)
      && (event.liveStartedAt ?? signalTime) < active.startedAt
    ) return this.findByIdentity(room.monitorId, event.liveStartedAt ?? null, resolvedKey) ?? active
    if (active.state === "END_PENDING" && active.endSignalAt && signalTime <= active.endSignalAt) {
      return active
    }
    if (changedIdentity(active, event.liveStartedAt ?? null, resolvedKey)) {
      this.options.database.updateBilibiliLiveSession(
        this.close(active, observationTime, "RESTART_DETECTED", room.title)
      )
      return this.findByIdentity(room.monitorId, event.liveStartedAt ?? null, resolvedKey)
        ?? this.open(
          room,
          observationTime,
          signalTime,
          event.liveStartedAt ?? null,
          resolvedKey,
          "WS_LIVE",
          room.title
        )
    }
    const resumed = this.resume(active, observationTime, event.liveStartedAt ?? null, resolvedKey, true)
    this.options.database.updateBilibiliLiveSession(resumed)
    return resumed
  }

  private observePreparing(
    room: StoredBilibiliLiveRoomMonitor,
    event: NormalizedBilibiliDanmakuEvent
  ): StoredBilibiliLiveSession | undefined {
    const active = this.options.database.findActiveBilibiliLiveSession(room.monitorId)
    if (!active) {
      return event.liveKey && isRealLiveKey(event.liveKey)
        ? this.options.database.findBilibiliLiveSessionByLiveKey(room.monitorId, event.liveKey)
        : this.options.database.findBilibiliLiveSessionByEventTime(room.monitorId, event.occurredAt)
    }
    if (
      (event.liveKey && changedRealLiveKey(active.liveKey, event.liveKey))
      || event.occurredAt < active.startedAt
    ) {
      return (event.liveKey
        ? this.options.database.findBilibiliLiveSessionByLiveKey(room.monitorId, event.liveKey)
        : undefined)
        ?? this.options.database.findBilibiliLiveSessionByEventTime(room.monitorId, event.occurredAt)
        ?? active
    }
    if (active.state === "END_PENDING") return active
    const pending: StoredBilibiliLiveSession = {
      ...active,
      state: "END_PENDING",
      endSignalAt: event.occurredAt,
      endSource: "WS_PREPARING",
      lastObservedAt: latest(active.lastObservedAt, event.receivedAt),
      updatedAt: event.receivedAt
    }
    this.options.database.updateBilibiliLiveSession(pending)
    return pending
  }

  private open(
    room: StoredBilibiliLiveRoomMonitor,
    detectedAt: string,
    occurredAt: string,
    platformLiveTime: string | null,
    liveKey: string,
    source: string,
    title: string | null
  ): StoredBilibiliLiveSession {
    const session: StoredBilibiliLiveSession = {
      sessionId: this.options.idFactory(),
      monitorId: room.monitorId,
      uid: room.uid,
      roomId: room.roomId,
      state: "OPEN",
      platformLiveTime,
      liveKey,
      startedAt: platformLiveTime ?? occurredAt,
      startDetectedAt: detectedAt,
      startSource: source,
      endSignalAt: null,
      endedAt: null,
      endDetectedAt: null,
      endSource: null,
      lastLiveObservedAt: detectedAt,
      lastObservedAt: detectedAt,
      titleAtStart: title,
      titleAtEnd: null,
      createdAt: detectedAt,
      updatedAt: detectedAt
    }
    return this.options.database.insertBilibiliLiveSession(session)
  }

  private resume(
    session: StoredBilibiliLiveSession,
    observedAt: string,
    platformLiveTime: string | null,
    liveKey: string | null,
    liveObservation: boolean
  ): StoredBilibiliLiveSession {
    const enrich = session.platformLiveTime === null && platformLiveTime !== null
    let resolvedKey = session.liveKey
    if (liveKey && isRealLiveKey(liveKey)) resolvedKey = liveKey
    else if (enrich && !isRealLiveKey(session.liveKey) && liveKey?.trim()) resolvedKey = liveKey
    return {
      ...session,
      state: "OPEN",
      platformLiveTime: enrich ? platformLiveTime : session.platformLiveTime,
      liveKey: resolvedKey,
      startedAt: enrich ? platformLiveTime : session.startedAt,
      endSignalAt: null,
      endedAt: null,
      endDetectedAt: null,
      endSource: null,
      lastLiveObservedAt: liveObservation
        ? latest(session.lastLiveObservedAt, observedAt)
        : session.lastLiveObservedAt,
      lastObservedAt: latest(session.lastObservedAt, observedAt),
      updatedAt: observedAt
    }
  }

  private close(
    session: StoredBilibiliLiveSession,
    detectedAt: string,
    source: string,
    titleAtEnd: string | null
  ): StoredBilibiliLiveSession {
    const signal = session.endSignalAt ?? detectedAt
    return {
      ...session,
      state: "CLOSED",
      endedAt: signal < session.startedAt ? session.startedAt : signal,
      endDetectedAt: detectedAt,
      endSource: source,
      lastObservedAt: latest(session.lastObservedAt, detectedAt),
      titleAtEnd,
      updatedAt: detectedAt
    }
  }

  private findByIdentity(
    monitorId: string,
    platformLiveTime: string | null,
    liveKey: string
  ): StoredBilibiliLiveSession | undefined {
    if (platformLiveTime) {
      const byTime = this.options.database.findBilibiliLiveSessionByPlatformTime(
        monitorId,
        platformLiveTime
      )
      if (byTime) return byTime
    }
    return isRealLiveKey(liveKey)
      ? this.options.database.findBilibiliLiveSessionByLiveKey(monitorId, liveKey)
      : undefined
  }

  private requireSession(sessionId: string): StoredBilibiliLiveSession {
    const session = this.options.database.findBilibiliLiveSessionById(sessionId)
    if (!session) throw new CoreApplicationError("BILIBILI_LIVE_SESSION_NOT_FOUND", `直播场次不存在：${sessionId}`)
    return session
  }

  private factEvents(sessionId: string): StoredBilibiliLiveSessionEvent[] {
    return this.options.database.findBilibiliLiveSessionEvents(sessionId, 100_000)
      .filter((event) => FACT_KINDS.has(event.eventKind))
  }

  private summary(session: StoredBilibiliLiveSession): BilibiliLiveSessionSummary {
    const events = this.factEvents(session.sessionId)
    const transport = coverageIntervals(
      session,
      this.options.database.listBilibiliLiveDanmakuSessionsForMonitor(session.monitorId)
    )
    const boundaryOnly = session.startSource.startsWith("STATUS_EVENT_BACKFILL")
    const unknown = boundaryOnly && events.length === 0
    const gifts = events.filter((event) => event.eventKind === "GIFT")
    const paidEvents = events.filter(isPaidEvent)
    const identified = events.filter((event) => event.senderUid)
    const values = {
      id: session.sessionId,
      monitorId: session.monitorId,
      uid: session.uid,
      roomId: session.roomId,
      state: session.state,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      startSource: session.startSource,
      endSource: session.endSource,
      coverageStatus: boundaryOnly
        ? "BOUNDARY_ONLY" as const
        : transport.length === 0
          ? "NO_ONLINE_COVERAGE" as const
          : "RECEIVED_WHILE_ONLINE" as const,
      transportSessionCount: transport.length,
      captureStartedAt: transport.length === 0
        ? null
        : transport.map((item) => item.start).sort()[0] ?? null,
      captureEndedAt: transport.length === 0 || transport.some((item) => item.open)
        ? null
        : transport.map((item) => item.end).sort().at(-1) ?? null,
      danmakuCount: nullableMetric(unknown, events.filter((event) => event.eventKind === "DANMAKU").length),
      giftEventCount: nullableMetric(unknown, gifts.length),
      giftCount: nullableMetric(unknown, sum(gifts, giftQuantity)),
      freeGiftCount: nullableMetric(unknown, sum(gifts.filter((event) => !event.paid), giftQuantity)),
      giftSenderCount: nullableMetric(unknown, uniquePositive(gifts.map((event) => event.senderUid))),
      paidUserCount: nullableMetric(unknown, uniquePositive(paidEvents.map((event) => event.senderUid))),
      interactingUserCount: nullableMetric(unknown, uniquePositive(identified.map((event) => event.senderUid))),
      unresolvedInteractingEventCount: nullableMetric(unknown, events.filter((event) => !event.senderUid).length),
      unresolvedGiftEventCount: nullableMetric(unknown, gifts.filter((event) => !event.senderUid).length),
      unresolvedPaidEventCount: nullableMetric(unknown, paidEvents.filter((event) => !event.senderUid).length),
      paidEventCount: nullableMetric(unknown, paidEvents.length),
      paidAmountMilliYuan: nullableMetric(
        unknown,
        sum(paidEvents, (event) => event.paidAmountMilliYuan ?? 0)
      ),
      firstEventAt: events[0]?.occurredAt ?? null,
      lastEventAt: events.at(-1)?.occurredAt ?? null
    }
    return BilibiliLiveSessionSummarySchema.parse(values)
  }
}

function toEventView(event: StoredBilibiliLiveSessionEvent): BilibiliLiveSessionEvent {
  return {
    id: event.eventId,
    sessionId: event.liveSessionId,
    eventKind: event.eventKind as BilibiliLiveSessionEvent["eventKind"],
    command: event.command,
    senderUid: event.senderUid,
    senderName: event.senderName,
    medalName: event.medalName,
    messageText: event.messageText,
    giftId: event.giftId,
    giftName: event.giftName,
    giftCount: event.giftCount,
    paid: event.paid,
    paidAmountMilliYuan: event.paidAmountMilliYuan,
    guardLevel: event.guardLevel,
    occurredAt: event.occurredAt,
    receivedAt: event.receivedAt
  }
}

function coverageIntervals(
  session: StoredBilibiliLiveSession,
  transports: Array<{ connectedAt: string | null; endedAt: string | null }>,
  now = new Date().toISOString()
): Array<{ start: string; end: string; open: boolean }> {
  if (session.startSource.startsWith("STATUS_EVENT_BACKFILL")) return []
  const sessionEnd = session.endedAt
  return transports.flatMap((transport) => {
    if (!transport.connectedAt) return []
    if (sessionEnd && transport.connectedAt >= sessionEnd) return []
    if (transport.endedAt && transport.endedAt <= session.startedAt) return []
    const start = transport.connectedAt > session.startedAt ? transport.connectedAt : session.startedAt
    const endCandidate = transport.endedAt ?? sessionEnd
    const end = endCandidate ?? now
    if (end <= start) return []
    return [{ start, end, open: !transport.endedAt && !sessionEnd }]
  })
}

function mergeCoverageIntervals(intervals: Array<{ start: string; end: string }>): number {
  const ordered = intervals
    .filter((interval) => interval.start < interval.end)
    .sort((left, right) => left.start.localeCompare(right.start))
  const first = ordered[0]
  if (!first) return 0
  let currentStart = new Date(first.start).getTime()
  let currentEnd = new Date(first.end).getTime()
  let totalMillis = 0
  for (const interval of ordered.slice(1)) {
    const start = new Date(interval.start).getTime()
    const end = new Date(interval.end).getTime()
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end)
      continue
    }
    totalMillis += currentEnd - currentStart
    currentStart = start
    currentEnd = end
  }
  return Math.floor((totalMillis + currentEnd - currentStart) / 1_000)
}

function changedIdentity(
  session: StoredBilibiliLiveSession,
  platformLiveTime: string | null,
  liveKey: string
): boolean {
  return Boolean(
    session.platformLiveTime && platformLiveTime && session.platformLiveTime !== platformLiveTime
  ) || changedRealLiveKey(session.liveKey, liveKey)
}

function changedRealLiveKey(left: string, right: string): boolean {
  return isRealLiveKey(left) && isRealLiveKey(right) && left !== right
}

function isRealLiveKey(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
    && !["platform:", "activity:", "rest-observed:", "migration-current:"].some(
      (prefix) => value?.startsWith(prefix)
    )
}

function platformKey(platformLiveTime: string | null, observedAt: string): string {
  return platformLiveTime ? `platform:${platformLiveTime}` : `rest-observed:${observedAt}`
}

function belongsToSession(session: StoredBilibiliLiveSession, eventTime: string): boolean {
  if (eventTime < session.startedAt) return false
  return session.endedAt === null || eventTime <= session.endedAt
}

function latest(left: string | null, right: string): string {
  return left && left > right ? left : right
}

function positiveId(value: string | undefined): string | null {
  return value && /^[1-9]\d*$/.test(value) ? value : null
}

function nonNegative(value: number | undefined): number | null {
  return value === undefined || !Number.isSafeInteger(value) || value < 0 ? null : value
}

function textOrNull(value: string | undefined): string | null {
  return value?.trim() ? value.trim() : null
}

function normalizeCommand(command: string): string {
  return command.split(":", 1)[0] ?? command
}

function amountSource(event: NormalizedBilibiliDanmakuEvent, paid: boolean): string | null {
  if (event.kind === "GIFT") {
    if (!paid) return "FREE_COIN_TYPE"
    return event.gift?.totalCoin !== undefined ? "TOTAL_COIN" : "PRICE_X_QUANTITY"
  }
  if (event.kind === "SUPER_CHAT") return "SUPER_CHAT_PRICE"
  if (event.kind === "GUARD_BUY") return "GUARD_PRICE_X_QUANTITY"
  return null
}

function isPaidEvent(event: StoredBilibiliLiveSessionEvent): boolean {
  return PAID_KINDS.has(event.eventKind) && (event.paid || (event.paidAmountMilliYuan ?? 0) > 0)
}

function giftQuantity(event: StoredBilibiliLiveSessionEvent): number {
  return event.giftCount ?? 1
}

function sum<T>(items: T[], select: (item: T) => number): number {
  return items.reduce((total, item) => total + select(item), 0)
}

function uniquePositive(values: Array<string | null>): number {
  return new Set(values.filter((value): value is string => Boolean(value))).size
}

function aggregateSessionUsers(events: StoredBilibiliLiveSessionEvent[]): BilibiliLiveSessionUser[] {
  const grouped = new Map<string, StoredBilibiliLiveSessionEvent[]>()
  for (const event of events) {
    const actorKey = event.senderUid ? `uid:${event.senderUid}` : `event:${event.eventId}`
    const values = grouped.get(actorKey) ?? []
    values.push(event)
    grouped.set(actorKey, values)
  }
  return [...grouped.entries()].map(([actorKey, values]): BilibiliLiveSessionUser => {
    const paidEvents = values.filter(isPaidEvent)
    return {
      actorKey,
      identityQuality: actorKey.startsWith("uid:") ? "VERIFIED_UID" : "UNRESOLVED_EVENT",
      userUid: actorKey.startsWith("uid:") ? actorKey.slice(4) : null,
      displayName: [...values].reverse().find((event) => event.senderName?.trim())?.senderName ?? null,
      danmakuCount: values.filter((event) => event.eventKind === "DANMAKU").length,
      giftEventCount: values.filter((event) => event.eventKind === "GIFT").length,
      giftCount: sum(values.filter((event) => event.eventKind === "GIFT"), giftQuantity),
      freeGiftCount: sum(
        values.filter((event) => event.eventKind === "GIFT" && !event.paid),
        giftQuantity
      ),
      paidEventCount: paidEvents.length,
      paidAmountMilliYuan: sum(paidEvents, (event) => event.paidAmountMilliYuan ?? 0),
      firstSeenAt: values[0]?.occurredAt ?? values[0]?.receivedAt ?? new Date(0).toISOString(),
      lastSeenAt: values.at(-1)?.occurredAt ?? values.at(-1)?.receivedAt ?? new Date(0).toISOString()
    }
  }).sort((left, right) =>
    right.paidAmountMilliYuan - left.paidAmountMilliYuan
    || right.giftCount - left.giftCount
    || right.danmakuCount - left.danmakuCount
    || left.actorKey.localeCompare(right.actorKey)
  )
}

function nullableMetric(unknown: boolean, value: number): number | null {
  return unknown ? null : value
}

function counts(values: string[]): Map<string, number> {
  const result = new Map<string, number>()
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1)
  return result
}

function timeBuckets(
  events: StoredBilibiliLiveSessionEvent[],
  bucketSeconds: 60 | 300 | 900
): BilibiliLiveSessionInsight["timeline"] {
  const buckets = new Map<number, StoredBilibiliLiveSessionEvent[]>()
  const millis = bucketSeconds * 1_000
  for (const event of events) {
    const start = Math.floor(new Date(event.occurredAt).getTime() / millis) * millis
    const group = buckets.get(start) ?? []
    group.push(event)
    buckets.set(start, group)
  }
  return [...buckets.entries()].sort(([left], [right]) => left - right).map(([start, values]) => ({
    bucketStart: new Date(start).toISOString(),
    danmakuCount: values.filter((event) => event.eventKind === "DANMAKU").length,
    paidEventCount: values.filter(isPaidEvent).length,
    paidAmountMilliYuan: sum(values.filter(isPaidEvent), (event) => event.paidAmountMilliYuan ?? 0),
    activeUserCount: uniquePositive(values.map((event) => event.senderUid))
  }))
}

function peaks(timeline: BilibiliLiveSessionInsight["timeline"]): BilibiliLiveSessionInsight["peaks"] {
  const result: BilibiliLiveSessionInsight["peaks"] = []
  const interaction = [...timeline].sort((a, b) => b.danmakuCount - a.danmakuCount)[0]
  if (interaction && interaction.danmakuCount > 0) result.push({
    type: "INTERACTION",
    bucketStart: interaction.bucketStart,
    value: interaction.danmakuCount,
    label: "弹幕峰值"
  })
  const revenue = [...timeline].sort((a, b) => b.paidAmountMilliYuan - a.paidAmountMilliYuan)[0]
  if (revenue && revenue.paidAmountMilliYuan > 0) result.push({
    type: "REVENUE",
    bucketStart: revenue.bucketStart,
    value: revenue.paidAmountMilliYuan,
    label: "付费峰值"
  })
  return result
}

function userSegments(users: BilibiliLiveSessionUser[]): BilibiliLiveSessionInsight["userSegments"] {
  const segments = [
    ["CORE_SUPPORTER", "核心支持者", users.filter((user) => user.paidAmountMilliYuan > 0 && user.danmakuCount > 0).length, "既有弹幕互动，也发生付费"],
    ["SILENT_PAYER", "静默付费者", users.filter((user) => user.paidAmountMilliYuan > 0 && user.danmakuCount === 0).length, "有付费，但本场没有弹幕"],
    ["ACTIVE_UNPAID", "活跃未付费", users.filter((user) => user.paidAmountMilliYuan === 0 && user.danmakuCount >= 3).length, "至少 3 条弹幕，尚未付费"],
    ["CASUAL_INTERACTOR", "轻度互动", users.filter((user) => user.paidAmountMilliYuan === 0 && user.danmakuCount < 3).length, "少于 3 条弹幕，尚未付费"]
  ] as const
  return segments.map(([code, label, userCount, description]) => ({ code, label, userCount, description }))
}

function giftMixRows(
  events: StoredBilibiliLiveSessionEvent[],
  totalPaid: number | null
): BilibiliLiveSessionInsight["giftMix"] {
  const grouped = new Map<string, StoredBilibiliLiveSessionEvent[]>()
  for (const event of events.filter((item) => PAID_KINDS.has(item.eventKind))) {
    const name = event.giftName?.trim() || event.command || event.eventKind
    const key = `${event.eventKind}:${name}`
    const values = grouped.get(key) ?? []
    values.push(event)
    grouped.set(key, values)
  }
  return [...grouped.entries()].map(([key, values]) => {
    const [eventKind = "GIFT", ...parts] = key.split(":")
    const paidAmountMilliYuan = sum(values, (event) => event.paidAmountMilliYuan ?? 0)
    return {
      giftName: parts.join(":"),
      eventKind,
      giftCount: sum(values, giftQuantity),
      paidAmountMilliYuan,
      revenueShare: !totalPaid ? 0 : round(paidAmountMilliYuan / totalPaid)
    }
  }).sort((a, b) =>
    b.paidAmountMilliYuan - a.paidAmountMilliYuan
    || b.giftCount - a.giftCount
    || a.giftName.localeCompare(b.giftName)
  ).slice(0, 12)
}

function sessionStages(
  events: StoredBilibiliLiveSessionEvent[]
): BilibiliLiveSessionInsight["danmakuDepth"]["stages"] {
  const start = events.length === 0 ? 0 : Math.min(...events.map((event) => new Date(event.occurredAt).getTime()))
  const end = events.length === 0 ? start : Math.max(...events.map((event) => new Date(event.occurredAt).getTime()))
  const duration = Math.max(1, end - start)
  const definitions = [["OPENING", "开场"], ["MIDDLE", "中段"], ["ENDING", "收尾"]] as const
  return definitions.map(([code, label], stage) => {
    const values = events.filter((event) => Math.min(2, Math.floor(
      (new Date(event.occurredAt).getTime() - start) / duration * 3
    )) === stage)
    return {
      code,
      label,
      danmakuCount: values.length,
      activeUserCount: uniquePositive(values.map((event) => event.senderUid)),
      messageShare: events.length === 0 ? 0 : round(values.length / events.length)
    }
  })
}

function sustainedUsers(
  events: StoredBilibiliLiveSessionEvent[]
): number {
  const byUid = new Map<string, Set<number>>()
  const start = events.length === 0 ? 0 : Math.min(...events.map((event) => new Date(event.occurredAt).getTime()))
  const end = events.length === 0 ? start : Math.max(...events.map((event) => new Date(event.occurredAt).getTime()))
  const duration = Math.max(1, end - start)
  for (const event of events) {
    if (!event.senderUid) continue
    const stage = Math.min(2, Math.max(0, Math.floor(
      (new Date(event.occurredAt).getTime() - start) / duration * 3
    )))
    const stages = byUid.get(event.senderUid) ?? new Set<number>()
    stages.add(stage)
    byUid.set(event.senderUid, stages)
  }
  return [...byUid.values()].filter((stages) => stages.size >= 2).length
}

function spendTierRows(
  payers: BilibiliLiveSessionUser[],
  totalPaid: number | null
): BilibiliLiveSessionInsight["paymentDepth"]["spendTiers"] {
  const definitions = [
    ["LIGHT", "轻量支持", (value: number) => value < 1_000],
    ["STANDARD", "常规支持", (value: number) => value >= 1_000 && value < 10_000],
    ["CORE", "核心支持", (value: number) => value >= 10_000]
  ] as const
  return definitions.map(([code, label, matches]) => {
    const values = payers.filter((user) => matches(user.paidAmountMilliYuan))
    const paidAmountMilliYuan = sum(values, (user) => user.paidAmountMilliYuan)
    return {
      code,
      label,
      userCount: values.length,
      paidAmountMilliYuan,
      revenueShare: !totalPaid ? 0 : round(paidAmountMilliYuan / totalPaid)
    }
  })
}

function insightFindings(
  timeline: BilibiliLiveSessionInsight["timeline"],
  kpis: BilibiliLiveSessionInsight["kpis"],
  danmakuDepth: BilibiliLiveSessionInsight["danmakuDepth"],
  paymentDepth: BilibiliLiveSessionInsight["paymentDepth"]
): BilibiliLiveSessionInsight["findings"] {
  const result: BilibiliLiveSessionInsight["findings"] = []
  if (timeline.some((bucket) => bucket.danmakuCount >= 5 && bucket.paidAmountMilliYuan === 0)) {
    result.push({
      code: "HEAT_WITHOUT_PAYMENT",
      level: "OPPORTUNITY",
      title: "高互动未转化",
      description: "弹幕峰值时段没有付费，可回看当时话题并尝试增加明确的支持引导。"
    })
  }
  if (
    kpis.topFiveRevenueShare !== null
    && kpis.paidAmountMilliYuan !== null
    && kpis.paidAmountMilliYuan > 0
    && kpis.topFiveRevenueShare >= 0.8
  ) result.push({
    code: "REVENUE_CONCENTRATION",
    level: "RISK",
    title: "收入集中度较高",
    description: "Top 5 付费用户贡献达到 80% 以上，建议同时维护核心用户并扩大普通付费用户规模。"
  })
  if (
    danmakuDepth.identifiedDanmakuUserCount !== null
    && danmakuDepth.identifiedDanmakuUserCount >= 20
    && danmakuDepth.repeatInteractionRate !== null
    && danmakuDepth.repeatInteractionRate < 0.2
  ) result.push({
    code: "LOW_REPEAT_INTERACTION",
    level: "OPPORTUNITY",
    title: "重复互动偏低",
    description: "发过 3 条及以上弹幕的用户不足 20%，可增加追问、投票或连续话题来促成二次互动。"
  })
  if (
    paymentDepth.payerCount !== null
    && paymentDepth.payerCount >= 5
    && paymentDepth.returningPayerRate !== null
    && paymentDepth.returningPayerRate < 0.2
  ) result.push({
    code: "LOW_RETURNING_PAYER",
    level: "OPPORTUNITY",
    title: "历史复购者偏少",
    description: "已记录历史中再次付费的用户不足 20%，可加强感谢反馈和下次直播召回。"
  })
  if (result.length === 0) result.push({
    code: "NO_STRONG_SIGNAL",
    level: "INFO",
    title: "暂未发现强信号",
    description: "当前样本没有命中高置信规则，建议结合更多场次观察。"
  })
  return result
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle] ?? null
    : Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
}

function medianConversionLag(events: StoredBilibiliLiveSessionEvent[]): number | null {
  const firstDanmaku = new Map<string, number>()
  const firstPaid = new Map<string, number>()
  for (const event of events) {
    if (!event.senderUid) continue
    const time = new Date(event.occurredAt).getTime()
    if (event.eventKind === "DANMAKU" && !firstDanmaku.has(event.senderUid)) firstDanmaku.set(event.senderUid, time)
    if (isPaidEvent(event) && !firstPaid.has(event.senderUid)) firstPaid.set(event.senderUid, time)
  }
  const lags = [...firstPaid.entries()].flatMap(([uid, paidAt]) => {
    const interactedAt = firstDanmaku.get(uid)
    return interactedAt === undefined || interactedAt > paidAt
      ? []
      : [Math.floor((paidAt - interactedAt) / 1_000)]
  })
  return median(lags)
}

function identifiedMessageUsers(events: StoredBilibiliLiveSessionEvent[], key: string): number {
  return new Set(events
    .filter((event) => event.messageText?.trim().toLocaleLowerCase() === key && event.senderUid)
    .map((event) => event.senderUid as string)).size
}

function percentile95(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)] ?? 0)
}

function caveat(coverage: BilibiliLiveSessionSummary["coverageStatus"]): string {
  if (coverage === "RECEIVED_WHILE_ONLINE") {
    return "仅覆盖 WebSocket 在线期间成功解析并持久化的受支持事件，不代表平台全量。"
  }
  if (coverage === "BOUNDARY_ONLY") {
    return "仅有历史场次边界，没有可验证的在线采集区间；空白指标不能解释为 0。"
  }
  return "没有可验证的在线采集区间，当前指标不具备完整覆盖保证。"
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000
}
