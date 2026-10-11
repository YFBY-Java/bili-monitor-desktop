import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

import type {
  BilibiliSubject, BilibiliSubjectBinding, CreateBilibiliSubjectInput,
  UpdateBilibiliSubjectBindingInput, UpdateBilibiliSubjectInput
} from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"
import { BilibiliLiveMonitorService, type BilibiliLiveSource } from "./bilibili-live-service"
import { BilibiliLiveSessionService } from "./bilibili-live-session-service"
import { BilibiliSubjectService } from "./bilibili-subject-service"

const textFixture: {
  create: CreateBilibiliSubjectInput
  remarkUnit: string
  remarkRepeat: number
  update: Omit<UpdateBilibiliSubjectInput, "subjectId">
  expected: Pick<BilibiliSubject, "displayName" | "avatarUrl" | "tags">
  expectedUpdatedName: string
  bindingUpdate: Omit<UpdateBilibiliSubjectBindingInput, "subjectId">
  expectedCapabilities: BilibiliSubjectBinding["enabledCapabilities"]
} = JSON.parse(readFileSync(
  new URL("../../contracts/fixtures/subject-text-inputs.json", import.meta.url), "utf8"
))

describe("BilibiliSubjectService", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("reproduces UID-first creation, resource reuse, workbench aggregation and delete isolation", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-subject-service-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const now = () => new Date("2026-08-29T12:00:00.000Z")
    const followers = new BilibiliFollowerMonitorService({
      database,
      now,
      idFactory: randomUUID,
      requestMinIntervalMs: 0,
      source: {
        fetchCard: async ({ mid }) => ({
          mid,
          nickname: "碧诗",
          avatarUrl: "https://i0.hdslb.com/bfs/face/subject.jpg",
          profileUrl: `https://space.bilibili.com/${mid}`,
          followerCount: 1_000,
          followingCount: 20,
          fetchedAt: now().toISOString(),
          sourceEndpoint: "x/web-interface/card" as const,
          evidenceObject: evidence("a"),
          statusCode: 200,
          durationMs: 1
        }),
        fetchRelationStat: async () => { throw new Error("not used") }
      }
    })
    const live = new BilibiliLiveMonitorService({
      database,
      now,
      idFactory: randomUUID,
      requestMinIntervalMs: 0,
      source: liveSource(now().toISOString())
    })
    const liveDanmaku = {
      status: vi.fn(() => ({
        liveRoomMonitorId: randomUUID(),
        running: true,
        status: "CONNECTED" as const,
        ratePerMinute: 6,
        last5MinutesCount: 22,
        likeIncrement: 3,
        watchedCount: 500
      })),
      recent: vi.fn(() => [{
        displayName: "Alice",
        messageText: "hello",
        medalName: "测试牌",
        sentAt: "2026-08-29T11:59:00.000Z"
      }])
    }
    const subjects = new BilibiliSubjectService({
      database,
      followers,
      live,
      liveDanmaku,
      now,
      idFactory: randomUUID
    })

    try {
      const unbound = await subjects.create({ displayName: "仅名称工作台" })
      expect(unbound.bilibiliBinding).toBeUndefined()
      expect(subjects.workbench(unbound.id).layout).toHaveLength(4)
      subjects.remove(unbound.id)

      const disabledBinding = await subjects.create({ displayName: "关闭弹幕", danmuEnabled: false })
      expect(disabledBinding.bilibiliBinding).toMatchObject({
        danmuEnabled: false, enabledCapabilities: ["follower", "live_heat"]
      })
      expect(disabledBinding.bilibiliBinding?.mid).toBeUndefined()
      expect(disabledBinding.bilibiliBinding?.bilibiliUserMonitorId).toBeUndefined()
      subjects.remove(disabledBinding.id)

      const enabledBinding = await subjects.create({ displayName: "启用弹幕", danmuEnabled: true })
      expect(enabledBinding.bilibiliBinding?.danmuEnabled).toBe(true)
      expect(subjects.workbench(enabledBinding.id).danmu.status).toBe("missing_live_room")
      subjects.remove(enabledBinding.id)
      expect(followers.listUsers().total).toBe(0)
      expect(live.listRooms().total).toBe(0)

      // The original UI sends true explicitly; API omission is different and
      // defaults to false only when a binding is actually inserted.
      const omittedSwitch = await subjects.create({ mid: "22" })
      expect(omittedSwitch.bilibiliBinding?.danmuEnabled).toBe(false)
      subjects.remove(omittedSwitch.id)

      const created = await subjects.create({ mid: "22", danmuEnabled: true })
      expect(created).toMatchObject({
        displayName: "碧诗",
        avatarUrl: "https://i0.hdslb.com/bfs/face/subject.jpg",
        monitorStatus: "ACTIVE",
        bilibiliBinding: {
          mid: "22",
          roomId: "33",
          danmuEnabled: true,
          enabledCapabilities: ["follower", "live_heat"]
        }
      })
      expect(subjects.list()).toHaveLength(1)

      const workbench = subjects.workbench(created.id)
      expect(workbench).toMatchObject({
        bilibiliUser: { mid: "22", followerCount: 1_000, followerDelta24h: 0 },
        bilibiliLiveRoom: { roomId: "33", liveStatus: 1, onlineCount: 200 },
        summary: {
          followerCount: 1_000,
          onlineCount: 200,
          danmuPerMinute: 6,
          danmuLast5Minutes: 22,
          healthScore: 100,
          enabledModuleCount: 4,
          totalModuleCount: 4
        },
        danmu: { enabled: true, status: "connected" }
      })
      expect(workbench.layout.map((item) => item.widgetKey)).toEqual([
        "bilibili-follower-live-heat",
        "bilibili-live-danmu",
        "subject-health-events",
        "widget-placeholder"
      ])
      expect(subjects.trends({ subjectId: created.id })).toMatchObject({
        metrics: ["follower", "live_online"],
        range: "24h",
        bucket: "5m",
        points: [{ followerCount: 1_000, liveOnlineCount: 200 }]
      })

      // A busy unrelated room must not displace this workbench's own events.
      const otherRoom = await live.addRoom({ uid: "23" })
      const roomMonitorId = created.bilibiliBinding!.bilibiliLiveRoomMonitorId!
      const userMonitorId = created.bilibiliBinding!.bilibiliUserMonitorId!
      const fixtureDatabase = new DatabaseSync(resolve(testDirectory, "control.db"))
      try {
        fixtureDatabase.prepare("DELETE FROM bilibili_live_status_event WHERE monitor_id = ?").run(roomMonitorId)
        const insertEvent = fixtureDatabase.prepare(`
          INSERT INTO bilibili_live_status_event (
            event_id, monitor_id, uid, room_id, event_type, title_after, online_count, occurred_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (let index = 0; index < 8; index += 1) {
          insertEvent.run(randomUUID(), roomMonitorId, "22", "33",
            index === 7 ? "ERROR_RECOVERED" : "TITLE_CHANGED",
            index === 7 ? " \u3000 " : index === 6 ? "\u00a0" : `当前房间 ${index}`,
            null, new Date(now().getTime() - 600_000 + index * 1_000).toISOString())
        }
        for (let index = 0; index < 201; index += 1) {
          insertEvent.run(randomUUID(), otherRoom.id, "23", "44", "TITLE_CHANGED",
            "其他房间", 900, new Date(now().getTime() + index + 1).toISOString())
        }
        const events = subjects.workbenchV2(created.id).recentEvents
        expect(events).toHaveLength(8)
        expect(events.filter(event => event.source === "bilibili-live" && event.level === "info"))
          .toMatchObject([
            { eventType: "ERROR_RECOVERED", title: "直播间状态更新", description: "在线/热度 null" },
            { eventType: "TITLE_CHANGED", title: "直播标题发生变化", description: "\u00a0" },
            { description: "当前房间 5" }, { description: "当前房间 4" },
            { description: "当前房间 3" }, { description: "当前房间 2" }
          ])
        expect(events.some(event => event.description === "其他房间")).toBe(false)
        expect(database.listBilibiliLiveStatusEvents(1)[0]?.monitorId).toBe(otherRoom.id)

        fixtureDatabase.prepare(`UPDATE bilibili_live_room_monitor
          SET title = NULL, last_error_at = ?, last_error_message = NULL WHERE monitor_id = ?`)
          .run(now().toISOString(), roomMonitorId)
        fixtureDatabase.prepare(`UPDATE bilibili_follower_monitor
          SET last_error_at = ?, last_error_message = NULL WHERE monitor_id = ?`)
          .run(now().toISOString(), userMonitorId)
        const unhealthy = subjects.workbenchV2(created.id)
        expect(unhealthy.summary.healthScore).toBe(76)
        for (const eventType of ["LIVE_COLLECT_ERROR", "FOLLOWER_COLLECT_ERROR", "LIVE_COLLECT_OK"]) {
          const event = unhealthy.recentEvents.find(event => event.eventType === eventType)
          expect(event).toBeDefined()
          expect(event?.description).toBeUndefined()
        }

        const emptySubject = await subjects.create({ displayName: "无采集事件" })
        fixtureDatabase.prepare("UPDATE bilibili_monitored_subject SET created_at = ? WHERE subject_id = ?")
          .run("2026-08-28T12:00:00.000Z", emptySubject.id)
        const emptyWorkbench = subjects.workbenchV2(emptySubject.id)
        expect(emptyWorkbench.recentEvents).toMatchObject([{
          eventType: "SUBJECT_CREATED", occurredAt: now().toISOString(), level: "info"
        }])
        expect(emptyWorkbench.subject.lastEventAt).toBe(now().toISOString())
        subjects.remove(emptySubject.id)
      } finally {
        fixtureDatabase.close()
        live.deleteRoom(otherRoom.id)
      }

      const rebound = await subjects.bind({ subjectId: created.id, danmuEnabled: false })
      expect(rebound).toMatchObject({
        bilibiliUserMonitorId: created.bilibiliBinding?.bilibiliUserMonitorId,
        bilibiliLiveRoomMonitorId: created.bilibiliBinding?.bilibiliLiveRoomMonitorId,
        mid: "22",
        roomId: "33",
        danmuEnabled: false
      })

      const replacement = await subjects.bind({ subjectId: created.id, mid: "23" })
      expect(replacement).toMatchObject({ mid: "23", roomId: "44", danmuEnabled: false })
      expect(replacement.bilibiliUserMonitorId).not.toBe(rebound.bilibiliUserMonitorId)
      expect(replacement.bilibiliLiveRoomMonitorId).not.toBe(rebound.bilibiliLiveRoomMonitorId)
      expect(followers.listUsers().total).toBe(2)
      expect(live.listRooms().total).toBe(2)

      // Independently deleting shared resources retains the identity. A switch-only
      // update must preserve that binding, not silently recreate the monitors.
      followers.deleteUser(replacement.bilibiliUserMonitorId!)
      live.deleteRoom(replacement.bilibiliLiveRoomMonitorId!)
      const switchOnly = await subjects.bind({
        subjectId: created.id, danmuEnabled: true, enabledCapabilities: []
      })
      expect(switchOnly).toMatchObject({
        mid: "23", roomId: "44", danmuEnabled: true, enabledCapabilities: []
      })
      expect(switchOnly.bilibiliUserMonitorId).toBeUndefined()
      expect(switchOnly.bilibiliLiveRoomMonitorId).toBeUndefined()
      expect(followers.listUsers().total).toBe(1)
      expect(live.listRooms().total).toBe(1)

      expect(subjects.updateLayout({ subjectId: created.id, items: null }))
        .toEqual(workbench.layout)
      expect(subjects.updateLayout({
        subjectId: created.id,
        items: [
          {
            widgetKey: "subject-health-events", enabled: false,
            position: { w: 8, h: 2 }, settings: { collapsed: true }
          },
          { widgetKey: "bilibili-live-danmu", enabled: null, position: null, settings: null },
          { widgetKey: "widget-placeholder" }
        ]
      })).toEqual([{
        widgetKey: "subject-health-events",
        enabled: false,
        position: { w: 8, h: 2 },
        settings: { collapsed: true }
      }, {
        widgetKey: "bilibili-live-danmu",
        enabled: true,
        position: {},
        settings: {}
      }, {
        widgetKey: "widget-placeholder",
        enabled: true,
        position: {},
        settings: {}
      }])
      const completeLayout = Array.from({ length: 51 }, (_, index) => ({
        widgetKey: index === 0 ? ` ${"😀".repeat(78)} ` : `custom-widget-${index}`, enabled: true,
        position: { y: index }, settings: { index }
      }))
      expect(subjects.updateLayout({ subjectId: created.id, items: completeLayout }))
        .toEqual(completeLayout)
      expect(subjects.updateLayout({ subjectId: created.id, items: [] }))
        .toEqual(workbench.layout)
      expect(subjects.update({ subjectId: created.id, enabled: false })).toMatchObject({
        monitorStatus: "PAUSED"
      })

      subjects.remove(created.id)
      expect(subjects.list()).toEqual([])
      expect(followers.listUsers().total).toBe(1)
      expect(live.listRooms().total).toBe(1)

      const listedSubjects = []
      for (let index = 0; index < 501; index += 1) {
        listedSubjects.push(await subjects.create({ displayName: `完整列表 ${index}` }))
      }
      const paused = listedSubjects.at(-1)!
      subjects.update({ subjectId: paused.id, enabled: false })
      const bindingReads = vi.spyOn(database, "findBilibiliSubjectBinding")
      const completeList = subjects.list()
      const bindingReadCount = bindingReads.mock.calls.length
      bindingReads.mockRestore()
      // Original SubjectService reads each binding once, including absent bindings.
      expect(bindingReadCount).toBe(501)
      expect(completeList).toHaveLength(501)
      expect(completeList.at(-1)).toMatchObject({ id: paused.id, monitorStatus: "PAUSED" })
      expect(subjects.list(501)).toHaveLength(501)
      expect(subjects.list(1)).toEqual(completeList.slice(0, 1))

    } finally {
      await followers.stop()
      await live.stop()
      database.close()
    }
  })

  it("keeps the follower workbench when the UID has no public live room", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-subject-no-live-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const now = () => new Date("2026-08-29T12:00:00.000Z")
    const followers = new BilibiliFollowerMonitorService({
      database,
      now,
      idFactory: randomUUID,
      requestMinIntervalMs: 0,
      source: {
        fetchCard: async ({ mid }) => ({
          mid,
          nickname: "无直播用户",
          avatarUrl: " https://example.invalid/synthetic.png ",
          profileUrl: `https://space.bilibili.com/${mid}`,
          followerCount: 20,
          fetchedAt: now().toISOString(),
          sourceEndpoint: "x/web-interface/card" as const,
          evidenceObject: evidence("d"),
          statusCode: 200,
          durationMs: 1
        }),
        fetchRelationStat: async () => { throw new Error("not used") }
      }
    })
    const live = new BilibiliLiveMonitorService({
      database,
      now,
      idFactory: randomUUID,
      requestMinIntervalMs: 0,
      source: {
        fetchStatusByUids: async () => ({
          snapshots: [], fetchedAt: now().toISOString(),
          sourceEndpoint: "room/v1/Room/get_status_info_by_uids" as const,
          evidenceObject: evidence("e"), statusCode: 200, durationMs: 1
        }),
        fetchRoomInfoOld: async () => ({
          fetchedAt: now().toISOString(),
          sourceEndpoint: "room/v1/Room/getRoomInfoOld" as const,
          evidenceObject: evidence("f"), statusCode: 200, durationMs: 1
        }),
        fetchRoomInfo: async () => { throw new Error("not used") },
        fetchRoomInit: async () => { throw new Error("not used") }
      }
    })
    const subjects = new BilibiliSubjectService({
      database,
      followers,
      live,
      liveDanmaku: { status: vi.fn(), recent: vi.fn(() => []) },
      now,
      idFactory: randomUUID
    })
    try {
      const remark = textFixture.remarkUnit.repeat(textFixture.remarkRepeat)
      const created = await subjects.create({ ...textFixture.create, remark: ` \t${remark}\r\n` })
      expect(created).toMatchObject({
        ...textFixture.expected, remark,
        bilibiliBinding: { mid: "99", danmuEnabled: true }
      })
      expect(created.bilibiliBinding?.bilibiliLiveRoomMonitorId).toBeUndefined()
      expect(subjects.workbench(created.id)).toMatchObject({
        bilibiliUser: { mid: "99", followerCount: 20 },
        summary: { enabledModuleCount: 3, totalModuleCount: 4 },
        danmu: { status: "missing_live_room" }
      })
      const updated = subjects.update({ subjectId: created.id, ...textFixture.update })
      expect(updated).toMatchObject({
        ...textFixture.expected, displayName: textFixture.expectedUpdatedName,
        remark, monitorStatus: "ACTIVE"
      })
      expect(subjects.get(created.id)).toStrictEqual(updated)
      expect(database.findBilibiliSubjectById(created.id)).toMatchObject({
        displayName: textFixture.expectedUpdatedName, avatarUrl: textFixture.expected.avatarUrl,
        remark, tags: textFixture.expected.tags
      })
      expect(() => subjects.update({ subjectId: created.id, displayName: " \u001f " }))
        .toThrow("用户监控名称不能为空。")
      expect(subjects.update({
        subjectId: created.id, displayName: null, avatarUrl: " \t", remark: "\r\n", tags: []
      })).toMatchObject({
        displayName: textFixture.expectedUpdatedName, avatarUrl: textFixture.expected.avatarUrl,
        remark, tags: []
      })
      expect(await subjects.create({
        ...textFixture.create, displayName: " \u001f ", avatarUrl: null, remark: null, tags: null
      })).toMatchObject({ displayName: "无直播用户", tags: [] })
      const backfilled = await subjects.create({
        mid: "99", displayName: "\u3000", avatarUrl: "\u3000",
        remark: "保留备注", tags: ["留存"]
      })
      expect(backfilled).toMatchObject({
        displayName: "无直播用户", avatarUrl: " https://example.invalid/synthetic.png ",
        remark: "保留备注", tags: ["留存"]
      })

      // Removing the shared monitor leaves the binding identity but not its FK.
      // List/detail must not backfill from a subsequently recreated same-UID user.
      followers.deleteUser(backfilled.bilibiliBinding!.bilibiliUserMonitorId!)
      const recreatedUser = await followers.addUser({ mid: "99" })
      database.updateBilibiliSubject({
        subjectId: backfilled.id, displayName: "\u3000", avatarUrl: "",
        updatedAt: now().toISOString()
      })
      const detached = subjects.get(backfilled.id)
      expect(detached.displayName).toBe("\u3000")
      expect(detached.avatarUrl).toBe("")
      expect(subjects.list().find(subject => subject.id === backfilled.id))
        .toStrictEqual(detached)

      // Workbench has a distinct original rule: UID fallback, avatar only.
      database.updateBilibiliSubject({
        subjectId: backfilled.id, avatarUrl: "\u3000", updatedAt: now().toISOString()
      })
      expect(subjects.workbench(backfilled.id)).toMatchObject({
        subject: {
          displayName: "\u3000", avatarUrl: " https://example.invalid/synthetic.png ",
          remark: "保留备注", tags: ["留存"]
        },
        bilibiliUser: { mid: "99" }
      })
      database.updateBilibiliSubject({
        subjectId: backfilled.id, avatarUrl: "\u00a0", updatedAt: now().toISOString()
      })
      expect(subjects.workbench(backfilled.id).subject.avatarUrl).toBe("\u00a0")
      await subjects.bind({ subjectId: backfilled.id, bilibiliUserMonitorId: recreatedUser.id })
      // Seed an allowed historical TEXT value, not an invalid fetched profile.
      const fixtureDatabase = new DatabaseSync(resolve(testDirectory, "control.db"))
      try {
        fixtureDatabase.prepare("UPDATE bilibili_follower_monitor SET avatar_url = '' WHERE monitor_id = ?")
          .run(recreatedUser.id)
      } finally {
        fixtureDatabase.close()
      }
      database.updateBilibiliSubject({
        subjectId: backfilled.id, avatarUrl: "\u3000", updatedAt: now().toISOString()
      })
      // A non-null empty user avatar wins in SubjectService and stays on the wire.
      expect(subjects.get(backfilled.id)).toMatchObject({
        displayName: "无直播用户", avatarUrl: ""
      })
      expect(database.findBilibiliSubjectById(backfilled.id)?.avatarUrl).toBe("")
      expect(subjects.workbench(backfilled.id).subject.avatarUrl).toBe("")
      const capabilityBinding = await subjects.bind({
        subjectId: backfilled.id, ...textFixture.bindingUpdate
      })
      expect(capabilityBinding).toMatchObject({
        bilibiliUserMonitorId: recreatedUser.id, mid: "99", danmuEnabled: false,
        enabledCapabilities: textFixture.expectedCapabilities
      })
      expect(database.findBilibiliSubjectBinding(backfilled.id)?.enabledCapabilities)
        .toStrictEqual(textFixture.expectedCapabilities)
      expect(subjects.get(backfilled.id).bilibiliBinding?.enabledCapabilities)
        .toStrictEqual(textFixture.expectedCapabilities)
      expect(subjects.workbenchV3(backfilled.id).bilibiliBinding?.enabledCapabilities)
        .toStrictEqual(textFixture.expectedCapabilities)
      expect((await subjects.bind({
        subjectId: backfilled.id, enabledCapabilities: null, danmuEnabled: null
      })).enabledCapabilities).toStrictEqual(textFixture.expectedCapabilities)
      expect((await subjects.bind({
        subjectId: backfilled.id, enabledCapabilities: []
      })).enabledCapabilities).toStrictEqual([])

      // These three fields are direct pgjdbc TEXT, not JSONB or fetched profile data.
      const encoded = await subjects.create({
        displayName: "资料\ud800😀", avatarUrl: "local/\udfff😀", remark: "说明\ud800😀"
      })
      expect(encoded).toMatchObject({
        displayName: "资料?😀", avatarUrl: "local/?😀", remark: "说明?😀"
      })
      const edited = subjects.update({
        subjectId: encoded.id, displayName: "\udfff调整", avatarUrl: "local/\ud800", remark: "更新\udfff"
      })
      expect(edited).toMatchObject({ displayName: "?调整", avatarUrl: "local/?", remark: "更新?" })
      const subjectsBefore = database.listBilibiliSubjects()
      const outboxBefore = database.listPendingOutbox()
      await expect(subjects.create({ displayName: "拒绝新资料", avatarUrl: "synthetic\0avatar" }))
        .rejects.toThrow("Subject storage text contains NUL.")
      expect(database.listBilibiliSubjects()).toStrictEqual(subjectsBefore)
      expect(database.listPendingOutbox()).toStrictEqual(outboxBefore)
      expect(() => subjects.update({ subjectId: encoded.id, remark: "synthetic\0remark" }))
        .toThrow("Subject storage text contains NUL.")
      expect(subjects.get(encoded.id)).toStrictEqual(edited)
    } finally {
      await followers.stop()
      await live.stop()
      database.close()
    }
  })
  it("persists subject JSON text through the original storage encoding boundary", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-subject-json-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const now = () => new Date("2026-10-07T09:00:00.000Z")
    const followers = new BilibiliFollowerMonitorService({
      database, now, idFactory: randomUUID, requestMinIntervalMs: 0,
      source: {
        fetchCard: async () => { throw new Error("not used") },
        fetchRelationStat: async () => { throw new Error("not used") }
      }
    })
    const live = new BilibiliLiveMonitorService({
      database, now, idFactory: randomUUID, requestMinIntervalMs: 0,
      source: liveSource(now().toISOString())
    })
    const subjects = new BilibiliSubjectService({
      database, followers, live, now, idFactory: randomUUID,
      liveDanmaku: { status: () => { throw new Error("not used") }, recent: () => [] }
    })
    let subjectId = ""
    const expectedSettings = {
      nested: { "key?": ["😀", "value?", "literal\\ud800", "literal\\u0000", null, 2, false] },
      "collision?": "last"
    }
    try {
      const created = await subjects.create({
        displayName: "JSON资料", danmuEnabled: false,
        tags: ["😀", "raw\ud800", "raw\udc00", "literal\\ud800", "literal\\u0000"]
      })
      subjectId = created.id
      expect.soft(created.tags).toStrictEqual([
        "😀", "raw?", "raw?", "literal\\ud800", "literal\\u0000"
      ])
      const updated = subjects.update({ subjectId, tags: ["更新\udc00", "😀"] })
      expect.soft(updated.tags).toStrictEqual(["更新?", "😀"])
      const binding = await subjects.bind({
        subjectId, enabledCapabilities: ["follower", null, "extension\ud800", "literal\\udc00"]
      })
      expect.soft(binding.enabledCapabilities).toStrictEqual([
        "follower", null, "extension?", "literal\\udc00"
      ])
      expect.soft(subjects.get(subjectId).bilibiliBinding).toStrictEqual(binding)
      expect(() => subjects.updateLayout({ subjectId, items: [{
        widgetKey: "widget-placeholder", settings: { "synthetic\0key": "value" }
      }] })).toThrow("Subject JSON storage contains NUL.")
      const layouts = subjects.updateLayout({ subjectId, items: [{
        widgetKey: "widget-placeholder", position: { x: 0, y: 0 }, settings: {
          nested: { "key\ud800": ["😀", "value\udc00", "literal\\ud800", "literal\\u0000", null, 2, false] },
          "collision\ud800": "first", "collision\udc00": "last"
        }
      }] })
      expect.soft(layouts[0]?.settings).toStrictEqual(expectedSettings)

      const beforeRejectedCreate = database.listBilibiliSubjects()
      await expect(subjects.create({ displayName: "拒绝JSON空字节", tags: ["synthetic\0tag"] }))
        .rejects.toThrow("Subject JSON storage contains NUL.")
      expect(database.listBilibiliSubjects()).toStrictEqual(beforeRejectedCreate)
      expect(() => subjects.update({ subjectId, tags: ["synthetic\0tag"] }))
        .toThrow("Subject JSON storage contains NUL.")
      expect(subjects.get(subjectId).tags).toStrictEqual(updated.tags)
      expect(followers.listUsersV2().total).toBe(0)
      expect(live.listRoomsV2().total).toBe(0)
    } finally {
      await followers.stop()
      await live.stop()
      database.close()
    }
    const reopened = await ControlDatabase.open(testDirectory)
    try {
      expect(reopened.findBilibiliSubjectById(subjectId)?.tags).toStrictEqual(["更新?", "😀"])
      expect(reopened.findBilibiliSubjectBinding(subjectId)?.enabledCapabilities).toStrictEqual([
        "follower", null, "extension?", "literal\\udc00"
      ])
      expect(reopened.findBilibiliSubjectLayouts(subjectId)[0]?.settings).toStrictEqual(expectedSettings)
    } finally {
      reopened.close()
    }
  })

  it("rolls back the entire subject creation without undoing an unrelated concurrent add", async () => {
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-subject-creation-"))
    directory = testDirectory
    const database = await ControlDatabase.open(testDirectory)
    const inspection = new DatabaseSync(resolve(testDirectory, "control.db"))
    const now = () => new Date("2026-10-07T08:00:00.000Z")
    let releaseCard = () => {}
    let cardStarted = () => {}
    const cardGate = new Promise<void>((resolveGate) => { releaseCard = resolveGate })
    const cardStart = new Promise<void>((resolveStart) => { cardStarted = resolveStart })
    let holdCard = true
    let cardFetches = 0
    const followers = new BilibiliFollowerMonitorService({
      database, now, idFactory: randomUUID, requestMinIntervalMs: 0,
      source: {
        fetchCard: async ({ mid }) => {
          cardFetches += 1
          if (mid === "22" && holdCard) {
            holdCard = false
            cardStarted()
            await cardGate
          }
          return {
            mid, nickname: `用户 ${mid}`, profileUrl: `https://space.bilibili.com/${mid}`,
            followerCount: "1000", followingCount: "20", fetchedAt: now().toISOString(),
            sourceEndpoint: "x/web-interface/card", evidenceObject: evidence("a"),
            statusCode: 200, durationMs: 1
          }
        },
        fetchRelationStat: async () => { throw new Error("not used") }
      }
    })
    const live = new BilibiliLiveMonitorService({
      database, now, idFactory: randomUUID, requestMinIntervalMs: 0,
      source: liveSource(now().toISOString()),
      sessionObserver: new BilibiliLiveSessionService({ database, now, idFactory: randomUUID })
    })
    const subjects = new BilibiliSubjectService({
      database, followers, live, now, idFactory: randomUUID,
      liveDanmaku: {
        status: () => { throw new Error("not used") },
        recent: () => []
      }
    })
    const tables = [
      "bilibili_follower_monitor", "bilibili_follower_snapshot", "bilibili_api_call",
      "bilibili_live_room_monitor", "bilibili_live_room_snapshot", "bilibili_live_status_event",
      "bilibili_live_session", "bilibili_monitored_subject", "bilibili_subject_binding",
      "bilibili_subject_widget_layout", "object_artifact", "outbox"
    ]
    const state = () => tables.map((table) => inspection.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())
    try {
      const creation = subjects.create({ mid: "22", remark: "synthetic\0remark" })
      const rejected = expect(creation).rejects.toThrow("Subject storage text contains NUL.")
      await cardStart
      const unrelated = await followers.addUserV2({ mid: "23", intervalSeconds: 123 })
      const before = state()
      releaseCard()
      await rejected
      expect(state()).toStrictEqual(before)
      expect(followers.listUsersV2().items).toStrictEqual([unrelated])

      // Fail after the related monitor, snapshot, session, binding and subject writes.
      inspection.exec(`CREATE TRIGGER reject_subject_layout BEFORE INSERT ON bilibili_subject_widget_layout
        BEGIN SELECT RAISE(ABORT, 'synthetic layout failure'); END;`)
      await expect(subjects.create({ mid: "22" })).rejects.toThrow("synthetic layout failure")
      expect(state()).toStrictEqual(before)
      inspection.exec("DROP TRIGGER reject_subject_layout")

      const created = await subjects.create({ mid: "22", danmuEnabled: true })
      expect(created.bilibiliBinding).toMatchObject({ mid: "22", roomId: "33", danmuEnabled: true })
      const roomId = created.bilibiliBinding!.bilibiliLiveRoomMonitorId!
      expect(database.listBilibiliLiveSessions(roomId, 20)).toHaveLength(1)
      expect(followers.listUsersV2().total).toBe(2)
      expect(live.listRoomsV2().total).toBe(1)
      const callsBeforeReuse = cardFetches
      const followerSnapshotsBeforeReuse = database.findBilibiliFollowerSnapshots(
        created.bilibiliBinding!.bilibiliUserMonitorId!, { limit: 30 }
      )
      const reused = await subjects.create({ mid: "22" })
      expect(reused.bilibiliBinding?.bilibiliUserMonitorId).toBe(created.bilibiliBinding?.bilibiliUserMonitorId)
      expect(reused.bilibiliBinding?.bilibiliLiveRoomMonitorId).toBe(roomId)
      expect(cardFetches).toBe(callsBeforeReuse)
      expect(database.findBilibiliFollowerSnapshots(
        created.bilibiliBinding!.bilibiliUserMonitorId!, { limit: 30 }
      )).toStrictEqual(followerSnapshotsBeforeReuse)
      expect(database.listBilibiliSubjects()).toHaveLength(2)
    } finally {
      releaseCard()
      await followers.stop()
      await live.stop()
      inspection.close()
      database.close()
    }
    const reopened = await ControlDatabase.open(testDirectory)
    try {
      expect(reopened.listBilibiliSubjects()).toHaveLength(2)
      expect(reopened.listBilibiliFollowerMonitors()).toHaveLength(2)
      expect(reopened.listBilibiliLiveRooms()).toHaveLength(1)
    } finally {
      reopened.close()
    }
  })
})

function evidence(character: string) {
  const sha256 = character.repeat(64)
  return {
    objectId: `sha256:${sha256}`,
    relativePath: `cas/${sha256}.json`,
    sha256,
    sizeBytes: 1,
    mediaType: "application/json"
  }
}

function liveSource(fetchedAt: string): BilibiliLiveSource {
  return {
    fetchStatusByUids: async ({ uids }) => ({
      snapshots: [{
        uid: uids[0]!,
        roomId: uids[0] === "22" ? "33" : "44",
        uname: "碧诗直播间",
        faceUrl: "https://i0.hdslb.com/bfs/face/live.jpg",
        title: "直播标题",
        liveStatus: 1,
        liveTime: fetchedAt,
        onlineCount: 200,
        attentionCount: 1_000
      }],
      fetchedAt,
      sourceEndpoint: "room/v1/Room/get_status_info_by_uids",
      evidenceObject: evidence("b"),
      statusCode: 200,
      durationMs: 1
    }),
    fetchRoomInfo: async ({ roomId }) => ({
      uid: "22",
      roomId,
      uname: "碧诗直播间",
      title: "直播标题",
      liveStatus: 1,
      fetchedAt,
      sourceEndpoint: "room/v1/Room/get_info",
      evidenceObject: evidence("c"),
      statusCode: 200,
      durationMs: 1
    }),
    fetchRoomInit: async () => { throw new Error("not used") },
    fetchRoomInfoOld: async () => { throw new Error("not used") }
  }
}
