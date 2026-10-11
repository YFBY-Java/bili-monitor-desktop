import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomUUID } from "node:crypto"
import { closeSync, constants, fstatSync, openSync, type BigIntStats } from "node:fs"
import { lstat, mkdir, open, readFile, readdir, realpath, unlink, type FileHandle } from "node:fs/promises"
import { join } from "node:path"

import { z } from "zod"

import { assertOutsideSystemDrive } from "./runtime-paths"

const integerText = z.string().regex(/^(0|[1-9]\d{0,39})$/u)
const identitySchema = z.object({ dev: integerText, ino: integerText.refine(value => value !== "0"),
  birthtimeNs: integerText.refine(value => value !== "0") }).strict()
const categorySchema = z.enum(["danmaku", "gifts", "users", "all", "xlsx"])
const pathSchema = z.string().min(1).max(32768)
const recordSchema = z.object({ version: z.literal(1), operationId: z.uuid(), mainInstanceId: z.uuid(),
  mainPid: z.number().int().positive().max(0xffffffff), dataRoot: pathSchema, dataRootIdentity: identitySchema, parentPath: pathSchema,
  parentIdentity: identitySchema, partPath: pathSchema, partIdentity: identitySchema,
  sessionId: z.uuid(), category: categorySchema }).strict()
const envelopeSchema = z.object({ version: z.literal(1), iv: z.string().max(32),
  tag: z.string().max(32), ciphertext: z.string().max(262144) }).strict()
type PartRecord = z.infer<typeof recordSchema>
type FileIdentity = z.infer<typeof identitySchema>

export interface SessionExportFailure { event: string; category: string; code: string }
interface AuditOptions {
  dataDirectory: string
  reportCleanupFailure: (details: SessionExportFailure) => void | Promise<void>
}
interface JournalOptions extends AuditOptions { credentialKeyBase64: string; mainInstanceId: string }
export interface OwnedExportPart { fd: number; record: PartRecord }

export class SessionExportJournal {
  private readonly key: Buffer

  constructor(private readonly options: JournalOptions) {
    const key = Buffer.from(options.credentialKeyBase64, "base64")
    if (key.byteLength !== 32 || key.toString("base64") !== options.credentialKeyBase64
      || !z.uuid().safeParse(options.mainInstanceId).success) throw journalError("EXPORT_JOURNAL_KEY_INVALID")
    this.key = Buffer.from(hkdfSync("sha256", key, "BMD_MAIN_EXPORT_JOURNAL", "v1", 32))
  }

  async createPart(parentPath: string, sessionId: string, category: PartRecord["category"]): Promise<OwnedExportPart> {
    const { dataRoot, dataRootIdentity } = await this.location()
    const canonicalParent = assertOutsideSystemDrive(await realpath(parentPath))
    const parent = await lstat(canonicalParent, { bigint: true })
    if (!parent.isDirectory()) throw journalError("EXPORT_PARENT_INVALID")
    const operationId = randomUUID()
    const partPath = join(canonicalParent, `.bmd-export-${operationId}.part`)
    // EEXIST never grants ownership, and must not enter any part cleanup.
    const fd = openSync(partPath, "wx", 0o600)
    try {
      const file = fstatSync(fd, { bigint: true })
      if (!file.isFile()) throw journalError("EXPORT_PART_INVALID")
      const record = recordSchema.parse({ version: 1, operationId, mainInstanceId: this.options.mainInstanceId,
        mainPid: process.pid, dataRoot, dataRootIdentity, parentPath: canonicalParent, parentIdentity: identity(parent),
        partPath, partIdentity: identity(file), sessionId, category })
      return { fd, record }
    } catch (error) {
      closeSync(fd)
      // Without a captured stable identity this wx-created file cannot be recovered safely.
      await this.report("session-export.part-identity-failed", exportErrorCode(error))
      throw error
    }
  }

  async register(part: OwnedExportPart): Promise<void> {
    try {
      const location = await this.location()
      assertRecordRoot(part.record, location)
      // Keep the nonce explicitly in the envelope; never retain selected paths in plaintext.
      const iv = randomBytes(12)
      const encryption = createCipheriv("aes-256-gcm", this.key, iv)
      encryption.setAAD(aad(part.record.operationId))
      const ciphertext = Buffer.concat([encryption.update(JSON.stringify(part.record), "utf8"), encryption.final()])
      const envelope = { version: 1, iv: iv.toString("base64"), tag: encryption.getAuthTag().toString("base64"),
        ciphertext: ciphertext.toString("base64") }
      const file = await open(join(location.directory, `${part.record.operationId}.json`), "wx", 0o600)
      try { await file.writeFile(JSON.stringify(envelope), "utf8"); await file.sync() }
      finally { await file.close() }
      assertRecordRoot(part.record, await this.location())
      // The wx-to-complete-journal crash window remains unprovable; no name-based fallback.
    } catch (error) {
      await this.report("session-export.journal-write-failed", exportErrorCode(error), part.record)
      throw error
    }
  }

  async assertPart(part: OwnedExportPart): Promise<void> {
    if (!await this.checkPart(part.record)) throw journalError("EXPORT_PART_MISSING")
  }

  async removePart(part: OwnedExportPart): Promise<boolean> {
    try {
      if (await this.checkPart(part.record)) {
        const audit = { category: part.record.category, sessionId: part.record.sessionId, operationId: part.record.operationId }
        if (!await appendSessionExportAudit(this.options, { ...audit, event: "session-export.partial-cleanup-attempted" })) return false
        if (await this.checkPart(part.record)) await unlink(part.record.partPath)
        if (!await appendSessionExportAudit(this.options, { ...audit, event: "session-export.partial-cleaned" })) return false
      }
      return true
    } catch (error) {
      await this.report("session-export.partial-cleanup-failed", exportErrorCode(error), part.record)
      return false
    }
  }

  async forget(part: OwnedExportPart): Promise<void> {
    try {
      const location = await this.location()
      assertRecordRoot(part.record, location)
      await unlink(join(location.directory, `${part.record.operationId}.json`))
    } catch (error) {
      if (exportErrorCode(error) !== "ENOENT") {
        await this.report("session-export.journal-cleanup-failed", exportErrorCode(error), part.record)
      }
    }
  }

  async recover(): Promise<void> {
    let directory: string
    try { directory = (await this.location()).directory } catch (error) {
      await this.report("session-export.recovery-directory-failed", exportErrorCode(error)); return
    }
    let names: string[]
    try { names = await readdir(directory) } catch (error) {
      await this.report("session-export.recovery-directory-failed", exportErrorCode(error)); return
    }
    // Enumerate only the application's journal, never the user's destination directory.
    for (const name of names) {
      if (!/^[0-9a-f-]{36}\.json$/u.test(name)) continue
      try {
        const operationId = z.uuid().parse(name.slice(0, -5))
        const path = join(directory, name)
        const file = await lstat(path)
        if (!file.isFile() || file.size > 262144 || await realpath(path) !== path) throw journalError("EXPORT_JOURNAL_INVALID")
        const envelope = envelopeSchema.parse(JSON.parse(await readFile(path, "utf8")))
        const decrypt = createDecipheriv("aes-256-gcm", this.key, base64(envelope.iv, 12))
        decrypt.setAuthTag(base64(envelope.tag, 16)); decrypt.setAAD(aad(operationId))
        const record = recordSchema.parse(JSON.parse(Buffer.concat([
          decrypt.update(base64(envelope.ciphertext)), decrypt.final()]).toString("utf8")))
        if (record.operationId !== operationId) throw journalError("EXPORT_JOURNAL_INVALID")
        if (record.mainInstanceId === this.options.mainInstanceId || record.mainPid === process.pid) continue
        try { process.kill(record.mainPid, 0); continue } catch (error) {
          // PID reuse, EPERM and all unknown probe results leave the file untouched.
          if (exportErrorCode(error) !== "ESRCH") {
            await this.report("session-export.recovery-owner-unknown", exportErrorCode(error), record); continue
          }
        }
        await this.checkPart(record)
        const audit = { category: record.category, sessionId: record.sessionId, operationId }
        if (!await appendSessionExportAudit(this.options, { ...audit, event: "session-export.partial-recovery-attempted" })) {
          await this.options.reportCleanupFailure({ event: "session-export.recovery-deferred-audit", category: record.category, code: "AUDIT_WRITE_FAILED" })
          continue
        }
        const existed = await this.checkPart(record)
        if (existed) await unlink(record.partPath)
        if (!await appendSessionExportAudit(this.options, { ...audit, event: "session-export.partial-recovered",
          outcome: existed ? "REMOVED" : "MISSING" })) {
          await this.options.reportCleanupFailure({ event: "session-export.recovery-completion-audit-failed", category: record.category, code: "AUDIT_WRITE_FAILED" })
          continue
        }
        await this.forget({ fd: -1, record })
      } catch (error) { await this.report("session-export.recovery-skipped", exportErrorCode(error)) }
    }
  }

  private async location(): Promise<{ dataRoot: string; dataRootIdentity: FileIdentity; directory: string }> {
    const root = await inspectDataRoot(this.options.dataDirectory)
    const exports = await inspectChildDirectory(root, "exports")
    const directory = (await inspectChildDirectory(exports, "save-journal")).path
    return { dataRoot: root.path, dataRootIdentity: root.identity, directory }
  }

  private async checkPart(record: PartRecord): Promise<boolean> {
    const { dataRoot, dataRootIdentity } = await this.location()
    if (record.dataRoot !== dataRoot || !sameIdentity(record.dataRootIdentity, dataRootIdentity)
      || assertOutsideSystemDrive(record.parentPath) !== record.parentPath
      || record.partPath !== join(record.parentPath, `.bmd-export-${record.operationId}.part`)
      || assertOutsideSystemDrive(await realpath(record.parentPath)) !== record.parentPath) {
      throw journalError("EXPORT_PART_PATH_CHANGED")
    }
    const parent = await lstat(record.parentPath, { bigint: true })
    if (!parent.isDirectory() || !sameIdentity(identity(parent), record.parentIdentity)) throw journalError("EXPORT_PARENT_CHANGED")
    let file: BigIntStats
    try { file = await lstat(record.partPath, { bigint: true }) } catch (error) {
      if (exportErrorCode(error) === "ENOENT") return false
      throw error
    }
    if (!file.isFile() || await realpath(record.partPath) !== record.partPath
      || !sameIdentity(identity(file), record.partIdentity)) throw journalError("EXPORT_PART_CHANGED")
    // Node's path check + unlink cannot provide atomic identity deletion against hostile races.
    return true
  }

  private async report(event: string, code: string, record?: PartRecord): Promise<void> {
    const category = record?.category ?? "unknown"
    await this.options.reportCleanupFailure({ event, category, code })
    await appendSessionExportAudit(this.options, { event, category, code,
      ...(record ? { sessionId: record.sessionId, operationId: record.operationId } : {}) })
  }
}

export async function appendSessionExportAudit(options: AuditOptions, details: {
  event: string; category: string; sessionId?: string; operationId?: string; outcome?: string; code?: string
}): Promise<boolean> {
  try {
    const root = await inspectDataRoot(options.dataDirectory)
    const logs = await inspectChildDirectory(root, "logs")
    const logPath = join(logs.path, "session-exports.ndjson")
    const { file, fileIdentity } = await openAuditFile(logPath)
    try {
      const verify = async () => {
        await assertDirectory(root); await assertDirectory(logs)
        const current = await lstat(logPath, { bigint: true })
        const fd = await file.stat({ bigint: true })
        assertAuditFile(current); assertAuditFile(fd)
        if (await realpath(logPath) !== logPath || !sameIdentity(identity(current), fileIdentity)
          || !sameIdentity(identity(fd), fileIdentity)) throw journalError("EXPORT_AUDIT_FILE_CHANGED")
      }
      await verify()
      await file.writeFile(`${JSON.stringify({ ...details, timestamp: new Date().toISOString() })}\n`, "utf8")
      await file.sync()
      await verify()
    } finally { await file.close() }
    return true
  } catch (error) {
    await options.reportCleanupFailure({ event: "session-export.audit-write-failed", category: details.category, code: exportErrorCode(error) })
    return false
  }
}

interface OwnedDirectory { path: string; identity: FileIdentity }
async function inspectDataRoot(dataDirectory: string): Promise<OwnedDirectory> {
  const path = assertOutsideSystemDrive(await realpath(assertOutsideSystemDrive(dataDirectory)))
  const directory = { path, identity: identity(await lstat(path, { bigint: true })) }
  await assertDirectory(directory)
  return directory
}
async function inspectChildDirectory(parent: OwnedDirectory, name: string): Promise<OwnedDirectory> {
  await assertDirectory(parent)
  const path = join(parent.path, name)
  let file: BigIntStats
  try { file = await lstat(path, { bigint: true }) } catch (error) {
    if (exportErrorCode(error) !== "ENOENT") throw error
    // The verified parent is on D; never recursively create through an existing junction.
    try { await mkdir(path) } catch (createError) { if (exportErrorCode(createError) !== "EEXIST") throw createError }
    file = await lstat(path, { bigint: true })
  }
  const directory = { path, identity: identity(file) }
  await assertDirectory(parent); await assertDirectory(directory)
  return directory
}
async function assertDirectory(directory: OwnedDirectory): Promise<void> {
  const current = await lstat(directory.path, { bigint: true })
  if (!current.isDirectory() || assertOutsideSystemDrive(await realpath(directory.path)) !== directory.path
    || !sameIdentity(identity(current), directory.identity)) throw journalError("EXPORT_DIRECTORY_CHANGED")
}
async function openAuditFile(path: string): Promise<{ file: FileHandle; fileIdentity: FileIdentity }> {
  let previous: BigIntStats | undefined
  try { previous = await lstat(path, { bigint: true }); assertAuditFile(previous) } catch (error) {
    if (exportErrorCode(error) !== "ENOENT") throw error
  }
  let file: FileHandle
  try { file = await open(path, previous ? constants.O_WRONLY | constants.O_APPEND : "ax", 0o600) } catch (error) {
    if (previous || exportErrorCode(error) !== "EEXIST") throw error
    // Concurrent export audits may create the same regular log; verify it before opening.
    previous = await lstat(path, { bigint: true }); assertAuditFile(previous)
    file = await open(path, constants.O_WRONLY | constants.O_APPEND)
  }
  try {
    const current = await file.stat({ bigint: true }); assertAuditFile(current)
    const fileIdentity = identity(current)
    if (previous && !sameIdentity(identity(previous), fileIdentity)) throw journalError("EXPORT_AUDIT_FILE_CHANGED")
    return { file, fileIdentity }
  } catch (error) { await file.close(); throw error }
}
function assertAuditFile(file: BigIntStats): void {
  if (!file.isFile() || file.nlink !== 1n) throw journalError("EXPORT_AUDIT_FILE_INVALID")
}

function identity(file: BigIntStats): FileIdentity {
  return identitySchema.parse({ dev: file.dev.toString(), ino: file.ino.toString(), birthtimeNs: file.birthtimeNs.toString() })
}
function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.birthtimeNs === right.birthtimeNs
}
function assertRecordRoot(record: PartRecord, location: { dataRoot: string; dataRootIdentity: FileIdentity }): void {
  if (record.dataRoot !== location.dataRoot || !sameIdentity(record.dataRootIdentity, location.dataRootIdentity)) {
    throw journalError("EXPORT_DATA_ROOT_CHANGED")
  }
}
function aad(operationId: string): Buffer { return Buffer.from(`BMD_MAIN_EXPORT_JOURNAL_V1\0${operationId}`) }
function base64(value: string, bytes?: number): Buffer {
  const result = Buffer.from(value, "base64")
  if (!result.length || result.toString("base64") !== value || (bytes !== undefined && result.length !== bytes)) {
    throw journalError("EXPORT_JOURNAL_INVALID")
  }
  return result
}
function journalError(code: string): Error { return Object.assign(new Error("导出临时文件所有权校验失败。"), { code }) }
export function exportErrorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    && /^[A-Z_]+$/u.test(error.code) ? error.code : "UNKNOWN"
}
