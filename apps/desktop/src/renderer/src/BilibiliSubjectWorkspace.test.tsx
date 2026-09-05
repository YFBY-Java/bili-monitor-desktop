import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type {
  BilibiliLiveRankSummary,
  BilibiliSubject,
  BilibiliSubjectTrend,
  BilibiliSubjectWorkbench
} from "@bmd/contracts"

import { BilibiliSubjectListView, BilibiliSubjectWorkbenchView } from "./BilibiliSubjectWorkspace"

const timestamp = "2026-08-29T12:00:00.000Z"
const subjectId = "018f0f39-7b5e-4cc1-862d-9a208b3d0b00"
const userMonitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0b01"
const roomMonitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0b02"

const subject: BilibiliSubject = {
  id: subjectId,
  displayName: "碧诗",
  avatarUrl: "https://i0.hdslb.com/bfs/face/subject.jpg",
  tags: ["游戏"],
  monitorStatus: "ACTIVE",
  healthScore: 100,
  lastSuccessAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
  bilibiliBinding: {
    id: "018f0f39-7b5e-4cc1-862d-9a208b3d0b03",
    subjectId,
    bilibiliUserMonitorId: userMonitorId,
    bilibiliLiveRoomMonitorId: roomMonitorId,
    mid: "22",
    roomId: "33",
    enabledCapabilities: ["follower", "live_heat"],
    danmuEnabled: true,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

const workbench: BilibiliSubjectWorkbench = {
  subject,
  bilibiliBinding: subject.bilibiliBinding,
  bilibiliUser: {
    monitorId: userMonitorId,
    mid: "22",
    nickname: "碧诗",
    followerCount: 1_000,
    followerDelta24h: 8,
    monitorStatus: "ACTIVE",
    lastSuccessAt: timestamp
  },
  bilibiliLiveRoom: {
    monitorId: roomMonitorId,
    uid: "22",
    roomId: "33",
    uname: "碧诗",
    title: "直播标题",
    liveStatus: 1,
    onlineCount: 200,
    onlinePeak24h: 300,
    monitorStatus: "ACTIVE",
    lastSuccessAt: timestamp
  },
  summary: {
    followerCount: 1_000,
    followerDelta24h: 8,
    liveStatus: 1,
    onlineCount: 200,
    onlinePeak24h: 300,
    danmuPerMinute: 6,
    danmuLast5Minutes: 22,
    healthScore: 100,
    enabledModuleCount: 4,
    totalModuleCount: 4,
    lastSuccessAt: timestamp
  },
  danmu: {
    enabled: true,
    status: "connected",
    ratePerMinute: 6,
    last5MinutesCount: 22,
    likeIncrement: 3,
    recentMessages: [{ displayName: "Alice", messageText: "hello", sentAt: timestamp }]
  },
  layout: [{
    widgetKey: "bilibili-follower-live-heat",
    enabled: true,
    position: { x: 0, y: 0, w: 8, h: 3 },
    settings: {}
  }],
  recentEvents: [{
    eventType: "FOLLOWER_COLLECT_OK",
    title: "粉丝数采集成功",
    description: "碧诗",
    source: "bilibili-follower",
    occurredAt: timestamp,
    level: "success"
  }]
}

const trend: BilibiliSubjectTrend = {
  subjectId,
  metrics: ["follower", "live_online"],
  range: "24h",
  bucket: "5m",
  points: [{ bucketAt: timestamp, followerCount: 1_000, liveOnlineCount: 200 }]
}

const rankSummary: BilibiliLiveRankSummary = {
  roomMonitorId,
  roomId: "33",
  ruid: "22",
  audienceCount: 1,
  guardCount: 1,
  updatedAt: timestamp,
  snapshots: [{
    id: "018f0f39-7b5e-4cc1-862d-9a208b3d0b04",
    roomMonitorId,
    roomId: "33",
    ruid: "22",
    rankFamily: "AUDIENCE",
    rankType: "online_rank",
    rankSwitch: "contribution_rank",
    pageNo: 1,
    pageSize: 50,
    totalCount: 1,
    sourceEndpoint: "xlive/general-interface/v1/rank/getOnlineGoldRank",
    signedRequired: false,
    capturedAt: timestamp,
    entries: [{ userUid: "44", rankNo: 1, entryKind: "online", displayName: "榜一用户", score: 888 }]
  }]
}

describe("BilibiliSubjectWorkspace", () => {
  it("renders the original UID-first subject list instead of invented agent features", () => {
    const html = renderToStaticMarkup(
      <BilibiliSubjectListView
        subjects={[subject]}
        loading={false}
        error={null}
        onOpen={() => undefined}
        onDelete={() => undefined}
        onRefresh={() => undefined}
      />
    )
    expect(html).toContain("UID 22")
    expect(html).toContain("房间 33")
    expect(html).toContain("弹幕已启用")
    expect(html).not.toContain("Agent")
  })

  it("renders real aggregated workbench metrics, danmaku, health events and layout actions", () => {
    const html = renderToStaticMarkup(
      <BilibiliSubjectWorkbenchView
        workbench={workbench}
        trend={trend}
        rankSummary={rankSummary}
        rankPending={false}
        loading={false}
        error={null}
        onBack={() => undefined}
        onRefresh={() => undefined}
        onToggleStatus={() => undefined}
        onOpenBinding={() => undefined}
        onResetLayout={() => undefined}
        onDanmakuStart={() => undefined}
        onDanmakuStop={() => undefined}
        onRankRefresh={() => undefined}
      />
    )
    expect(html).toContain("总粉丝数")
    expect(html).toContain("直播间热度")
    expect(html).toContain("弹幕速率")
    expect(html).toContain("粉丝数采集成功")
    expect(html).toContain("恢复默认布局")
    expect(html).toContain("房间观众")
    expect(html).toContain("大航海")
    expect(html).toContain("停止弹幕监控")
  })
})
