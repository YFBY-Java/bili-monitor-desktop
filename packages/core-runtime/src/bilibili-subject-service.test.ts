import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { ControlDatabase } from "@bmd/storage"
import { afterEach, describe, expect, it, vi } from "vitest"

import { BilibiliFollowerMonitorService } from "./bilibili-follower-service"
import { BilibiliLiveMonitorService, type BilibiliLiveSource } from "./bilibili-live-service"
import { BilibiliSubjectService } from "./bilibili-subject-service"

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

      const rebound = await subjects.bind({ subjectId: created.id, danmuEnabled: false })
      expect(rebound).toMatchObject({
        bilibiliUserMonitorId: created.bilibiliBinding?.bilibiliUserMonitorId,
        bilibiliLiveRoomMonitorId: created.bilibiliBinding?.bilibiliLiveRoomMonitorId,
        mid: "22",
        roomId: "33",
        danmuEnabled: false
      })
      expect(subjects.updateLayout({
        subjectId: created.id,
        items: [{ widgetKey: "subject-health-events", enabled: false }]
      })).toEqual([{
        widgetKey: "subject-health-events",
        enabled: false,
        position: {},
        settings: {}
      }])
      expect(subjects.update({ subjectId: created.id, enabled: false })).toMatchObject({
        monitorStatus: "PAUSED"
      })

      subjects.remove(created.id)
      expect(subjects.list()).toEqual([])
      expect(followers.listUsers().total).toBe(1)
      expect(live.listRooms().total).toBe(1)
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
      const created = await subjects.create({ mid: "99", danmuEnabled: true })
      expect(created).toMatchObject({
        displayName: "无直播用户",
        bilibiliBinding: { mid: "99", danmuEnabled: true }
      })
      expect(created.bilibiliBinding?.bilibiliLiveRoomMonitorId).toBeUndefined()
      expect(subjects.workbench(created.id)).toMatchObject({
        bilibiliUser: { mid: "99", followerCount: 20 },
        summary: { enabledModuleCount: 3, totalModuleCount: 4 },
        danmu: { status: "missing_live_room" }
      })
    } finally {
      await followers.stop()
      await live.stop()
      database.close()
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
        roomId: "33",
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
