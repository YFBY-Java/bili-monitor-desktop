import { spawn, type ChildProcess } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import { readdirSync, WriteStream } from "node:fs"
import { lstat, mkdir, readFile, readdir, rm, rmdir, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, parse, resolve } from "node:path"
import { Readable, Writable } from "node:stream"
import { setImmediate } from "node:timers/promises"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

import type { BilibiliLiveSessionExportCategory } from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"
import ExcelJS from "exceljs"
import { unzipSync } from "fflate"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ZipFile } from "yazl"

import { BilibiliLiveSessionExportService } from "./bilibili-live-session-export-service"
import { writeSnapshotCsv, writeSnapshotZip } from "./bilibili-live-session-csv-zip"
import { BilibiliLiveSessionService } from "./bilibili-live-session-service"
import { writeSnapshotRows, writeSnapshotXlsx } from "./bilibili-live-session-xlsx"
import { LocalCoreRuntime } from "./local-core-runtime"
import { createExportSnapshotWorkspace } from "./export-snapshot-workspace"

describe("BilibiliLiveSessionExportService", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("hands prepared ownership across real Core exits and recovers only after Main also exits", async () => {
    directory = resolve(tmpdir(), `bmd-prepared-handoff-${crypto.randomUUID()}`)
    const database = await ControlDatabase.open(directory)
    const sessions = new BilibiliLiveSessionService({ database, idFactory: () => crypto.randomUUID() })
    const monitorId = crypto.randomUUID()
    let sessionId: string
    try {
      seedRoom(database, monitorId)
      const room = database.findBilibiliLiveRoomById(monitorId)!
      sessionId = sessions.reconcileRest(room, { liveStatus: 1, liveTime: "2026-08-29T12:00:00.000Z",
        title: "synthetic", fetchedAt: "2026-08-29T12:00:02.000Z" })!.sessionId
    } finally { database.close() }
    const appRequire = createRequire(new URL("../../../apps/desktop/package.json", import.meta.url))
    const viteRequire = createRequire(appRequire.resolve("vite"))
    const { build } = viteRequire("esbuild") as { build: (options: Record<string, unknown>) => Promise<unknown> }
    const entry = resolve(directory, "synthetic-core.cjs")
    await build({ entryPoints: [fileURLToPath(new URL("./local-core-runtime.ts", import.meta.url))], outfile: entry,
      bundle: true, platform: "node", format: "cjs", target: "node24", logLevel: "silent",
      external: ["exceljs", "yazl", "zod"] })
    const main = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000); process.stdout.write('ready')"],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] })
    await once(main.stdout, "data")
    const mainInstanceId = crypto.randomUUID()
    const key = Buffer.alloc(32, 7)
    const creator = spawn(process.execPath, ["-e", `
      const readline = require('node:readline').createInterface({ input: process.stdin });
      readline.once('line', async line => {
        const input = JSON.parse(line); readline.close();
        const { LocalCoreRuntime } = require(process.argv[1]);
        const runtime = await LocalCoreRuntime.start({ ...input, now: () => new Date('2026-10-06T12:00:00.000Z'),
          credentialKey: Buffer.from(input.key, 'base64'), schedulerEnabled: false });
        const prepared = [];
        for (let i = 0; i < 3; i++) prepared.push(await runtime.prepareBilibiliLiveSessionExport({ sessionId: input.sessionId, category: 'danmaku' }));
        await runtime.stop(); process.stdout.write(JSON.stringify(prepared));
      });
    `, entry], { windowsHide: true, env: { ...process.env,
      NODE_PATH: fileURLToPath(new URL("../node_modules", import.meta.url)) }, stdio: ["pipe", "pipe", "pipe"] })
    let output = "", errors = ""
    creator.stdout.on("data", chunk => { output += String(chunk) })
    creator.stderr.on("data", chunk => { errors += String(chunk) })
    creator.stdin.end(`${JSON.stringify({ dataDirectory: directory, version: "test", key: key.toString("base64"),
      mainContext: { mainInstanceId, mainPid: main.pid }, sessionId })}\n`)
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const stopChild = async (child: ChildProcess) => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit"); child.kill(); await exited
      }
    }
    try {
      const [exitCode] = await once(creator, "exit")
      expect(exitCode, errors).toBe(0)
      const prepared = JSON.parse(output) as Array<{ temporaryPath: string; suggestedFileName: string }>
      expect(prepared).toHaveLength(3)
      const paths = prepared.map(item => dirname(item.temporaryPath))
      expect(basename(prepared[0]!.temporaryPath)).toBe("output.csv")
      expect(new Set(paths).size).toBe(3)
      expect(prepared.map(item => item.suggestedFileName)).toEqual([
        "anchor-2026-10-06-第1次导出-弹幕.csv", "anchor-2026-10-06-第2次导出-弹幕.csv", "anchor-2026-10-06-第3次导出-弹幕.csv"
      ])
      const root = resolve(directory, "exports", "temp")
      const owner = JSON.parse(await readFile(resolve(paths[0]!, "owner.json"), "utf8"))
      expect(owner).toMatchObject({ mainInstanceId, mainPid: main.pid, corePid: creator.pid, category: "danmaku" })
      await unlink(resolve(paths[1]!, "owner.json"))
      await writeFile(resolve(paths[2]!, "foreign.txt"), "unknown member")
      const legacy = resolve(root, "legacy.csv")
      await writeFile(legacy, "legacy prepared")
      const restart = async () => {
        const runtime = await LocalCoreRuntime.start({ dataDirectory: directory!, version: "test", schedulerEnabled: false, credentialKey: key })
        await runtime.stop()
      }
      await restart()
      expect(await readdir(paths[0]!)).toEqual(["output.csv", "owner.json"])
      await stopChild(main)
      // An unavailable durable audit must defer every unlink, including the output.
      await mkdir(resolve(root, "prepared-recovery.ndjson"))
      await restart()
      expect(await readdir(paths[0]!)).toEqual(["output.csv", "owner.json"])
      await rmdir(resolve(root, "prepared-recovery.ndjson"))
      await restart()
      await expect(lstat(paths[0]!)).rejects.toMatchObject({ code: "ENOENT" })
      for (const item of prepared.slice(1)) expect(await readFile(item.temporaryPath, "utf8")).toContain("occurred_at")
      expect(await readFile(legacy, "utf8")).toBe("legacy prepared")
      expect(await readFile(resolve(paths[2]!, "foreign.txt"), "utf8")).toBe("unknown member")
      const audit = await readFile(resolve(root, "prepared-recovery.ndjson"), "utf8")
      expect(audit).toContain('"outcome":"attempted"')
      expect(audit).toContain('"outcome":"removed"')
      expect(audit).not.toContain(directory)
      expect(audit).not.toContain(key.toString("base64"))
    } finally {
      await stopChild(creator); await stopChild(main); warning.mockRestore()
    }
  }, 20_000)

  it("recovers only confirmed abandoned Core snapshot workspaces before opening storage", async () => {
    directory = resolve(tmpdir(), `bmd-session-export-recovery-${crypto.randomUUID()}`)
    const exportDirectory = resolve(directory, "exports", "temp")
    const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" })
    const deadPid = child.pid
    if (!deadPid) throw new Error("child PID missing")
    await once(child, "exit")
    expect(() => process.kill(deadPid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }))

    const workspace = async (kind: "zip" | "xlsx", pid: number, marked = true) => {
      const owned = await createExportSnapshotWorkspace(exportDirectory, kind)
      const { path } = owned
      const { relativeDirectory } = owned.owner
      if (marked) await writeFile(resolve(path, "owner.json"), JSON.stringify({ ...owned.owner, corePid: pid }))
      else await unlink(resolve(path, "owner.json"))
      const member = resolve(path, kind === "zip" ? "summary.csv" : "summary.ndjson")
      await writeFile(member, "snapshot sentinel", { flag: "wx" })
      return { relativeDirectory, path, member, jobId: owned.owner.jobId }
    }
    const [abandonedZip, abandonedXlsx] = await Promise.all([workspace("zip", deadPid), workspace("xlsx", deadPid)])
    const live = await workspace("zip", process.pid)
    const unmarked = await workspace("xlsx", deadPid, false)
    const unknownMember = await workspace("zip", deadPid)
    await writeFile(resolve(unknownMember.path, "foreign.txt"), "foreign sentinel")
    const invalid = await workspace("xlsx", deadPid)
    await writeFile(resolve(invalid.path, "owner.json"), "{\"version\":999}")
    const replacedRoot = await workspace("zip", deadPid)
    const replacedOwner = JSON.parse(await readFile(resolve(replacedRoot.path, "owner.json"), "utf8"))
    replacedOwner.rootIdentity.ino = "0"
    await writeFile(resolve(replacedRoot.path, "owner.json"), JSON.stringify(replacedOwner))
    const prepared = resolve(exportDirectory, "prepared-xlsx.xlsx")
    await writeFile(prepared, "prepared sentinel")
    let entriesAtStorageOpen: string[] | undefined
    const open = ControlDatabase.open
    const storageOpen = vi.spyOn(ControlDatabase, "open").mockImplementation(async (...args) => {
      entriesAtStorageOpen = await readdir(exportDirectory)
      return open(...args)
    })
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    let runtime: LocalCoreRuntime | undefined
    try {
      runtime = await LocalCoreRuntime.start({
        dataDirectory: directory, version: "test", schedulerEnabled: false, credentialKey: Buffer.alloc(32, 1)
      })
      expect(entriesAtStorageOpen).not.toContain(abandonedZip.relativeDirectory)
      expect(entriesAtStorageOpen).not.toContain(abandonedXlsx.relativeDirectory)
      await expect(lstat(abandonedZip.path)).rejects.toMatchObject({ code: "ENOENT" })
      await expect(lstat(abandonedXlsx.path)).rejects.toMatchObject({ code: "ENOENT" })
      for (const retained of [live, unmarked, unknownMember, invalid, replacedRoot]) {
        expect(await readFile(retained.member, "utf8")).toBe("snapshot sentinel")
      }
      expect(await readFile(prepared, "utf8")).toBe("prepared sentinel")
      expect(await readFile(resolve(unknownMember.path, "foreign.txt"), "utf8")).toBe("foreign sentinel")
      const auditText = await readFile(resolve(exportDirectory, "snapshot-recovery.ndjson"), "utf8")
      const audits = auditText.trim().split("\n").map((line: string) => JSON.parse(line))
      expect(audits.map((item) => [item.jobId, item.kind, item.outcome])).toEqual([
        [abandonedXlsx.jobId, "xlsx", "attempted"], [abandonedXlsx.jobId, "xlsx", "removed"],
        [abandonedZip.jobId, "zip", "attempted"], [abandonedZip.jobId, "zip", "removed"]
      ])
      for (const record of audits) expect(record).toMatchObject({
        event: "export_snapshot_workspace_recovery", attemptId: expect.any(String), at: expect.any(String)
      })
      expect(auditText).not.toContain(directory)
      expect(auditText).not.toContain("sentinel")
      expect(warning).toHaveBeenCalled()
      for (const [message] of warning.mock.calls) {
        expect(JSON.parse(String(message))).toMatchObject({ event: "export_snapshot_workspace_cleanup", outcome: "retained" })
        expect(String(message)).not.toContain(directory)
      }
    } finally {
      await runtime?.stop()
      storageOpen.mockRestore()
      warning.mockRestore()
    }
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
    const prepareStreamed = async (sessionId: string, category: BilibiliLiveSessionExportCategory) => {
      const bulkRead = vi.spyOn(database, "findAllBilibiliLiveSessionEvents").mockImplementation(() => {
        throw new Error("Exports must stream facts instead of materializing the whole session")
      })
      try {
        const progress = vi.fn()
        const prepared = await exports.prepare({ sessionId, category }, progress)
        expect(progress).toHaveBeenCalled()
        return prepared
      } finally {
        bulkRead.mockRestore()
      }
    }

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
      // Historical facts are exported verbatim; PostgreSQL BTRIM only removes spaces.
      const priorDanmaku = database.findAllBilibiliLiveSessionEvents(session.sessionId)[0]
      if (!priorDanmaku) throw new Error("danmaku fact missing")
      database.insertBilibiliLiveSessionEvent({
        ...priorDanmaku,
        eventId: "018f0f39-7b5e-4cc1-862d-9a208b3d0b04",
        sourceEventId: "dm-2",
        eventKey: "DANMU_MSG:dm-2",
        senderName: "\t",
        messageText: "历史昵称",
        occurredAt: "2026-08-29T12:03:00.000Z",
        receivedAt: "2026-08-29T12:03:00.050Z"
      })

      const csv = await prepareStreamed(session.sessionId, "danmaku")
      expect(csv).toMatchObject({
        category: "danmaku",
        schemaVersion: "2",
        suggestedFileName: "anchor-2026-08-29-第1次导出-弹幕.csv",
        mediaType: "text/csv;charset=UTF-8"
      })
      const csvBytes = await readFile(csv.temporaryPath)
      expect([...csvBytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      const csvText = csvBytes.toString("utf8")
      expect(csvText).toContain("occurred_at,received_at,sender_uid,sender_name,medal_name,message_text,command,protocol_version,source_event_id\r\n")
      expect(csvText).toContain("事件发生时间,系统接收时间,发送者 B站 UID")
      expect(csvText).toContain("'=HYPERLINK(\"\"x\"\")")
      expect(csvText).toContain("'+cmd")

      database.runInTransaction(() => {
        for (let index = 0; index < 1_000; index += 1) {
          database.insertBilibiliLiveSessionEvent({
            ...priorDanmaku,
            eventId: idFactory(),
            sourceEventId: `large-dm-${index}`,
            eventKey: `DANMU_MSG:large-dm-${index}`,
            occurredAt: "2026-08-29T12:01:30.000Z",
            receivedAt: "2026-08-29T12:01:30.050Z"
          })
        }
      })
      const xlsx = await prepareStreamed(session.sessionId, "xlsx")
      const workbook = new ExcelJS.Workbook()
      const xlsxBytes = await readFile(xlsx.temporaryPath)
      await workbook.xlsx.load(xlsxBytes as unknown as Parameters<typeof workbook.xlsx.load>[0])
      expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["场次摘要", "弹幕", "礼物", "用户"])
      expect(workbook.getWorksheet("弹幕")?.rowCount).toBe(1_004)
      expect(workbook.getWorksheet("用户")?.getCell("C3").value).toBe("9007199254740999")
      expect.soft(workbook.getWorksheet("弹幕")?.getCell("H3").value).toBe("3")
      expect.soft(workbook.getWorksheet("礼物")?.getCell("R3").value).toBe("3")
      expect.soft(workbook.getWorksheet("用户")?.getCell("D3").value).toBe("\t")
      expect.soft(workbook.getWorksheet("弹幕")?.getCell("A1").border.bottom?.style).toBe("thin")
      expect.soft(workbook.getWorksheet("弹幕")?.getCell("A2").border.bottom?.style).toBe("thin")
      expect(workbook.getWorksheet("弹幕")?.views[0]).toMatchObject({ ySplit: 2, state: "frozen" })
      expect((await readdir(resolve(directory, "exports"))).some((name) => name.startsWith("xlsx-snapshot-"))).toBe(false)

      // Failed writers remove only their own partial output, never an existing export.
      await expect(writeSnapshotXlsx(xlsx.temporaryPath, [])).rejects.toMatchObject({ code: "EEXIST" })
      expect(await readFile(xlsx.temporaryPath)).toEqual(xlsxBytes)
      const invalidSnapshot = resolve(directory, "invalid.ndjson")
      const failedOutput = resolve(directory, "failed.xlsx")
      await writeFile(invalidSnapshot, "{}\n", "utf8")
      await expect(writeSnapshotXlsx(failedOutput, [{
        name: "弹幕", columns: { headers: ["message_text"], comments: ["弹幕内容"] },
        path: invalidSnapshot, rowCount: 1
      }])).rejects.toThrow("Invalid XLSX snapshot row")
      expect(await readdir(directory)).not.toContain("failed.xlsx")

      const complete = await prepareStreamed(session.sessionId, "all")
      const zipBytes = await readFile(complete.temporaryPath)
      const entries = unzipSync(zipBytes)
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
      for (const category of ["gifts", "users"] as const) {
        const separate = await prepareStreamed(session.sessionId, category)
        expect(await readFile(separate.temporaryPath)).toEqual(Buffer.from(entries[`${category}.csv`] ?? []))
      }
      expect(zipBytes.readUInt16LE(10)).toBe(0)
      expect(zipBytes.readUInt16LE(12)).toBe(0x0021)
      expect((await readdir(resolve(directory, "exports"))).some((name) => name.startsWith("zip-snapshot-"))).toBe(false)
      await expect(writeSnapshotZip(complete.temporaryPath, [])).rejects.toMatchObject({ code: "EEXIST" })
      expect(await readFile(complete.temporaryPath)).toEqual(zipBytes)
      const failedZip = resolve(directory, "failed.zip")
      await expect(writeSnapshotZip(failedZip, [{ name: "missing.csv", path: resolve(directory, "missing.csv") }]))
        .rejects.toMatchObject({ code: "ENOENT" })
      expect(await readdir(directory)).not.toContain("failed.zip")

      const columns = { headers: ["message_text"], comments: ["弹幕内容"] }
      const failedCsv = resolve(directory, "failed.csv")
      function* interruptedRows(): Iterable<string[]> {
        yield ["partial"]
        throw new Error("synthetic export iterator failure")
      }
      expect(() => writeSnapshotCsv(failedCsv, columns, interruptedRows(), (row) => row))
        .toThrow("synthetic export iterator failure")
      expect(await readdir(directory)).not.toContain("failed.csv")
      expect(() => writeSnapshotCsv(csv.temporaryPath, columns, [], (row) => row))
        .toThrow(expect.objectContaining({ code: "EEXIST" }))
      expect(await readFile(csv.temporaryPath)).toEqual(csvBytes)
    } finally {
      database.close()
    }
  })

  it("bounds XLSX worksheet input while real output is held and releases blocked abort", async () => {
    directory = resolve(tmpdir(), `bmd-xlsx-backpressure-${crypto.randomUUID()}`)
    if (parse(directory).root.toLowerCase() !== "d:\\") throw new Error("Synthetic XLSX must stay on D")
    await mkdir(directory)
    const snapshot = resolve(directory, "rows.ndjson")
    const rowCount = 512
    // The budget covers worksheet XML, both archive sides and fixed compression buffers.
    const rowBudget = 256
    function* rows(): Generator<string[]> {
      for (let index = 0; index < rowCount; index += 1) {
        yield [Array.from({ length: 128 }, (_, part) =>
          createHash("sha256").update(`${index}:${part}`).digest("hex")).join("")]
      }
    }
    writeSnapshotRows(snapshot, rows(), row => row)
    const columns = { headers: ["message_text"], comments: ["弹幕内容"] }
    const sheets = ["场次摘要", "弹幕", "礼物", "用户"].map(name => ({
      name, columns, path: snapshot, rowCount
    }))
    const OriginalWorkbook = ExcelJS.stream.xlsx.WorkbookWriter
    type ObservedSheet = ExcelJS.Worksheet & { stream: Readable & Partial<Writable> }
    type ObservedWorkbook = ExcelJS.stream.xlsx.WorkbookWriter & { zip: Readable & Partial<Writable> }
    for (const abort of [false, true]) {
      const path = resolve(directory, abort ? "aborted.xlsx" : "released.xlsx")
      const controller = new AbortController()
      let output: WriteStream | undefined
      let workbook: ObservedWorkbook | undefined
      let input: ObservedSheet["stream"] | undefined
      let produced = 0
      let commits = 0
      const constructor = vi.spyOn(ExcelJS.stream.xlsx, "WorkbookWriter").mockImplementation(function (options) {
        if (!(options.stream instanceof WriteStream)) throw new Error("Expected real XLSX file output")
        output = options.stream
        output.cork()
        workbook = new OriginalWorkbook(options) as ObservedWorkbook
        const addWorksheet = workbook.addWorksheet.bind(workbook)
        workbook.addWorksheet = (...args) => {
          const sheet = addWorksheet(...args) as ObservedSheet
          input ??= sheet.stream
          const addRow = sheet.addRow.bind(sheet)
          sheet.addRow = (...rowArgs) => {
            const row = addRow(...rowArgs)
            const commit = row.commit.bind(row)
            row.commit = () => { commit(); produced += 1 }
            return row
          }
          return sheet
        }
        const commit = workbook.commit.bind(workbook)
        workbook.commit = () => { commits += 1; return commit() }
        return workbook
      })
      const pending = writeSnapshotXlsx(path, sheets, controller.signal)
      // Observe rejection immediately; the abort branch must never be unhandled.
      const settled = pending.then(() => null, (error: unknown) => error)
      try {
        await vi.waitFor(() => {
          expect(output?.writableNeedDrain).toBe(true)
          expect(workbook?.zip.readableFlowing).toBe(false)
          // First worksheet drain can be transient while asynchronous compression
          // fills the archive. Observe both archive buffers, not an event-loop guess.
          const archiveBlocked = workbook!.zip.readableLength >= workbook!.zip.readableHighWaterMark
            && (workbook!.zip.writableLength ?? 0) >= (workbook!.zip.writableHighWaterMark ?? Infinity)
          expect(produced >= rowBudget || (archiveBlocked && input?.writableNeedDrain === true)).toBe(true)
        })
        // The old StreamBuf reaches the budget; the standard worksheet input stops.
        for (let turn = 0; turn < 20; turn += 1) await setImmediate()
        const pausedAt = produced
        expect(pausedAt).toBeLessThan(rowBudget)
        expect(workbook?.zip.readableHighWaterMark).toBe(65_536)
        expect(workbook?.zip.writableHighWaterMark).toBe(65_536)
        expect(workbook?.zip.readableLength).toBeLessThanOrEqual(65_536 + 16_384)
        expect(workbook?.zip.writableLength).toBeLessThanOrEqual(65_536 + 16_384)
        expect(input?.writableNeedDrain).toBe(true)
        expect(input?.writableHighWaterMark).toBe(65_536)
        expect(input?.readableHighWaterMark).toBe(65_536)
        expect(input?.writableLength).toBeLessThanOrEqual(65_536 + 9_000)
        expect(input?.readableLength).toBeLessThanOrEqual(65_536 + 9_000)
        expect(commits).toBe(0)
        for (let turn = 0; turn < 20; turn += 1) await setImmediate()
        expect(produced).toBe(pausedAt)
        if (abort) {
          const reason = new Error("synthetic blocked XLSX abort")
          controller.abort(reason)
          expect(await settled).toBe(reason)
          expect(input?.destroyed).toBe(true)
          expect(input?.closed).toBe(true)
          expect(output?.closed).toBe(true)
          expect(await readdir(directory)).not.toContain("aborted.xlsx")
        } else {
          output?.uncork()
          expect(await settled).toBeNull()
          const actual = new ExcelJS.Workbook()
          await actual.xlsx.readFile(path)
          expect(actual.worksheets.map(sheet => sheet.name)).toEqual(sheets.map(sheet => sheet.name))
          for (const sheet of actual.worksheets) {
            expect(sheet.rowCount).toBe(rowCount + 2)
            expect(sheet.getCell("A3").value).toBe(rows().next().value?.[0])
          }
        }
      } finally {
        controller.abort(new Error("synthetic XLSX fixture cleanup"))
        output?.uncork()
        await settled
        constructor.mockRestore()
      }
    }
  })

  it.each(["all", "xlsx"] as const)("cancels active %s compression and cleans up before closing Core storage", async (category) => {
    directory = resolve(tmpdir(), `bmd-session-export-stop-${crypto.randomUUID()}`)
    const database = await ControlDatabase.open(directory)
    let sequence = 0
    const idFactory = () => `018f0f39-7b5e-4cc1-862d-${String(++sequence).padStart(12, "0")}`
    const sessions = new BilibiliLiveSessionService({ database, idFactory })
    const monitorId = "018f0f39-7b5e-4cc1-862d-9a208b3d0b00"
    let sessionId: string
    try {
      seedRoom(database, monitorId)
      const room = database.findBilibiliLiveRoomById(monitorId)
      if (!room) throw new Error("room missing")
      const session = sessions.reconcileRest(room, {
        liveStatus: 1, liveTime: "2026-08-29T12:00:00.000Z", title: "直播标题",
        fetchedAt: "2026-08-29T12:00:02.000Z"
      })
      if (!session) throw new Error("session missing")
      sessionId = session.sessionId
    } finally {
      database.close()
    }
    const runtime = await LocalCoreRuntime.start({
      dataDirectory: directory, version: "test", schedulerEnabled: false,
      credentialKey: Buffer.alloc(32, 1)
    })
    const exportDirectory = resolve(directory, "exports", "temp")
    let stopping: Promise<void> | undefined
    let filesAtClose: string[] | undefined
    const close = ControlDatabase.prototype.close
    const closeStorage = vi.spyOn(ControlDatabase.prototype, "close").mockImplementation(function (this: ControlDatabase) {
      filesAtClose = readdirSync(exportDirectory)
      close.call(this)
    })
    const stopDuringCompression = () => {
      queueMicrotask(() => { stopping = runtime.stop() })
    }
    const end = ZipFile.prototype.end
    const commit = ExcelJS.stream.xlsx.WorkbookWriter.prototype.commit
    const compression = category === "all"
      ? vi.spyOn(ZipFile.prototype, "end").mockImplementation(function (this: ZipFile, ...args) {
        const result = end.apply(this, args)
        stopDuringCompression()
        return result
      })
      : vi.spyOn(ExcelJS.stream.xlsx.WorkbookWriter.prototype, "commit").mockImplementation(function (this: ExcelJS.stream.xlsx.WorkbookWriter) {
        const result = commit.call(this)
        stopDuringCompression()
        return result
      })
    const pending = runtime.prepareBilibiliLiveSessionExport({ sessionId, category })
    try {
      await expect(pending).rejects.toMatchObject({ name: "AbortError" })
      expect(stopping).toBeDefined()
      await stopping
      expect(filesAtClose).toEqual([])
      expect(await readdir(exportDirectory)).toEqual([])
      expect(() => runtime.getBilibiliLiveSession(sessionId)).toThrow("already stopped")
    } finally {
      await Promise.allSettled([pending, stopping])
      await runtime.stop()
      compression.mockRestore()
      closeStorage.mockRestore()
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
