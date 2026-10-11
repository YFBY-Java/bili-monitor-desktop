import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { lstat, mkdtemp, open, readdir, rmdir, unlink } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { z } from "zod"

import type { BilibiliLiveSessionExportCategory } from "@bmd/contracts"
import {
  appendWorkspaceRecoveryAudit, errorCode, FileIdentitySchema, identity, inspectDirectory, inspectRoot,
  readOwnerMarker, sameIdentity, UnsafeWorkspace, type FileIdentity
} from "./export-workspace-safety"

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
const DIRECTORY_NAME = new RegExp(`^prepared-(danmaku|gifts|users|all|xlsx)-(${UUID})-[A-Za-z0-9]{6}$`, "u")
const uuidSchema = z.string().regex(new RegExp(`^${UUID}$`, "u"))
const pidSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const MainContextSchema = z.object({ mainInstanceId: uuidSchema, mainPid: pidSchema }).strict()
const OwnerPayloadSchema = z.object({
  application: z.literal("bili-monitor-desktop"), version: z.literal(1), jobId: uuidSchema,
  category: z.enum(["danmaku", "gifts", "users", "all", "xlsx"]),
  mainInstanceId: uuidSchema, mainPid: pidSchema, corePid: pidSchema,
  relativeDirectory: z.string().max(128).regex(DIRECTORY_NAME),
  canonicalRoot: z.string().max(1024), canonicalWorkspace: z.string().max(1152),
  rootIdentity: FileIdentitySchema, workspaceIdentity: FileIdentitySchema
}).strict()
const SignedOwnerSchema = OwnerPayloadSchema.extend({ signature: z.string().regex(/^[0-9a-f]{64}$/u) }).strict()
type SignedOwner = z.infer<typeof SignedOwnerSchema>
export type PreparedExportMainContext = z.infer<typeof MainContextSchema>
export interface ExportPreparedWorkspace {
  root: string
  path: string
  outputPath: string
  owner: SignedOwner
  markerIdentity: FileIdentity
  outputIdentity?: FileIdentity
}

// Omitted context identifies this standalone Core itself, never an invented external Main.
export function resolvePreparedExportMainContext(context?: unknown): PreparedExportMainContext {
  return MainContextSchema.parse(context ?? { mainInstanceId: randomUUID(), mainPid: process.pid })
}

export function preparedExportMainContextFromEnvironment(environment: NodeJS.ProcessEnv): PreparedExportMainContext | undefined {
  const mainInstanceId = environment.BMD_MAIN_INSTANCE_ID
  const pid = environment.BMD_MAIN_PID
  if (mainInstanceId === undefined && pid === undefined) return undefined
  if (!pid || !/^[1-9]\d*$/u.test(pid)) throw new UnsafeWorkspace("MAIN_CONTEXT_INVALID")
  return resolvePreparedExportMainContext({ mainInstanceId, mainPid: Number(pid) })
}

export function validatePreparedExportCredentialKey(key: Uint8Array): void {
  if (key.byteLength !== 32) throw new UnsafeWorkspace("CREDENTIAL_KEY_INVALID")
}

export async function createExportPreparedWorkspace(
  rootPath: string, category: BilibiliLiveSessionExportCategory, key: Uint8Array, mainContext: PreparedExportMainContext
): Promise<ExportPreparedWorkspace> {
  validatePreparedExportCredentialKey(key)
  const main = resolvePreparedExportMainContext(mainContext)
  const root = resolve(rootPath)
  const rootIdentity = identity(await inspectRoot(root, true))
  const jobId = randomUUID()
  const path = await mkdtemp(join(root, `prepared-${category}-${jobId}-`))
  if (!sameIdentity(identity(await inspectRoot(root)), rootIdentity)) throw new UnsafeWorkspace("OWNER_IDENTITY_MISMATCH")
  const payload = OwnerPayloadSchema.parse({ application: "bili-monitor-desktop", version: 1, jobId, category,
    ...main, corePid: process.pid, relativeDirectory: basename(path), canonicalRoot: root, canonicalWorkspace: path,
    rootIdentity, workspaceIdentity: identity(await inspectDirectory(path)) })
  const owner = { ...payload, signature: sign(payload, key) }
  const marker = await open(join(path, "owner.json"), "wx", 0o600)
  let markerIdentity: FileIdentity
  try {
    const markerStats = await marker.stat({ bigint: true })
    if (!markerStats.isFile() || markerStats.nlink !== 1n) throw new UnsafeWorkspace("OWNER_MARKER_INVALID")
    markerIdentity = identity(markerStats)
    const bytes = Buffer.from(JSON.stringify(owner), "utf8")
    if (bytes.length > 4096) throw new UnsafeWorkspace("OWNER_MARKER_INVALID")
    await marker.writeFile(bytes)
    await marker.sync()
  } finally { await marker.close() }
  // Committed and verified marker precedes every fixed output member.
  const verified = (await inspectWorkspace(root, basename(path), key)).workspace
  if (!sameIdentity(markerIdentity, verified.markerIdentity) || JSON.stringify(verified.owner) !== JSON.stringify(owner)) {
    throw new UnsafeWorkspace("OWNER_MARKER_CHANGED")
  }
  return verified
}

export async function validateExportPreparedWorkspace(options: {
  rootPath: string; outputPath: string; category: BilibiliLiveSessionExportCategory;
  credentialKey: Uint8Array; mainContext: PreparedExportMainContext
  expected?: ExportPreparedWorkspace
}): Promise<ExportPreparedWorkspace> {
  const root = resolve(options.rootPath)
  const path = resolve(options.outputPath)
  const directory = dirname(path)
  if (dirname(directory) !== root || basename(path) !== outputName(options.category)) {
    throw new UnsafeWorkspace("PREPARED_PATH_INVALID")
  }
  const { workspace } = await inspectWorkspace(root, basename(directory), options.credentialKey, options.expected, true)
  const main = resolvePreparedExportMainContext(options.mainContext)
  if (workspace.owner.category !== options.category || workspace.owner.mainInstanceId !== main.mainInstanceId
    || workspace.owner.mainPid !== main.mainPid) throw new UnsafeWorkspace("MAIN_OWNER_MISMATCH")
  // Creator Core may already have exited or been replaced; Main still owns this output.
  return workspace
}

export async function cleanupExportPreparedWorkspace(workspace: ExportPreparedWorkspace, key: Uint8Array): Promise<boolean> {
  return cleanup(workspace.root, workspace.owner.relativeDirectory, key, "normal", workspace)
}

export async function recoverExportPreparedWorkspaces(rootPath: string, key: Uint8Array): Promise<void> {
  validatePreparedExportCredentialKey(key)
  const root = resolve(rootPath)
  try {
    await inspectRoot(root)
    for (const name of await readdir(root)) {
      if (DIRECTORY_NAME.test(name)) await cleanup(root, name, key, "recovery")
      else if (/^prepared-(danmaku|gifts|users|all|xlsx)-/u.test(name)) diagnostic("recovery", "OWNERSHIP_UNCONFIRMED")
    }
  } catch (error) {
    if (errorCode(error) !== "ENOENT") diagnostic("recovery", reason(error))
  }
}

async function inspectWorkspace(root: string, name: string, key: Uint8Array, expected?: ExportPreparedWorkspace, requireOutput = false) {
  if (!DIRECTORY_NAME.test(name)) throw new UnsafeWorkspace("PREPARED_PATH_INVALID")
  const path = join(root, name)
  const rootStats = await inspectRoot(root)
  const workspaceStats = await inspectDirectory(path)
  const { value, markerIdentity } = await readOwnerMarker(path)
  const owner = SignedOwnerSchema.safeParse(value).data
  if (!owner) throw new UnsafeWorkspace("OWNER_MARKER_INVALID")
  const { signature, ...payload } = owner
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(sign(payload, key), "hex"))) {
    throw new UnsafeWorkspace("OWNER_SIGNATURE_INVALID")
  }
  if (owner.relativeDirectory !== name || !name.startsWith(`prepared-${owner.category}-${owner.jobId}-`)
    || owner.canonicalRoot !== root || owner.canonicalWorkspace !== path
    || !sameIdentity(owner.rootIdentity, identity(rootStats)) || !sameIdentity(owner.workspaceIdentity, identity(workspaceStats))
    || (expected && (JSON.stringify(owner) !== JSON.stringify(expected.owner)
      || !sameIdentity(expected.markerIdentity, markerIdentity)))) throw new UnsafeWorkspace("OWNER_IDENTITY_MISMATCH")
  const output = outputName(owner.category)
  const members = new Map<string, FileIdentity>()
  for (const member of await readdir(path)) {
    if (member !== "owner.json" && member !== output) throw new UnsafeWorkspace("UNKNOWN_MEMBER")
    const stats = await lstat(join(path, member), { bigint: true })
    if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1n) throw new UnsafeWorkspace("NON_REGULAR_MEMBER")
    members.set(member, identity(stats))
  }
  if (!sameIdentity(members.get("owner.json"), markerIdentity)) throw new UnsafeWorkspace("OWNER_MARKER_CHANGED")
  const outputIdentity = members.get(output)
  if (requireOutput && !outputIdentity) throw new UnsafeWorkspace("OUTPUT_MISSING")
  if (expected?.outputIdentity && outputIdentity && !sameIdentity(expected.outputIdentity, outputIdentity)) {
    throw new UnsafeWorkspace("MEMBER_CHANGED")
  }
  const workspace: ExportPreparedWorkspace = { root, path, owner, markerIdentity, outputPath: join(path, output),
    ...(outputIdentity ? { outputIdentity } : {}) }
  return { workspace, members }
}

async function cleanup(root: string, name: string, key: Uint8Array, phase: "normal" | "recovery", expected?: ExportPreparedWorkspace): Promise<boolean> {
  let removed = false
  try {
    const { workspace, members } = await inspectWorkspace(root, name, key, expected)
    const { owner, path } = workspace
    if (phase === "recovery") {
      // Probe each owner separately. Only ESRCH for both proves abandonment.
      const mainDead = processAbsent(owner.mainPid)
      const coreDead = processAbsent(owner.corePid)
      if (!mainDead || !coreDead) throw new UnsafeWorkspace("OWNER_PROCESS_PRESENT_OR_UNCONFIRMED")
    }
    const attemptId = randomUUID()
    const audit = (outcome: "attempted" | "removed") => appendWorkspaceRecoveryAudit(root, owner, attemptId, outcome, {
      fileName: "prepared-recovery.ndjson", event: "export_prepared_workspace_recovery", category: owner.category
    })
    if (phase === "recovery") await audit("attempted")
    for (const member of [outputName(owner.category), "owner.json"]) {
      const memberIdentity = members.get(member)
      if (!memberIdentity) continue
      await verifyDirectories(workspace)
      const stats = await lstat(join(path, member), { bigint: true })
      if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1n || !sameIdentity(identity(stats), memberIdentity)) {
        throw new UnsafeWorkspace("MEMBER_CHANGED")
      }
      // Recheck the complete whitelist before the first unlink and before marker removal.
      for (const current of await readdir(path)) {
        if (current !== "owner.json" && current !== outputName(owner.category)) throw new UnsafeWorkspace("UNKNOWN_MEMBER")
      }
      await unlink(join(path, member))
    }
    await verifyDirectories(workspace)
    await rmdir(path)
    removed = true
    if (phase === "recovery") await audit("removed")
    return true
  } catch (error) {
    diagnostic(phase, reason(error), removed ? "removed_audit_unconfirmed" : "retained")
    return removed
  }
}

async function verifyDirectories(workspace: ExportPreparedWorkspace): Promise<void> {
  if (!sameIdentity(identity(await inspectRoot(workspace.root)), workspace.owner.rootIdentity)
    || !sameIdentity(identity(await inspectDirectory(workspace.path)), workspace.owner.workspaceIdentity)) {
    throw new UnsafeWorkspace("OWNER_IDENTITY_MISMATCH")
  }
}
function outputName(category: BilibiliLiveSessionExportCategory): string {
  return category === "all" ? "output.zip" : category === "xlsx" ? "output.xlsx" : "output.csv"
}
function sign(payload: z.infer<typeof OwnerPayloadSchema>, key: Uint8Array): string {
  validatePreparedExportCredentialKey(key)
  const signingKey = createHmac("sha256", key).update("BMD_PREPARED_EXPORT_KEY_V1").digest()
  return createHmac("sha256", signingKey).update("BMD_PREPARED_EXPORT_OWNER_V1\0").update(JSON.stringify(payload)).digest("hex")
}
function processAbsent(pid: number): boolean {
  try { process.kill(pid, 0); return false } catch (error) { return errorCode(error) === "ESRCH" }
}
function reason(error: unknown): string {
  if (error instanceof UnsafeWorkspace) return error.reason
  if (error instanceof SyntaxError) return "OWNER_MARKER_INVALID"
  return errorCode(error) === "ENOENT" ? "OWNER_OR_WORKSPACE_MISSING" : "IO_UNCONFIRMED"
}
function diagnostic(phase: "normal" | "recovery", reasonCode: string, outcome = "retained"): void {
  console.warn(JSON.stringify({ event: "export_prepared_workspace_cleanup", phase, outcome, reason: reasonCode }))
}
