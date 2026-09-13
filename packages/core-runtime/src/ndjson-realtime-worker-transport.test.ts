import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import { BilibiliLiveDanmakuWorkerSource } from "./bilibili-live-danmaku-worker-source"
import { NdjsonRealtimeWorkerTransport } from "./ndjson-realtime-worker-transport"

it.each(["realtime-pending-worker.ts", "realtime-unresponsive-worker.ts"])("settles starts and terminates %s without waiting for control replies or restarting", async worker => {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-realtime-stop-"))
  const transport = new NdjsonRealtimeWorkerTransport({ nodeExecutable: process.execPath,
    workerEntry: fileURLToPath(new URL(`./__fixtures__/${worker}`, import.meta.url)), dataDirectory: directory, requestTimeoutMs: 2000 })
  const source = new BilibiliLiveDanmakuWorkerSource(transport)
  let markReady = () => {}, result: unknown, workerPid = 0
  const ready = new Promise<void>(resolveReady => { markReady = resolveReady })
  const starting = source.start({ connectionId: "synthetic-pending", roomId: "901" }, event => {
    if (event.type === "heartbeat") workerPid = event.popularity
    markReady()
  })
    .then(value => { result = value }, error => { result = error })
  try {
    await ready
    expect(workerPid).toBeGreaterThan(0)
    expect(() => process.kill(workerPid, 0)).not.toThrow()
    await source.stopAll()
    expect(result).toMatchObject({ code: "REALTIME_WORKER_STOPPED" })
    let exitError: unknown
    try { process.kill(workerPid, 0) } catch (error) { exitError = error }
    expect(exitError).toMatchObject({ code: "ESRCH" })
    await expect(transport.request("stop", { connectionId: "synthetic-pending" })).rejects.toMatchObject({ code: "REALTIME_WORKER_STOPPED" })
  } finally {
    await transport.stop()
    await starting
    await rm(directory, { recursive: true, force: true })
  }
})
