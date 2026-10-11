import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { BilibiliLiveWorkspacePresentation } from "./BilibiliLiveWorkspace"
import { BilibiliLiveRankSnapshotV2Schema } from "@bmd/contracts"
import { widgetCount, widgetRankEntries } from "./bilibili-live-widget-format"

describe("BilibiliLiveWorkspace", () => {
  it("renders only persisted original live room values and real lifecycle controls", () => {
    const html = renderToStaticMarkup(
      <BilibiliLiveWorkspacePresentation
        view="直播间"
        creationOpen
        rooms={[{
          id: "018f0f39-7b5e-4cc1-862d-9a208b3d0700",
          uid: "22",
          roomId: "330033",
          shortId: "33",
          uname: "anchor",
          title: "直播标题",
          areaName: "单机游戏",
          liveStatus: 1,
          liveTime: "2026-08-29T12:00:00.000Z",
          onlineCount: "1234",
          attentionCount: "5678",
          monitorStatus: "ACTIVE",
          intervalSeconds: 300,
          lastSuccessAt: "2026-08-29T12:00:01.000Z",
          nextCollectAt: "2026-08-29T12:05:01.000Z",
          sourceEndpoint: "room/v1/Room/get_status_info_by_uids",
          recentTrend: [],
          version: 1
        }]}
        summary={{
          totalRooms: 1,
          activeRooms: 1,
          liveRooms: 1,
          roundRooms: 0,
          offlineRooms: 0,
          errorRooms: 0,
          totalOnlineCount: "1234",
          todayLiveStarts: 1
        }}
        events={[]}
        trends={[]}
        pending={false}
        onAdd={async () => undefined}
        onRoomAction={async () => undefined}
        onCloseCreation={() => undefined}
        onTrendSelectionChange={() => undefined}
      />
    )

    expect(html).toContain("房间号")
    expect(html).toContain("主播 UID")
    expect(html).toContain("anchor")
    expect(html).toContain("直播标题")
    expect(html).toContain("1,234")
    expect(html).toContain("立即刷新")
    expect(html).toContain("暂停监控")
    expect(html).toContain("删除")
    expect(html).toContain("get_status_info_by_uids")
    expect(html).not.toContain("示例直播间")
  })

  it("renders honest loading and empty states", () => {
    const loading = renderToStaticMarkup(
      <BilibiliLiveWorkspacePresentation
        view="直播间"
        creationOpen={false}
        rooms={[]}
        events={[]}
        trends={[]}
        pending
        onAdd={async () => undefined}
        onRoomAction={async () => undefined}
        onCloseCreation={() => undefined}
        onTrendSelectionChange={() => undefined}
      />
    )
    const empty = renderToStaticMarkup(
      <BilibiliLiveWorkspacePresentation
        view="状态事件"
        creationOpen={false}
        rooms={[]}
        events={[]}
        trends={[]}
        pending={false}
        onAdd={async () => undefined}
        onRoomAction={async () => undefined}
        onCloseCreation={() => undefined}
        onTrendSelectionChange={() => undefined}
      />
    )

    expect(loading).toContain("正在读取直播间监控")
    expect(empty).toContain("暂无状态事件")
  })

  it("renders only persisted original audience and guard rank entries", () => {
    const precise = BilibiliLiveRankSnapshotV2Schema.parse({ id: "018f0f39-7b5e-4cc1-862d-9a208b3d0701",
      roomMonitorId: "018f0f39-7b5e-4cc1-862d-9a208b3d0700", roomId: "330033", ruid: "22",
      rankFamily: "AUDIENCE", rankType: "online_rank", rankSwitch: "contribution_rank", pageNo: 1, pageSize: 50,
      sourceEndpoint: "xlive/general-interface/v1/rank/queryContributionRank", signedRequired: true,
      capturedAt: "2026-08-29T12:00:00.000Z", totalCount: "9223372036854775807",
      entries: [{ rankNo: 1, entryKind: "LIST", displayName: "一分之差低值", score: "9007199254740992" },
        { rankNo: 2, entryKind: "LIST", displayName: "一分之差高值", score: "9007199254740993" }] })
    expect(widgetRankEntries(precise, "desc").map(entry => entry.displayName)).toEqual(["一分之差高值", "一分之差低值"])
    expect(widgetRankEntries(precise, "asc").map(entry => entry.displayName)).toEqual(["一分之差低值", "一分之差高值"])
    expect(widgetCount(precise.totalCount)).toBe("92233720368.55亿")
    const room = {
      id: "018f0f39-7b5e-4cc1-862d-9a208b3d0700",
      uid: "22",
      roomId: "330033",
      uname: "anchor",
      liveStatus: 1 as const,
      monitorStatus: "ACTIVE" as const,
      intervalSeconds: 300,
      recentTrend: [],
      version: 1
    }
    const html = renderToStaticMarkup(
      <BilibiliLiveWorkspacePresentation
        view="观众榜单"
        creationOpen={false}
        rooms={[room]}
        events={[]}
        trends={[]}
        rankSummary={{
          roomMonitorId: room.id,
          roomId: room.roomId,
          ruid: room.uid,
          audienceCount: 2,
          guardCount: 1,
          updatedAt: "2026-08-29T12:00:00.000Z",
          snapshots: [{
            id: "018f0f39-7b5e-4cc1-862d-9a208b3d0701",
            roomMonitorId: room.id,
            roomId: room.roomId,
            ruid: room.uid,
            rankFamily: "AUDIENCE",
            rankType: "online_rank",
            rankSwitch: "contribution_rank",
            periodScope: "REALTIME",
            pageNo: 1,
            pageSize: 50,
            sourceEndpoint: "xlive/general-interface/v1/rank/queryContributionRank",
            signedRequired: true,
            capturedAt: "2026-08-29T12:00:00.000Z",
            entries: [
              { userUid: "99", rankNo: 1, entryKind: "LIST", displayName: "Alice", score: 120 },
              { rankNo: 2, entryKind: "LIST", displayName: "匿名观众", score: 80 }
            ]
          }]
        }}
        selectedRankRoomId={room.id}
        pending={false}
        onAdd={async () => undefined}
        onRoomAction={async () => undefined}
        onCloseCreation={() => undefined}
        onTrendSelectionChange={() => undefined}
        onRankRoomChange={() => undefined}
        onRankRefresh={async () => undefined}
      />
    )

    expect(html).toContain("房间观众在线贡献榜")
    expect(html).toContain("Alice")
    expect(html).toContain("UID 99")
    expect(html).toContain("UID 未解析")
    expect(html).toContain("刷新全部榜单")
  })

  it("renders the original live danmaku controls, metrics and persisted sender identity", () => {
    const room = {
      id: "018f0f39-7b5e-4cc1-862d-9a208b3d0700",
      uid: "22",
      roomId: "330033",
      uname: "anchor",
      liveStatus: 1 as const,
      monitorStatus: "ACTIVE" as const,
      intervalSeconds: 300,
      recentTrend: [],
      version: 1
    }
    const html = renderToStaticMarkup(
      <BilibiliLiveWorkspacePresentation
        view="实时弹幕"
        creationOpen={false}
        rooms={[room]}
        events={[]}
        trends={[]}
        danmakuStatus={{
          liveRoomMonitorId: room.id,
          roomId: room.roomId,
          running: true,
          status: "CONNECTED",
          connectHost: "wss://broadcastlv.chat.bilibili.com/sub",
          sessionId: "018f0f39-7b5e-4cc1-862d-9a208b3d0702",
          ratePerMinute: 2,
          last5MinutesCount: 6,
          likeCount: 120,
          likeIncrement: 7,
          watchedCount: 999,
          heartbeatPopularity: 42,
          protocolVersion: 3,
          authMode: "ANONYMOUS",
          startedAt: "2026-08-29T12:00:00.000Z"
        }}
        danmakuRecent={[{
          messageText: "hello danmaku",
          senderUid: "1001",
          displayName: "完整昵称",
          medalName: "详细粉丝牌",
          sentAt: "2026-08-29T12:00:05.000Z"
        }]}
        selectedDanmakuRoomId={room.id}
        pending={false}
        onAdd={async () => undefined}
        onRoomAction={async () => undefined}
        onCloseCreation={() => undefined}
        onTrendSelectionChange={() => undefined}
        onDanmakuRoomChange={() => undefined}
        onDanmakuStart={async () => undefined}
        onDanmakuStop={async () => undefined}
      />
    )

    expect(html).toContain("实时弹幕监听")
    expect(html).toContain("protover=3")
    expect(html).toContain("停止弹幕监控")
    expect(html).toContain("hello danmaku")
    expect(html).toContain("完整昵称")
    expect(html).toContain("UID 1001")
    expect(html).toContain("详细粉丝牌")
    expect(html).not.toContain("示例弹幕")
  })

  it("renders persisted live sessions and their original coverage metrics", () => {
    const session = {
      id: "018f0f39-7b5e-4cc1-862d-9a208b3d0801",
      monitorId: "018f0f39-7b5e-4cc1-862d-9a208b3d0800",
      uid: "22",
      roomId: "330033",
      state: "CLOSED" as const,
      startedAt: "2026-08-29T12:00:00.000Z",
      endedAt: "2026-08-29T13:00:00.000Z",
      startSource: "REST_STATUS",
      endSource: "REST_STATUS",
      coverageStatus: "RECEIVED_WHILE_ONLINE" as const,
      transportSessionCount: 1,
      captureStartedAt: "2026-08-29T12:00:01.000Z",
      captureEndedAt: "2026-08-29T12:59:59.000Z",
      danmakuCount: 321,
      giftEventCount: 4,
      giftCount: 6,
      freeGiftCount: 2,
      giftSenderCount: 3,
      paidUserCount: 2,
      interactingUserCount: 19,
      unresolvedInteractingEventCount: 1,
      unresolvedGiftEventCount: 0,
      unresolvedPaidEventCount: 0,
      paidEventCount: 3,
      paidAmountMilliYuan: 128000,
      firstEventAt: "2026-08-29T12:00:02.000Z",
      lastEventAt: "2026-08-29T12:59:58.000Z"
    }
    const html = renderToStaticMarkup(
      <BilibiliLiveWorkspacePresentation
        view="直播场次"
        creationOpen={false}
        rooms={[{
          id: session.monitorId,
          uid: "22",
          roomId: "330033",
          uname: "anchor",
          liveStatus: 0,
          monitorStatus: "ACTIVE",
          intervalSeconds: 300,
          recentTrend: [],
          version: 1
        }]}
        events={[]}
        trends={[]}
        sessions={[session]}
        selectedSessionRoomId={session.monitorId}
        selectedSessionId={session.id}
        pending={false}
        onAdd={async () => undefined}
        onRoomAction={async () => undefined}
        onCloseCreation={() => undefined}
        onTrendSelectionChange={() => undefined}
        onSessionRoomChange={() => undefined}
        onSessionChange={() => undefined}
        onSessionExport={async () => undefined}
      />
    )

    expect(html).toContain("直播场次边界")
    expect(html).toContain("在线接收覆盖")
    expect(html).toContain("321")
    expect(html).toContain("¥128.00")
    expect(html).not.toContain("演示场次")
  })
})
import { LiveTrendChart } from "./LiveTrendChart"
it("keeps exact signed total and deltas accessible beside compact values", () => {
  const room = { id: "018f0f39-7b5e-4cc1-862d-9a208b3d0700", uid: "22", roomId: "122", uname: "exact",
    monitorStatus: "ACTIVE" as const, liveStatus: 1 as const, intervalSeconds: 300,
    onlineCount: "-9223372036854775808", onlineDelta: "-9223372036854775808", recentTrend: [], version: 1 }
  const html = renderToStaticMarkup(<BilibiliLiveWorkspacePresentation view="直播间" creationOpen={false}
    rooms={[room]} events={[]} trends={[]} selectedTrendIds={[room.id]} pending={false}
    onAdd={async () => undefined} onRoomAction={async () => undefined}
    onCloseCreation={() => undefined} onTrendSelectionChange={() => undefined} />)
  expect(html).toContain('aria-label="总在线/热度 -9223372036854775808"')
  expect(html).toContain('aria-label="变化 -9223372036854775808"')
  expect(html).toContain('aria-label="较上次 -9223372036854775808"')
  expect(html).toContain("-92233720368.5亿")
})
it("renders adjacent unsafe Live counts at distinct coordinates with exact accessible titles", () => {
  const html = renderToStaticMarkup(<LiveTrendChart roomName="精确直播" height={320} samples={{
    source: "history", provisionalTime: false, points: [
      { capturedAt: "2026-10-07T00:00:00Z", onlineCount: "9007199254740992" },
      { capturedAt: "2026-10-07T00:01:00Z", onlineCount: "9007199254740993" }
    ] }} />)
  expect(html).toContain("9,007,199,254,740,992")
  expect(html).toContain("9,007,199,254,740,993")
  const heights = [...html.matchAll(/<circle[^>]+cy="([^"]+)"/g)].map(match => match[1])
  expect(new Set(heights).size).toBe(2)
})
