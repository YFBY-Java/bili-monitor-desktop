import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { ControlDatabase } from "@bmd/storage"
import { expect, it, vi } from "vitest"
import { BilibiliLiveMonitorService } from "./bilibili-live-service"
import { BilibiliLiveWorkerSource } from "./bilibili-live-worker-source"
import { NdjsonPythonWorkerTransport } from "./ndjson-python-worker-transport"

it("stops real Python HTTP in flight without late Core writes or a surviving Worker", async () => {
  const pythonExecutable = process.env.BMD_PYTHON_EXE
  if (!pythonExecutable) throw new Error("Activate the D-drive project environment before testing")
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-live-python-stop-"))
  const database = await ControlDatabase.open(directory)
  const transport = new NdjsonPythonWorkerTransport({ pythonExecutable, role: "crawler", dataDirectory: directory,
    pythonPath: resolve(process.cwd(), "../../workers/python/tests/fixtures/live_pending"), requestTimeoutMs: 10_000 })
  const ids: string[] = []
  const service = new BilibiliLiveMonitorService({ database, source: new BilibiliLiveWorkerSource(transport),
    now: () => new Date(), idFactory: () => { const id = randomUUID(); ids.push(id); return id }, requestMinIntervalMs: 0 })
  try {
    const pending = service.addRoom({ uid: "903" }).catch((error: unknown) => error)
    let pid: number | undefined
    await vi.waitFor(async () => {
      const marker: { pid: number; endpoint: string } = JSON.parse(
        await readFile(resolve(directory, "synthetic-live-pending.json"), "utf8"))
      expect(marker.endpoint).toBe("/room/v1/Room/get_status_info_by_uids")
      expect(marker.pid).toBeGreaterThan(0)
      pid = marker.pid
    }, { timeout: 5000, interval: 20 })
    if (pid === undefined) throw new Error("The real Worker did not publish its request PID")
    const workerPid = pid
    expect(() => process.kill(workerPid, 0)).not.toThrow()
    await service.stop()
    expect(await pending).toMatchObject({ code: "CORE_STOPPED" })
    expect(() => process.kill(workerPid, 0)).toThrow()
    expect(database.listBilibiliLiveRooms()).toEqual([])
    expect(database.listBilibiliApiCalls(ids[0]!)).toEqual([])
    expect(database.listBilibiliLiveStatusEvents(20)).toEqual([])
    await expect(service.addRoom({ uid: "903" })).rejects.toMatchObject({ code: "CORE_STOPPED" })
    expect(() => process.kill(workerPid, 0)).toThrow()
  } finally {
    await service.stop()
    database.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)
