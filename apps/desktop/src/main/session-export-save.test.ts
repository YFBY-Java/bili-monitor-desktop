import { spawn } from "node:child_process"
import { once } from "node:events"
import { createHmac, randomBytes, randomUUID } from "node:crypto"
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { PreparedBilibiliLiveSessionExport } from "@bmd/contracts"
import { expect, it, vi } from "vitest"
import { build } from "vite"

import { savePreparedSessionExport, type SessionExportSaveOptions } from "./session-export-save"
import { SessionExportJournal } from "./session-export-journal"

async function fixture() {
  const dataDirectory = await mkdtemp(join(tmpdir(), "bmd-export-save-"))
  const tempRoot = join(dataDirectory, "exports", "temp")
  await mkdir(tempRoot, { recursive: true })
  const prepared: PreparedBilibiliLiveSessionExport = {
    sessionId: randomUUID(), category: "xlsx", temporaryPath: join(tempRoot, `${randomUUID()}-xlsx.xlsx`),
    suggestedFileName: "主播-2026-10-06-第1次导出-完整数据.xlsx", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    schemaVersion: "2", coverageStatus: "RECEIVED_WHILE_ONLINE"
  }
  await writeFile(prepared.temporaryPath, "synthetic export contents")
  return { dataDirectory, tempRoot, prepared, credentialKeyBase64: randomBytes(32).toString("base64"),
    mainInstanceId: randomUUID(), signal: new AbortController().signal, reportCleanupFailure: vi.fn() }
}

async function privateFixture() {
  const f = await fixture()
  await rm(f.prepared.temporaryPath)
  const result = { ...f, workspace: "" }
  await replacePrivatePrepared(result, "synthetic export contents")
  return result
}

async function replacePrivatePrepared(f: Awaited<ReturnType<typeof fixture>> & { workspace: string }, contents: string) {
  const jobId = randomUUID()
  const path = await mkdtemp(join(f.tempRoot, `prepared-xlsx-${jobId}-`))
  const core = spawn(process.execPath, ["-e", "process.exit(0)"], { windowsHide: true, stdio: "ignore" })
  await once(core, "exit")
  const identity = async (target: string) => {
    const s = await lstat(target, { bigint: true })
    return { dev: String(s.dev), ino: String(s.ino), birthtimeNs: String(s.birthtimeNs) }
  }
  const owner = { application: "bili-monitor-desktop", version: 1, jobId, category: "xlsx",
    mainInstanceId: f.mainInstanceId, mainPid: process.pid, corePid: core.pid,
    relativeDirectory: basename(path), canonicalRoot: f.tempRoot, canonicalWorkspace: path,
    rootIdentity: await identity(f.tempRoot), workspaceIdentity: await identity(path) }
  const signingKey = createHmac("sha256", Buffer.from(f.credentialKeyBase64, "base64"))
    .update("BMD_PREPARED_EXPORT_KEY_V1").digest()
  const signature = createHmac("sha256", signingKey).update("BMD_PREPARED_EXPORT_OWNER_V1\0")
    .update(JSON.stringify(owner)).digest("hex")
  await writeFile(join(path, "owner.json"), JSON.stringify({ ...owner, signature }), { flag: "wx" })
  f.prepared.temporaryPath = join(path, "output.xlsx")
  await writeFile(f.prepared.temporaryPath, contents, { flag: "wx" })
  f.workspace = path
}

it("saves a signed private prepared workspace after creator Core replacement and rejects unknown members before cleanup", async () => {
  const f = await privateFixture()
  const savedPath = join(f.dataDirectory, "chosen.xlsx")
  try {
    expect(await savePreparedSessionExport({ ...f, select: async () => ({ canceled: false, filePath: savedPath }) }))
      .toEqual({ category: "xlsx", canceled: false, savedPath })
    expect(await readFile(savedPath, "utf8")).toBe("synthetic export contents")
    await expect(stat(f.workspace)).rejects.toMatchObject({ code: "ENOENT" })
  } finally { await rm(f.dataDirectory, { recursive: true, force: true }) }
  const foreign = await privateFixture()
  try {
    await writeFile(join(foreign.workspace, "foreign.txt"), "retain")
    await expect(savePreparedSessionExport({ ...foreign, select: async () => ({ canceled: true }) })).rejects.toThrow()
    expect(await readFile(foreign.prepared.temporaryPath, "utf8")).toBe("synthetic export contents")
    expect(await readFile(join(foreign.workspace, "foreign.txt"), "utf8")).toBe("retain")
  } finally { await rm(foreign.dataDirectory, { recursive: true, force: true }) }
  const replaced = await privateFixture()
  const replacementTarget = join(replaced.dataDirectory, "chosen.xlsx")
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined)
  try {
    await expect(savePreparedSessionExport({ ...replaced, select: async () => {
      await rm(replaced.prepared.temporaryPath)
      await writeFile(replaced.prepared.temporaryPath, "foreign replacement")
      return { canceled: false, filePath: replacementTarget }
    } })).rejects.toThrow()
    await expect(stat(replacementTarget)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readFile(replaced.prepared.temporaryPath, "utf8")).toBe("foreign replacement")
    expect(await stat(join(replaced.workspace, "owner.json"))).toBeDefined()
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('"reason":"MEMBER_CHANGED"'))
    expect(JSON.stringify(warning.mock.calls)).not.toContain(replaced.dataDirectory)
  } finally { warning.mockRestore(); await rm(replaced.dataDirectory, { recursive: true, force: true }) }
})

it("recovers only the journaled part of a dead Main after a real copy is interrupted", async () => {
  const f = await fixture()
  const targetDirectory = join(f.dataDirectory, "chosen-private-directory")
  const savedPath = join(targetDirectory, "chosen.xlsx")
  const buildDirectory = join(f.dataDirectory, "fixture-build")
  await mkdir(targetDirectory)
  await writeFile(savedPath, "previous complete export")
  await build({ configFile: false, logLevel: "silent", ssr: { noExternal: true },
    build: { ssr: fileURLToPath(new URL("./session-export-save.ts", import.meta.url)), outDir: buildDirectory,
      emptyOutDir: false, target: "node24", rollupOptions: { output: { entryFileNames: "save.mjs" } } } })
  // The test harness pauses a real file stream; production has no test switch or hook.
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { Transform } from 'node:stream';
    import { createInterface } from 'node:readline';
    import { pathToFileURL } from 'node:url';
    const lines = createInterface({ input: process.stdin });
    const input = await new Promise(resolve => lines.once('line', line => resolve(JSON.parse(line))));
    const read = fs.createReadStream;
    fs.createReadStream = (...args) => read(...args).pipe(new Transform({
      transform(chunk) { this.push(chunk); process.stdout.write('copying\\n'); }
    }));
    syncBuiltinESMExports();
    setInterval(() => {}, 1000);
    const { savePreparedSessionExport } = await import(pathToFileURL(process.argv[1]).href);
    await savePreparedSessionExport({ ...input, signal: new AbortController().signal,
      select: async () => ({ canceled: false, filePath: input.savedPath }),
      reportCleanupFailure: details => process.stderr.write(JSON.stringify(details) + '\\n') });
  `, join(buildDirectory, "save.mjs")], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] })
  let output = "", errors = ""
  child.stdout.on("data", chunk => { output += String(chunk) })
  child.stderr.on("data", chunk => { errors += String(chunk) })
  child.stdin.write(`${JSON.stringify({ dataDirectory: f.dataDirectory, prepared: f.prepared,
    credentialKeyBase64: f.credentialKeyBase64, mainInstanceId: f.mainInstanceId, savedPath })}\n`)
  try {
    await vi.waitFor(() => { expect(errors).toBe(""); expect(output).toContain("copying") })
    const parts = (await readdir(targetDirectory)).filter(name => name.endsWith(".part"))
    expect(parts).toHaveLength(1)
    await vi.waitFor(async () => expect(await readFile(join(targetDirectory, parts[0]!), "utf8")).toBe("synthetic export contents"))
    const journals = await readdir(join(f.dataDirectory, "exports", "save-journal")).catch(() => [])
    expect(journals).toHaveLength(1)
    const ciphertext = await readFile(join(f.dataDirectory, "exports", "save-journal", journals[0]!), "utf8")
    expect(ciphertext).not.toContain(targetDirectory)
    expect(ciphertext).not.toContain(savedPath)
    expect(ciphertext).not.toContain(f.credentialKeyBase64)
    expect(await readFile(savedPath, "utf8")).toBe("previous complete export")
    const unrelatedPart = join(targetDirectory, `.bmd-export-${randomUUID()}.part`)
    await writeFile(unrelatedPart, "user-owned file with a similar name")
    const reportCleanupFailure = vi.fn()
    const recovery = new SessionExportJournal({ dataDirectory: f.dataDirectory, credentialKeyBase64: f.credentialKeyBase64,
      mainInstanceId: randomUUID(), reportCleanupFailure })
    // A Core restart while this Main is alive must preserve the in-flight part.
    await recovery.recover()
    expect(await readFile(join(targetDirectory, parts[0]!), "utf8")).toBe("synthetic export contents")
    const exited = new Promise<void>(done => child.once("exit", () => done()))
    child.kill()
    await exited
    expect(() => process.kill(child.pid!, 0)).toThrow()
    await recovery.recover()
    await expect(stat(join(targetDirectory, parts[0]!))).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readdir(join(f.dataDirectory, "exports", "save-journal"))).toEqual([])
    expect(await readFile(savedPath, "utf8")).toBe("previous complete export")
    expect(await readFile(unrelatedPart, "utf8")).toBe("user-owned file with a similar name")
    // Core's prepared flat file remains outside this ownership slice.
    expect(await readFile(f.prepared.temporaryPath, "utf8")).toBe("synthetic export contents")
    expect(reportCleanupFailure).not.toHaveBeenCalled()
    const audit = await readFile(join(f.dataDirectory, "logs", "session-exports.ndjson"), "utf8")
    expect(audit).toContain("session-export.partial-recovered")
    expect(audit).not.toContain(targetDirectory)
    expect(audit).not.toContain(f.credentialKeyBase64)
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>(done => child.once("exit", () => done())); child.kill(); await exited
    }
    await rm(f.dataDirectory, { recursive: true, force: true })
  }
}, 20_000)

it("saves the complete prepared file and cleans up after save or native cancel", async () => {
  const f = await privateFixture()
  const savedPath = join(f.dataDirectory, "exports", "chosen.xlsx")
  try {
    await writeFile(savedPath, "previous export")
    const select = vi.fn<SessionExportSaveOptions["select"]>(async () => ({ canceled: false, filePath: savedPath }))
    expect(await savePreparedSessionExport({ ...f, select })).toEqual({ category: "xlsx", canceled: false, savedPath })
    expect(select.mock.calls[0]?.[0]).toMatchObject({
      defaultPath: join(f.dataDirectory, "exports", f.prepared.suggestedFileName),
      filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }]
    })
    expect(await readFile(savedPath, "utf8")).toBe("synthetic export contents")
    await expect(stat(f.prepared.temporaryPath)).rejects.toMatchObject({ code: "ENOENT" })
    await replacePrivatePrepared(f, "cancel me")
    expect(await savePreparedSessionExport({ ...f, select: async () => ({ canceled: true }) }))
      .toEqual({ category: "xlsx", canceled: true })
    expect(await readdir(f.tempRoot)).toEqual([])
    expect(await readdir(join(f.dataDirectory, "exports"))).toEqual(["chosen.xlsx", "save-journal", "temp"])
    expect(f.reportCleanupFailure).not.toHaveBeenCalled()
    const audit = (await readFile(join(f.dataDirectory, "logs", "session-exports.ndjson"), "utf8"))
      .trim().split("\n").map(line => JSON.parse(line))
    expect(audit.map(item => item.outcome)).toEqual(["SAVED", "CANCELED"])
    expect(audit.every(item => item.sessionId === f.prepared.sessionId && item.category === "xlsx")).toBe(true)
    expect(JSON.stringify(audit)).not.toContain(f.dataDirectory)
  } finally { await rm(f.dataDirectory, { recursive: true, force: true }) }
})

it("aborts a pending save on quit without overwriting the chosen file or leaving owned temporary files", async () => {
  const f = await privateFixture()
  const cancellation = new AbortController()
  const savedPath = join(f.dataDirectory, "exports", "chosen.xlsx")
  let finishSelection!: (value: { canceled: boolean; filePath: string }) => void
  let selecting!: () => void
  const selectionStarted = new Promise<void>(resolve => { selecting = resolve })
  const selection = new Promise<{ canceled: boolean; filePath: string }>(resolve => { finishSelection = resolve })
  try {
    await writeFile(savedPath, "previous export")
    const saving = savePreparedSessionExport({ ...f, signal: cancellation.signal,
      select: () => { selecting(); return selection } })
    await selectionStarted
    cancellation.abort()
    expect(await saving).toEqual({ category: "xlsx", canceled: true })
    finishSelection({ canceled: false, filePath: savedPath })
    await Promise.resolve()
    expect(await readFile(savedPath, "utf8")).toBe("previous export")
    expect(await readdir(f.tempRoot)).toEqual([])
    expect(await readdir(join(f.dataDirectory, "exports"))).toEqual(["chosen.xlsx", "temp"])
    await replacePrivatePrepared(f, "never select a privileged path")
    await expect(savePreparedSessionExport({ ...f, select: async () => ({ canceled: false, filePath: "C:\\bmd-forbidden-export.xlsx" }) }))
      .rejects.toThrow("D")
    expect(await readdir(f.tempRoot)).toEqual([])
    await replacePrivatePrepared(f, "file disappeared while dialog was open")
    await expect(savePreparedSessionExport({ ...f, select: async () => {
      await rm(f.prepared.temporaryPath)
      return { canceled: false, filePath: savedPath }
    } })).rejects.toThrow("保存失败")
    expect(await readFile(savedPath, "utf8")).toBe("previous export")
    // Missing/replaced private sources fail the second ownership preflight before part creation.
    expect(await readdir(join(f.dataDirectory, "exports"))).toEqual(["chosen.xlsx", "temp"])
  } finally { await rm(f.dataDirectory, { recursive: true, force: true }) }
})
