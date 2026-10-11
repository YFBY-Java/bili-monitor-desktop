import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, relative, resolve } from "node:path"
import { ControlDatabase } from "@bmd/storage"
import { vi } from "vitest"
import { followerConfigurationFixture } from "./follower-configuration"
import { seedLoginRoom } from "./login-connections"

export function assertDanmakuTempPath(target = tmpdir(), child = false): void {
  const root = resolve(tmpdir()), path = resolve(target), suffix = relative(root, path)
  if (!isAbsolute(target) || !/^D:/iu.test(path)
    || (child && (!suffix || suffix.startsWith("..") || isAbsolute(suffix)))) {
    throw new Error("Unsafe danmaku temporary path")
  }
}

export async function danmakuConfigurationFixture(configuration: unknown = {}) {
  assertDanmakuTempPath()
  for (const name of Object.keys(process.env)) {
    if (name.startsWith("APP_BILIBILI_LIVEMONITOR_") || name.startsWith("SOCIAL_MONITOR_BILIBILI_LIVE_DANMAKU_")) {
      vi.stubEnv(name, undefined)
    }
  }
  const fixture = await followerConfigurationFixture({ enabled: false }, { enabled: false })
  const path = resolve(fixture.directory, "config/bilibili-live-danmaku.json")
  await writeFile(path, JSON.stringify(configuration), "utf8")
  let roomNumber = 900
  return { ...fixture, path,
    seedRoom: async ({ liveStatus }: { liveStatus: number }) => {
      const database = await ControlDatabase.open(fixture.directory)
      try { return { id: seedLoginRoom(database, String(++roomNumber), liveStatus) } }
      finally { database.close() }
    },
    start: (options: { schedulerEnabled?: boolean } = {}) => fixture.start(options.schedulerEnabled ?? false),
    close: async () => { assertDanmakuTempPath(fixture.directory, true); await fixture.close() }
  }
}
