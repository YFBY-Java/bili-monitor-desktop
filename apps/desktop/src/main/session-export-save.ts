import { createReadStream, createWriteStream } from "node:fs"
import { lstat, realpath, rename, unlink } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { pipeline } from "node:stream/promises"

import type { BilibiliLiveSessionExportResult, PreparedBilibiliLiveSessionExport } from "@bmd/contracts"
import {
  cleanupExportPreparedWorkspace, validateExportPreparedWorkspace, type ExportPreparedWorkspace
} from "@bmd/core-runtime/export-prepared-workspace"

import { assertOutsideSystemDrive } from "./runtime-paths"
import { appendSessionExportAudit, exportErrorCode, SessionExportJournal } from "./session-export-journal"

export interface SessionExportSaveOptions {
  dataDirectory: string
  credentialKeyBase64: string
  mainInstanceId: string
  prepared: PreparedBilibiliLiveSessionExport
  signal: AbortSignal
  select: (options: {
    title: string
    defaultPath: string
    filters: Array<{ name: string; extensions: string[] }>
  }) => Promise<{ canceled: boolean; filePath?: string }>
  reportCleanupFailure: (details: { event: string; category: string; code: string }) => void | Promise<void>
}

export async function savePreparedSessionExport(
  options: SessionExportSaveOptions
): Promise<BilibiliLiveSessionExportResult> {
  const { prepared, signal } = options
  // Reject unowned paths before entering a finally that can delete a file.
  const tempRoot = assertOutsideSystemDrive(resolve(options.dataDirectory, "exports", "temp"))
  const tempPath = assertOutsideSystemDrive(resolve(prepared.temporaryPath))
  const child = relative(tempRoot, tempPath)
  if (!child || child.startsWith("..") || isAbsolute(child)) {
    throw new Error("Local Core 返回了无效的临时导出路径。")
  }
  let privateWorkspace: ExportPreparedWorkspace | undefined
  const credentialKey = Buffer.from(options.credentialKeyBase64, "base64")
  if (credentialKey.byteLength !== 32 || credentialKey.toString("base64") !== options.credentialKeyBase64) {
    throw new Error("导出临时文件所有权校验失败。")
  }
  if (dirname(child) !== ".") {
    privateWorkspace = await validateExportPreparedWorkspace({ rootPath: tempRoot, outputPath: tempPath,
      category: prepared.category, credentialKey,
      mainContext: { mainInstanceId: options.mainInstanceId, mainPid: process.pid } })
  }
  const canonicalRoot = assertOutsideSystemDrive(await realpath(tempRoot))
  if (!privateWorkspace && (dirname(await realpath(tempPath)) !== canonicalRoot || !(await lstat(tempPath)).isFile())) {
    throw new Error("Local Core 返回了无效的临时导出文件。")
  }
  const canceled: BilibiliLiveSessionExportResult = { category: prepared.category, canceled: true }
  let outcome = "CANCELED"
  try {
    if (signal.aborted) return canceled
    const selection = await selectUntilCanceled(options)
    if (signal.aborted || selection.canceled || !selection.filePath) return canceled
    const savedPath = assertOutsideSystemDrive(selection.filePath)
    // A D-drive junction must not redirect project output to another volume.
    const canonicalParent = assertOutsideSystemDrive(await realpath(dirname(savedPath)))
    const targetRelative = relative(canonicalRoot, join(canonicalParent, basename(savedPath)))
    if (!targetRelative || (!targetRelative.startsWith("..") && !isAbsolute(targetRelative))) {
      throw new Error("不能将导出文件保存到客户端临时目录。")
    }
    try {
      if (privateWorkspace) await validateExportPreparedWorkspace({ rootPath: tempRoot, outputPath: tempPath,
        category: prepared.category, credentialKey, expected: privateWorkspace,
        mainContext: { mainInstanceId: options.mainInstanceId, mainPid: process.pid } })
      await publishCompleteFile(tempPath, join(canonicalParent, basename(savedPath)), options)
    } catch (error) {
      if (signal.aborted) return canceled
      throw new Error("导出文件保存失败，请检查目标目录和磁盘空间后重试。", { cause: error })
    }
    outcome = "SAVED"
    return { category: prepared.category, canceled: false, savedPath }
  } catch (error) {
    outcome = "FAILED"
    throw error
  } finally {
    if (privateWorkspace) {
      if (!await cleanupExportPreparedWorkspace(privateWorkspace, credentialKey)) {
        await options.reportCleanupFailure({ event: "session-export.temp-cleanup-failed", category: prepared.category,
          code: "EXPORT_PREPARED_CLEANUP_UNCONFIRMED" })
        await appendSessionExportAudit(options, { event: "session-export.temp-cleanup-failed", category: prepared.category,
          sessionId: prepared.sessionId, code: "EXPORT_PREPARED_CLEANUP_UNCONFIRMED" })
      }
    } else await removeOwnedFile(tempPath, options, "session-export.temp-cleanup-failed")
    await appendSessionExportAudit(options, { event: "session-export.save-completed", outcome,
      sessionId: prepared.sessionId, category: prepared.category })
  }
}

async function publishCompleteFile(source: string, savedPath: string, options: SessionExportSaveOptions): Promise<void> {
  const { signal } = options
  signal.throwIfAborted()
  const journal = new SessionExportJournal(options)
  const part = await journal.createPart(dirname(savedPath), options.prepared.sessionId, options.prepared.category)
  const output = createWriteStream(part.record.partPath, { fd: part.fd, autoClose: true })
  const closed = new Promise<void>(resolveClosed => output.once("close", resolveClosed))
  let published = false
  let registered = false
  try {
    await journal.register(part)
    registered = true
    signal.throwIfAborted()
    await pipeline(createReadStream(source), output, { signal })
    await closed
    signal.throwIfAborted()
    // Commit on the same filesystem only after the complete copy is closed.
    await journal.assertPart(part)
    signal.throwIfAborted()
    await rename(part.record.partPath, savedPath)
    published = true
  } finally {
    output.destroy()
    await closed
    const removed = published || await journal.removePart(part)
    if (registered && removed) await journal.forget(part)
  }
}

function selectUntilCanceled(options: SessionExportSaveOptions): Promise<{ canceled: boolean; filePath?: string }> {
  return new Promise((resolveSelection, rejectSelection) => {
    const { signal, prepared } = options
    const abort = () => resolveSelection({ canceled: true })
    signal.addEventListener("abort", abort, { once: true })
    const category = prepared.category
    const filters = category === "xlsx" ? [{ name: "Excel 工作簿", extensions: ["xlsx"] }]
      : category === "all" ? [{ name: "ZIP 压缩包", extensions: ["zip"] }]
      : [{ name: "CSV 文件", extensions: ["csv"] }]
    // A late native-dialog result is consumed, but cannot publish after shutdown.
    Promise.resolve().then(() => {
      if (signal.aborted) return { canceled: true }
      return options.select({ title: "导出 B站直播场次",
        defaultPath: join(options.dataDirectory, "exports", prepared.suggestedFileName), filters })
    }).then(resolveSelection, rejectSelection)
      .finally(() => signal.removeEventListener("abort", abort))
      .catch(rejectSelection)
  })
}

async function removeOwnedFile(path: string, options: SessionExportSaveOptions, event: string): Promise<void> {
  try { await unlink(path) } catch (error) {
    const code = exportErrorCode(error)
    if (code !== "ENOENT") {
      await options.reportCleanupFailure({ event, category: options.prepared.category, code })
      await appendSessionExportAudit(options, { event, code, sessionId: options.prepared.sessionId, category: options.prepared.category })
    }
  }
}
