import { randomUUID } from "node:crypto"
import { lstat, mkdtemp, readdir, rmdir, unlink, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { z } from "zod"
import {
  appendWorkspaceRecoveryAudit, errorCode, FileIdentitySchema, identity, inspectDirectory, inspectRoot,
  readOwnerMarker, sameIdentity, UnsafeWorkspace, type FileIdentity
} from "./export-workspace-safety"

type SnapshotKind = "zip" | "xlsx"
interface SnapshotOwner {
  application: "bili-monitor-desktop"
  version: 1
  jobId: string
  kind: SnapshotKind
  corePid: number
  relativeDirectory: string
  rootIdentity: FileIdentity
  workspaceIdentity: FileIdentity
}
export interface ExportSnapshotWorkspace { root: string; path: string; owner: SnapshotOwner }

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
const DIRECTORY_NAME = new RegExp(`^(zip|xlsx)-snapshot-(${UUID})-[A-Za-z0-9]{6}$`, "u")
const SnapshotOwnerSchema = z.object({
  application: z.literal("bili-monitor-desktop"), version: z.literal(1),
  jobId: z.string().regex(new RegExp(`^${UUID}$`, "u")), kind: z.enum(["zip", "xlsx"]),
  corePid: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  relativeDirectory: z.string().regex(DIRECTORY_NAME),
  rootIdentity: FileIdentitySchema, workspaceIdentity: FileIdentitySchema
}).strict().refine((owner) => owner.relativeDirectory.startsWith(`${owner.kind}-snapshot-${owner.jobId}-`))
const MEMBERS = {
  zip: ["manifest.json", "summary.csv", "danmaku.csv", "gifts.csv", "users.csv"],
  xlsx: ["summary.ndjson", "danmaku.ndjson", "gifts.ndjson", "users.ndjson"]
} satisfies Record<SnapshotKind, string[]>

// The marker is written before callers may write any snapshot data. A crash
// before this write leaves an unmarked directory which recovery deliberately retains.
export async function createExportSnapshotWorkspace(rootPath: string, kind: SnapshotKind): Promise<ExportSnapshotWorkspace> {
  const root = resolve(rootPath)
  await inspectRoot(root, true)
  const jobId = randomUUID()
  const path = await mkdtemp(join(root, `${kind}-snapshot-${jobId}-`))
  const owner: SnapshotOwner = {
    application: "bili-monitor-desktop", version: 1, jobId, kind, corePid: process.pid,
    relativeDirectory: basename(path), rootIdentity: identity(await inspectRoot(root)),
    workspaceIdentity: identity(await inspectDirectory(path))
  }
  await writeFile(join(path, "owner.json"), JSON.stringify(owner), { encoding: "utf8", flag: "wx" })
  return { root, path, owner }
}

export async function cleanupExportSnapshotWorkspace(workspace: ExportSnapshotWorkspace): Promise<void> {
  await cleanup(workspace.root, workspace.owner.relativeDirectory, "normal", workspace.owner)
}

// Only the current Core's exports/temp root is supplied by LocalCoreRuntime.
// Flat prepared exports may already belong to Main and are never considered here.
export async function recoverExportSnapshotWorkspaces(rootPath: string): Promise<void> {
  const root = resolve(rootPath)
  try {
    await inspectRoot(root)
    for (const name of await readdir(root)) {
      if (DIRECTORY_NAME.test(name)) await cleanup(root, name, "recovery")
      else if (/^(zip|xlsx)-snapshot-/u.test(name)) diagnostic("recovery", "OWNERSHIP_UNCONFIRMED")
    }
  } catch (error) {
    if (errorCode(error) !== "ENOENT") diagnostic("recovery", reason(error))
  }
}

async function cleanup(root: string, name: string, phase: "normal" | "recovery", expectedOwner?: SnapshotOwner): Promise<void> {
  let removed = false
  try {
    const path = join(root, name)
    const rootStats = await inspectRoot(root)
    const workspaceStats = await inspectDirectory(path)
    const { owner, markerIdentity } = await readOwner(path)
    if (owner.relativeDirectory !== name || !sameIdentity(owner.rootIdentity, identity(rootStats))
      || !sameIdentity(owner.workspaceIdentity, identity(workspaceStats))
      || (expectedOwner && JSON.stringify(owner) !== JSON.stringify(expectedOwner))) {
      throw new UnsafeWorkspace("OWNER_IDENTITY_MISMATCH")
    }
    if (phase === "recovery") {
      try {
        process.kill(owner.corePid, 0)
        throw new UnsafeWorkspace("OWNER_PROCESS_PRESENT")
      } catch (error) {
        // An existing or inaccessible process, including a reused PID, is retained.
        if (errorCode(error) !== "ESRCH") throw error instanceof UnsafeWorkspace
          ? error : new UnsafeWorkspace("OWNER_PROCESS_UNCONFIRMED")
      }
    }
    const allowed = new Set(["owner.json", ...MEMBERS[owner.kind]])
    const names = await readdir(path)
    const members = new Map<string, FileIdentity>()
    for (const member of names) {
      if (!allowed.has(member)) throw new UnsafeWorkspace("UNKNOWN_MEMBER")
      const stats = await lstat(join(path, member), { bigint: true })
      if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1n) throw new UnsafeWorkspace("NON_REGULAR_MEMBER")
      members.set(member, identity(stats))
    }
    if (!sameIdentity(members.get("owner.json"), markerIdentity)) throw new UnsafeWorkspace("OWNER_MARKER_CHANGED")
    const attemptId = randomUUID()
    if (phase === "recovery") await appendRecoveryAudit(root, owner, attemptId, "attempted")
    // Preflight completed before the first deletion. Never recurse, and remove
    // the ownership marker last so interrupted cleanup remains recoverable.
    for (const member of [...MEMBERS[owner.kind], "owner.json"]) {
      const memberIdentity = members.get(member)
      if (!memberIdentity) continue
      await verifyDirectories(root, path, owner)
      const stats = await lstat(join(path, member), { bigint: true })
      if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1n
        || !sameIdentity(identity(stats), memberIdentity)) throw new UnsafeWorkspace("MEMBER_CHANGED")
      await unlink(join(path, member))
    }
    await verifyDirectories(root, path, owner)
    await rmdir(path)
    removed = true
    if (phase === "recovery") await appendRecoveryAudit(root, owner, attemptId, "removed")
  } catch (error) {
    diagnostic(phase, reason(error), removed ? "removed_audit_unconfirmed" : "retained")
  }
}

async function verifyDirectories(root: string, path: string, owner: SnapshotOwner): Promise<void> {
  if (!sameIdentity(identity(await inspectRoot(root)), owner.rootIdentity)
    || !sameIdentity(identity(await inspectDirectory(path)), owner.workspaceIdentity)) {
    throw new UnsafeWorkspace("OWNER_IDENTITY_MISMATCH")
  }
}

async function readOwner(path: string): Promise<{ owner: SnapshotOwner; markerIdentity: FileIdentity }> {
  const { value, markerIdentity } = await readOwnerMarker(path)
  const owner = SnapshotOwnerSchema.safeParse(value).data
  if (!owner) throw new UnsafeWorkspace("OWNER_MARKER_INVALID")
  return { owner, markerIdentity }
}

async function appendRecoveryAudit(root: string, owner: SnapshotOwner, attemptId: string, outcome: "attempted" | "removed"): Promise<void> {
  await appendWorkspaceRecoveryAudit(root, owner, attemptId, outcome, {
    fileName: "snapshot-recovery.ndjson", event: "export_snapshot_workspace_recovery", kind: owner.kind
  })
}

function reason(error: unknown): string {
  if (error instanceof UnsafeWorkspace) return error.reason
  if (error instanceof SyntaxError) return "OWNER_MARKER_INVALID"
  return errorCode(error) === "ENOENT" ? "OWNER_OR_WORKSPACE_MISSING" : "IO_UNCONFIRMED"
}

function diagnostic(phase: "normal" | "recovery", reasonCode: string, outcome = "retained"): void {
  console.warn(JSON.stringify({ event: "export_snapshot_workspace_cleanup", phase, outcome, reason: reasonCode }))
}
