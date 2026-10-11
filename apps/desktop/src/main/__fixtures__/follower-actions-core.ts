import { randomBytes } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, relative, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { createRuntimeEnvelope } from "@bmd/contracts"
import { LocalCoreRuntime } from "@bmd/core-runtime"

import { dispatchBusinessRequest } from "../core-request-router"

// Test-only startup: real router/Core/SQLite, synthetic platform sources only.
export async function followerActionsCoreFixture() {
  const temporaryRoot = resolve(tmpdir())
  if (!/^D:/i.test(temporaryRoot)) throw new Error("Follower actions tests require D: TEMP")
  const directory = await mkdtemp(resolve(temporaryRoot, "bmd-follower-actions-"))
  let sequence = 0
  const credentialKey = randomBytes(32)
  const state = { now: "2026-10-06T04:00:00.000Z", count: "9223372036854775807", cardError: undefined as Error | undefined,
    beforeCard: async (): Promise<void> => {}, liveRoomEnabled: false }
  const calls: string[] = []
  const evidenceObject = { objectId: `sha256:${"a".repeat(64)}`, relativePath: "cas/synthetic-actions.json",
    sha256: "a".repeat(64), sizeBytes: 100, mediaType: "application/json" }
  const liveMetadata = () => ({ fetchedAt: state.now, statusCode: 200, durationMs: 1, evidenceObject })
  const liveSnapshot = { uid: "2", roomId: "22", liveStatus: 0 as const, uname: "合成直播资源" }
  const start = (schedulerEnabled = false) => LocalCoreRuntime.start({ dataDirectory: directory, version: "fixture",
    schedulerEnabled, credentialKey, now: () => new Date(state.now),
    idFactory: () => `018f0f39-ab5e-4cc1-862d-${String(sequence++).padStart(12, "0")}`,
    followerSource: {
      fetchCard: async ({ mid }) => {
        calls.push(mid)
        await state.beforeCard()
        if (state.cardError) throw state.cardError
        return { mid, nickname: `合成用户${mid}`, profileUrl: `https://space.bilibili.com/${mid}`,
          followerCount: state.count, followingCount: "-9223372036854775808", fetchedAt: state.now,
          sourceEndpoint: "x/web-interface/card", evidenceObject, statusCode: 200, durationMs: 1 }
      },
      fetchRelationStat: async () => { throw new Error("Unexpected synthetic fallback") }
    },
    liveSource: {
      fetchStatusByUids: async () => ({ ...liveMetadata(), snapshots: [], sourceEndpoint: "room/v1/Room/get_status_info_by_uids" }),
      fetchRoomInfoOld: async () => ({ ...liveMetadata(), sourceEndpoint: "room/v1/Room/getRoomInfoOld", ...(state.liveRoomEnabled ? { snapshot: liveSnapshot } : {}) }),
      fetchRoomInfo: async () => { if (!state.liveRoomEnabled) throw new Error("Unexpected synthetic live details"); return { ...liveSnapshot, ...liveMetadata(), sourceEndpoint: "room/v1/Room/get_info" } },
      fetchRoomInit: async () => { if (!state.liveRoomEnabled) throw new Error("Unexpected synthetic live init"); return { ...liveSnapshot, ...liveMetadata(), sourceEndpoint: "room/v1/Room/room_init" } }
    }
  })
  let runtime = await start()
  return {
    directory, state, calls,
    get runtime() { return runtime },
    dispatch: (type: string, payload: unknown) => dispatchBusinessRequest(runtime, createRuntimeEnvelope({
      id: "synthetic-actions", type, timestamp: state.now, correlationId: "synthetic-actions", traceId: "synthetic-actions", payload })),
    inspect: <T>(read: (database: DatabaseSync) => T): T => {
      const inspection = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
      try { return read(inspection) } finally { inspection.close() }
    },
    restart: async (schedulerEnabled = false) => { await runtime.stop(); runtime = await start(schedulerEnabled) },
    close: async () => {
      await runtime.stop()
      const target = resolve(directory)
      const child = relative(temporaryRoot, target)
      if (!/^D:/i.test(target) || isAbsolute(child) || child.startsWith("..") || !child.startsWith("bmd-follower-actions-")) {
        throw new Error("Refusing to remove a path outside the isolated follower actions TEMP directory")
      }
      await rm(target, { recursive: true, force: true })
    }
  }
}
