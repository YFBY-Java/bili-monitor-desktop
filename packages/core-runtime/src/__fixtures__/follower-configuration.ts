import { randomBytes } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { BilibiliFollowerFetchRequest, BilibiliFollowerFetchedSnapshot } from "@bmd/contracts"
import { vi } from "vitest"
import { LocalCoreRuntime } from "../local-core-runtime"
import { SyntheticAuthSource } from "./auth-migration"
import { liveLifecycleSource } from "./live-lifecycle"
import { SyntheticRealtimeSource } from "./login-connections"

// Only platform boundaries are synthetic; configuration, services, scheduling and SQLite are real.
export async function followerConfigurationFixture(configuration: unknown = {}, subject: unknown = {}) {
  for (const name of Object.keys(process.env)) {
    if (name.startsWith("APP_BILIBILI_FOLLOWERMONITOR_") || name.startsWith("SOCIAL_MONITOR_BILIBILI_FOLLOWER_")
      || name === "SOCIAL_MONITOR_BILIBILI_REQUEST_MIN_INTERVAL_MS" || name === "APP_SUBJECTMONITOR_ENABLED"
      || name.startsWith("SOCIAL_MONITOR_BILIBILI_LIVE_")) vi.stubEnv(name, undefined)
  }
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-configuration-"))
  await mkdir(resolve(directory, "config"))
  const path = resolve(directory, "config/bilibili-follower-collection.json")
  const subjectPath = resolve(directory, "config/subject-monitor.json")
  await writeFile(path, JSON.stringify(configuration), "utf8")
  await writeFile(subjectPath, JSON.stringify(subject), "utf8")
  await writeFile(resolve(directory, "config/bilibili-live-collection.json"), '{"enabled":false,"requestMinIntervalMs":0}', "utf8")
  const calls: Array<{ request: BilibiliFollowerFetchRequest; endpoint: string; at: number }> = []
  const state = { count: 100, stops: 0, failure: undefined as Error | undefined,
    before: async (): Promise<void> => {} }
  async function fetch(request: BilibiliFollowerFetchRequest, endpoint: "x/web-interface/card" | "x/relation/stat"): Promise<BilibiliFollowerFetchedSnapshot> {
    calls.push({ request, endpoint, at: Date.now() })
    await state.before()
    if (state.failure) throw state.failure
    return { mid: request.mid, nickname: `合成配置昵称${request.mid}`, profileUrl: `https://space.bilibili.com/${request.mid}`,
      followerCount: state.count, followingCount: 2, fetchedAt: new Date().toISOString(), sourceEndpoint: endpoint,
      statusCode: 200, durationMs: 1, evidenceObject: { objectId: `sha256:${"a".repeat(64)}`,
        sha256: "a".repeat(64), relativePath: "cas/synthetic-follower-configuration.json", sizeBytes: 2, mediaType: "application/json" } }
  }
  const live = liveLifecycleSource(), realtime = new SyntheticRealtimeSource(), auth = new SyntheticAuthSource()
  const options = { dataDirectory: directory, version: "test", credentialKey: randomBytes(32),
    followerSource: { fetchCard: (request: BilibiliFollowerFetchRequest) => fetch(request, "x/web-interface/card"),
      fetchProfile: async (request: BilibiliFollowerFetchRequest) => {
        const snapshot = await fetch(request, "x/web-interface/card")
        return { mid: snapshot.mid, nickname: snapshot.nickname! }
      },
      fetchRelationStat: (request: BilibiliFollowerFetchRequest) => fetch(request, "x/relation/stat"),
      stop: async () => { state.stops++ } },
    liveSource: live.source, liveDanmakuSource: realtime, authSource: auth,
    liveRankSource: { fetch: async (): Promise<never> => { throw new Error("Unexpected synthetic rank request") } } }
  let runtime: LocalCoreRuntime | undefined
  return { directory, path, subjectPath, calls, state, live, realtime, auth, options,
    start: async (schedulerEnabled = false) => {
      runtime = await LocalCoreRuntime.start({ ...options, schedulerEnabled })
      return runtime
    },
    stop: async () => { await runtime?.stop(); runtime = undefined },
    close: async () => { await runtime?.stop(); runtime = undefined; await rm(directory, { recursive: true, force: true }) }
  }
}

export function followerStoredRows(directory: string): Record<string, unknown[]> {
  const database = new DatabaseSync(resolve(directory, "control.db"), { readOnly: true })
  try {
    const result: Record<string, unknown[]> = {}
    for (const { name } of database.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()) {
      if (typeof name !== "string" || (name !== "object_artifact"
        && !/^bilibili_(follower_\w+|subject_\w+|monitored_subject|api_call)$/u.test(name))) continue
      result[name] = database.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()
    }
    return result
  } finally { database.close() }
}
