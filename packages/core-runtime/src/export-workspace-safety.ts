import { constants, type BigIntStats } from "node:fs"
import { lstat, mkdir, open, realpath } from "node:fs/promises"
import { join, parse, relative } from "node:path"
import { z } from "zod"

export interface FileIdentity { dev: string; ino: string; birthtimeNs: string }
export const FileIdentitySchema = z.object({
  dev: z.string().regex(/^\d+$/u), ino: z.string().regex(/^[1-9]\d*$/u),
  birthtimeNs: z.string().regex(/^[1-9]\d*$/u)
}).strict()
export class UnsafeWorkspace extends Error {
  constructor(readonly reason: string) { super("EXPORT_WORKSPACE_UNSAFE") }
}

// The fixed audit file stays outside workspaces. Append through a verified FD,
// without following links or creating an existing pathname that disappeared.
export async function appendWorkspaceRecoveryAudit(root: string, owner: { rootIdentity: FileIdentity; jobId: string }, attemptId: string, outcome: "attempted" | "removed", details: { fileName: string; event: string; category?: string; kind?: string }): Promise<void> {
  try {
    if (!sameIdentity(identity(await inspectRoot(root)), owner.rootIdentity)) throw new UnsafeWorkspace("OWNER_IDENTITY_MISMATCH")
    const path = join(root, details.fileName)
    let prior: BigIntStats | undefined
    try { prior = await lstat(path, { bigint: true }) } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error
    }
    if (prior && (!prior.isFile() || prior.isSymbolicLink() || prior.nlink !== 1n)) throw new UnsafeWorkspace("AUDIT_FILE_UNSAFE")
    const handle = await open(path, prior ? constants.O_WRONLY | constants.O_APPEND : "ax")
    try {
      const stats = await handle.stat({ bigint: true })
      const fileIdentity = identity(stats)
      if (!stats.isFile() || stats.nlink !== 1n || (prior && !sameIdentity(identity(prior), fileIdentity))) {
        throw new UnsafeWorkspace("AUDIT_FILE_UNSAFE")
      }
      const verifyAudit = async () => {
        const current = await lstat(path, { bigint: true })
        if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1n
          || !sameIdentity(identity(current), fileIdentity)
          || !sameIdentity(identity(await inspectRoot(root)), owner.rootIdentity)) throw new UnsafeWorkspace("AUDIT_FILE_UNSAFE")
      }
      await verifyAudit()
      await handle.writeFile(`${JSON.stringify({
        event: details.event, jobId: owner.jobId, ...(details.kind ? { kind: details.kind } : {}),
        ...(details.category ? { category: details.category } : {}),
        at: new Date().toISOString(), attemptId, outcome
      })}\n`, "utf8")
      await handle.sync()
      await verifyAudit()
    } finally { await handle.close() }
  } catch (error) {
    throw error instanceof UnsafeWorkspace ? error : new UnsafeWorkspace("AUDIT_WRITE_UNCONFIRMED")
  }
}

export async function inspectRoot(root: string, create = false): Promise<BigIntStats> {
  if (!/^D:\\/iu.test(root)) throw new UnsafeWorkspace("ROOT_NOT_D_DRIVE")
  const drive = parse(root).root
  await inspectDirectory(drive)
  let current = drive
  for (const component of relative(drive, root).split(/[\\/]/u)) {
    if (!component) continue
    current = join(current, component)
    try { await inspectDirectory(current) } catch (error) {
      if (!create || errorCode(error) !== "ENOENT") throw error
      // Check each existing ancestor before creating a missing component.
      try { await mkdir(current) } catch (mkdirError) {
        if (errorCode(mkdirError) !== "EEXIST") throw mkdirError
      }
      await inspectDirectory(current)
    }
  }
  if ((await realpath(root)).toLowerCase() !== root.toLowerCase()) throw new UnsafeWorkspace("ROOT_NOT_CANONICAL")
  return inspectDirectory(root)
}

export async function inspectDirectory(path: string): Promise<BigIntStats> {
  const stats = await lstat(path, { bigint: true })
  if (!stats.isDirectory() || stats.isSymbolicLink()
    || (await realpath(path)).toLowerCase() !== path.toLowerCase()) throw new UnsafeWorkspace("NON_REGULAR_DIRECTORY")
  return stats
}

export async function readOwnerMarker(path: string): Promise<{ value: unknown; markerIdentity: FileIdentity }> {
  const markerPath = join(path, "owner.json")
  const assertMarker = (stats: BigIntStats) => {
    if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1n || stats.size > 4096n) {
      throw new UnsafeWorkspace("OWNER_MARKER_INVALID")
    }
  }
  const stats = await lstat(markerPath, { bigint: true })
  assertMarker(stats)
  const markerIdentity = identity(stats)
  const handle = await open(markerPath, "r")
  try {
    const verify = async () => {
      const fdStats = await handle.stat({ bigint: true })
      const pathStats = await lstat(markerPath, { bigint: true })
      assertMarker(fdStats); assertMarker(pathStats)
      if (!sameIdentity(identity(fdStats), markerIdentity) || !sameIdentity(identity(pathStats), markerIdentity)) {
        throw new UnsafeWorkspace("OWNER_MARKER_CHANGED")
      }
    }
    await verify()
    const buffer = Buffer.alloc(4097)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length > 4096) throw new UnsafeWorkspace("OWNER_MARKER_INVALID")
    await verify()
    return { value: JSON.parse(buffer.subarray(0, length).toString("utf8")), markerIdentity }
  } finally { await handle.close() }
}

export function identity(stats: BigIntStats): FileIdentity {
  const result = { dev: String(stats.dev), ino: String(stats.ino), birthtimeNs: String(stats.birthtimeNs) }
  if (!FileIdentitySchema.safeParse(result).success) throw new UnsafeWorkspace("FILE_IDENTITY_UNAVAILABLE")
  return result
}

export function sameIdentity(left: FileIdentity | undefined, right: FileIdentity): boolean {
  return left?.dev === right.dev && left.ino === right.ino && left.birthtimeNs === right.birthtimeNs
}

export function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined
}
