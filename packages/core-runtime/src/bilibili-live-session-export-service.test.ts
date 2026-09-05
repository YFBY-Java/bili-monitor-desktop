import { readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { ControlDatabase } from "@bmd/storage"
import ExcelJS from "exceljs"
import { unzipSync } from "fflate"
import { afterEach, describe, expect, it } from "vitest"

import { BilibiliLiveSessionExportService } from "./bilibili-live-session-export-service"
import { BilibiliLiveSessionService } from "./bilibili-live-session-service"

describe("BilibiliLiveSessionExportService", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("reproduces the original schema-v2 CSV, XLSX and complete ZIP exports", async () => {
    directory = resolve(tmpdir(), `bmd-session-export-${crypto.randomUUID()}`)
    const database = await ControlDatabase.open(directory)
    let sequence = 0
    const idFactory = () => `018f0f39-7b5e-4cc1-862d-${String(++sequence).padStart(12, "0")}`
    const sessions = new BilibiliLiveSessionService({ database, idFactory })
    const exports = new BilibiliLiveSessionExportService({
      database,
      sessions,
      exportDirectory: resolve(directory, "exports"),
      now: () => new Date("2026-08-29T12:30:00.000Z"),
      idFactory
    })

    try {
      const monitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0b00"
      seedRoom(database, monitorId)
      const room = database.findBilibiliLiveRoomById(monitorId)
      if (!room) throw new Error("room missing")
      const transportId = "018f0f39-7b5e-4cc1-862d-9a208b3d0b01"
      database.createBilibiliLiveDanmakuSession({
        sessionId: transportId,
        monitorId,
        roomId: room.roomId,
        connectHost: "wss://example.test/sub",
        startedAt: "2026-08-29T12:00:00.000Z"
      })
      database.markBilibiliLiveDanmakuSessionConnected(transportId, "2026-08-29T12:00:01.000Z")
      const session = sessions.reconcileRest(room, {
        liveStatus: 1,
        liveTime: "2026-08-29T12:00:00.000Z",
        title: "直播标题",
        fetchedAt: "2026-08-29T12:00:02.000Z"
      })
      if (!session) throw new Error("session missing")
      sessions.ingest(room, transportId, 1, 3, {
        command: "DANMU_MSG",
        kind: "DANMAKU",
        sourceEventId: "dm-1",
        eventKey: "DANMU_MSG:dm-1",
        occurredAt: "2026-08-29T12:01:00.000Z",
        receivedAt: "2026-08-29T12:01:00.050Z",
        actor: { uid: "9007199254740999", displayName: "=HYPERLINK(\"x\")", medalName: "测试牌" },
        messageText: "+cmd",
        giftDelta: 0,
        superChatDelta: 0,
        rawJson: "{}"
      })
      sessions.ingest(room, transportId, 2, 3, {
        command: "SEND_GIFT",
        kind: "GIFT",
        sourceEventId: "gift-1",
        eventKey: "SEND_GIFT:gift-1",
        occurredAt: "2026-08-29T12:02:00.000Z",
        receivedAt: "2026-08-29T12:02:00.080Z",
        actor: { uid: "9007199254740999", displayName: "Alice" },
        gift: {
          giftId: "31036",
          giftName: "小花花",
          quantity: 2,
          coinType: "gold",
          price: 1000,
          totalCoin: 2000,
          paid: true,
          amountMilliYuan: 2000
        },
        giftDelta: 2,
        superChatDelta: 0,
        rawJson: "{}"
      })

      const csv = await exports.prepare({ sessionId: session.sessionId, category: "danmaku" })
      expect(csv).toMatchObject({
        category: "danmaku",
        schemaVersion: "2",
        suggestedFileName: `bilibili-live-session-${session.sessionId}-danmaku.csv`,
        mediaType: "text/csv;charset=UTF-8"
      })
      const csvBytes = await readFile(csv.temporaryPath)
      expect([...csvBytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      const csvText = csvBytes.toString("utf8")
      expect(csvText).toContain("occurred_at,received_at,sender_uid,sender_name,medal_name,message_text,command,protocol_version,source_event_id\r\n")
      expect(csvText).toContain("事件发生时间,系统接收时间,发送者 B站 UID")
      expect(csvText).toContain("'=HYPERLINK(\"\"x\"\")")
      expect(csvText).toContain("'+cmd")

      const xlsx = await exports.prepare({ sessionId: session.sessionId, category: "xlsx" })
      const workbook = new ExcelJS.Workbook()
      const xlsxBytes = await readFile(xlsx.temporaryPath)
      await workbook.xlsx.load(xlsxBytes as unknown as Parameters<typeof workbook.xlsx.load>[0])
      expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["场次摘要", "弹幕", "礼物", "用户"])
      expect(workbook.getWorksheet("用户")?.getCell("C3").value).toBe("9007199254740999")
      expect(workbook.getWorksheet("弹幕")?.views[0]).toMatchObject({ ySplit: 2, state: "frozen" })

      const complete = await exports.prepare({ sessionId: session.sessionId, category: "all" })
      const entries = unzipSync(await readFile(complete.temporaryPath))
      expect(Object.keys(entries)).toEqual([
        "manifest.json",
        "summary.csv",
        "danmaku.csv",
        "gifts.csv",
        "users.csv"
      ])
      expect(JSON.parse(Buffer.from(entries["manifest.json"] ?? []).toString("utf8"))).toMatchObject({
        schema_version: "2",
        amount_unit: "milli_yuan",
        capture_scope: "received_while_websocket_online_since_deployment",
        session_id: session.sessionId
      })
      expect(Buffer.from(entries["gifts.csv"] ?? []).toString("utf8")).toContain("TOTAL_COIN")
    } finally {
      database.close()
    }
  })
})

function seedRoom(database: ControlDatabase, monitorId: string): void {
  database.applyBilibiliLiveRoomSnapshot({
    monitor: {
      monitorId,
      uid: "22",
      roomId: "33",
      shortId: null,
      uname: "anchor",
      faceUrl: null,
      title: "直播标题",
      coverUrl: null,
      keyframeUrl: null,
      areaId: null,
      areaName: null,
      parentAreaId: null,
      parentAreaName: null,
      liveStatus: 1,
      liveTime: "2026-08-29T12:00:00.000Z",
      onlineCount: 1,
      attentionCount: 2,
      intervalSeconds: 300,
      nextCollectAt: "2026-08-29T12:05:00.000Z",
      capturedAt: "2026-08-29T12:00:00.000Z",
      sourceEndpoint: "room/v1/Room/get_info"
    },
    snapshot: {
      snapshotId: "018f0f39-7b5e-4cc1-862d-9a208b3d0b02",
      capturedBucket: "2026-08-29T12:00:00.000Z"
    },
    artifact: {
      objectId: `sha256:${"b".repeat(64)}`,
      sha256: "b".repeat(64),
      relativePath: "cas/b.json",
      sizeBytes: 1,
      mediaType: "application/json",
      createdAt: "2026-08-29T12:00:00.000Z"
    },
    outbox: {
      messageId: "018f0f39-7b5e-4cc1-862d-9a208b3d0b03",
      topic: "seed",
      envelopeJson: "{}",
      createdAt: "2026-08-29T12:00:00.000Z"
    }
  })
}
