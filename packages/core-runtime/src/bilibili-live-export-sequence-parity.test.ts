import { randomUUID } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

import type { BilibiliLiveSessionExportCategory } from "@bmd/contracts"
import { describe, expect, it } from "vitest"

import { createLiveSessionFixture } from "./__fixtures__/live-session"
import { BilibiliLiveSessionExportService } from "./bilibili-live-session-export-service"

async function exportFixture(uname?: string) {
  const fixture = await createLiveSessionFixture(uname)
  const { database, service, room, start } = fixture
  const session = service.reconcileRest(room, { liveStatus: 1, liveTime: start, title: room.title, fetchedAt: start })!
  const directory = dirname(database.status().databasePath)
  let now = new Date("2026-09-13T15:59:59.000Z")
  const createExporter = (exportDirectory = resolve(directory, "exports")) => new BilibiliLiveSessionExportService({
    database, sessions: service, exportDirectory, now: () => now, idFactory: randomUUID
  })
  return { ...fixture, sessionId: session.sessionId, directory, createExporter,
    setNow: (value: string) => { now = new Date(value) } }
}

describe("original daily export naming parity", () => {
  it.each<[BilibiliLiveSessionExportCategory, string]>([
    ["danmaku", "弹幕.csv"], ["gifts", "礼物.csv"], ["users", "用户.csv"],
    ["xlsx", "完整数据.xlsx"], ["all", "完整数据.zip"]
  ])("names %s exports with the original localized category", async (category, suffix) => {
    const fixture = await exportFixture()
    try {
      const result = await fixture.createExporter().prepare({ sessionId: fixture.sessionId, category })
      expect(result.suggestedFileName).toBe(`测试主播-2026-09-13-第1次导出-${suffix}`)
      expect((await readFile(result.temporaryPath)).length).toBeGreaterThan(0)
    } finally { await fixture.close() }
  })

  it.each([
    ["主播/测试:\r\n", "主播_测试___"],
    ["  名称\\/*?\"<>|\u007f  ", "名称_________"],
    ["  \u3000  ", "uid-22"],
    ["\u00a0名称\u00a0", "\u00a0名称\u00a0"],
    ["\ufeff名称\ufeff", "\ufeff名称\ufeff"],
    ["🌸".repeat(81), "🌸".repeat(80)]
  ])("sanitizes and bounds the streamer name %s", async (uname, prefix) => {
    const fixture = await exportFixture(uname)
    try {
      const result = await fixture.createExporter().prepare({ sessionId: fixture.sessionId, category: "xlsx" })
      expect(result.suggestedFileName).toBe(`${prefix}-2026-09-13-第1次导出-完整数据.xlsx`)
    } finally { await fixture.close() }
  })

  it("shares numbering across sessions and overlapping formats and resets at Shanghai midnight", async () => {
    const fixture = await exportFixture()
    const { service, room, sessionId, createExporter } = fixture
    try {
      service.reconcileRest(room, { liveStatus: 0, liveTime: null, title: room.title, fetchedAt: "2026-09-13T05:00:00.000Z" })
      const second = service.reconcileRest(room, { liveStatus: 1, liveTime: "2026-09-13T06:00:00.000Z",
        title: room.title, fetchedAt: "2026-09-13T06:00:00.000Z" })!
      const categories = ["danmaku", "gifts", "users", "xlsx", "all"] as const
      const results = await Promise.all(categories.map((category, index) => createExporter().prepare({
        sessionId: index % 2 === 0 ? sessionId : second.sessionId, category
      })))
      expect(results.map(result => result.suggestedFileName.match(/第(\d+)次导出/)?.[1])).toEqual(["1", "2", "3", "4", "5"])
      expect(new Set(results.map(result => result.temporaryPath)).size).toBe(5)
      fixture.setNow("2026-09-13T16:00:00.000Z")
      const tomorrow = await createExporter().prepare({ sessionId, category: "all" })
      expect(tomorrow.suggestedFileName).toBe("测试主播-2026-09-14-第1次导出-完整数据.zip")
    } finally { await fixture.close() }
  })

  it("does not reuse an allocated number after file IO fails or a prepared export is never saved", async () => {
    const fixture = await exportFixture()
    try {
      const blockedDirectory = resolve(fixture.directory, "not-a-directory")
      await writeFile(blockedDirectory, "synthetic IO failure")
      await expect(fixture.createExporter(blockedDirectory).prepare({ sessionId: fixture.sessionId, category: "users" })).rejects.toThrow()
      const unsaved = await fixture.createExporter().prepare({ sessionId: fixture.sessionId, category: "users" })
      expect(unsaved.suggestedFileName).toBe("测试主播-2026-09-13-第2次导出-用户.csv")
      const next = await fixture.createExporter().prepare({ sessionId: fixture.sessionId, category: "users" })
      expect(next.suggestedFileName).toBe("测试主播-2026-09-13-第3次导出-用户.csv")
    } finally { await fixture.close() }
  })

  it("rejects missing sessions and invalid categories before allocating a number", async () => {
    const fixture = await exportFixture()
    try {
      const exporter = fixture.createExporter()
      await expect(exporter.prepare({ sessionId: randomUUID(), category: "all" })).rejects.toThrow("直播场次不存在")
      // Exercise the untrusted input boundary, bypassing only the caller's static type.
      await expect(Reflect.apply(exporter.prepare, exporter, [{ sessionId: fixture.sessionId, category: "../all" }])).rejects.toThrow()
      const result = await exporter.prepare({ sessionId: fixture.sessionId, category: "all" })
      expect(result.suggestedFileName).toBe("测试主播-2026-09-13-第1次导出-完整数据.zip")
    } finally { await fixture.close() }
  })
})
