import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { expect, it } from "vitest"
import { NdjsonRealtimeWorkerTransport } from "./ndjson-realtime-worker-transport"
import { buildSharedMaterialsWorker } from "./__fixtures__/build-shared-materials-worker"

it("shares built Worker materials, rereads fallback credentials and cancels without closing the shared owner", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-shared-materials-"))
  let credentialReads = 0
  const transport = new NdjsonRealtimeWorkerTransport({
    nodeExecutable: process.execPath,
    workerEntry: await buildSharedMaterialsWorker(directory),
    dataDirectory: directory,
    credentialProvider: async () => ({ cookieHeader: `SESSDATA=fixture-${++credentialReads === 1 ? "a" : "b"}`, authUid: "2" })
  })
  const payload = { forceRefresh: false, wbiCacheSeconds: 43200 }
  let pending: Promise<unknown> | undefined
  try {
    expect(await transport.request("getWbiKeys", payload)).toMatchObject({ imgKey: "1".repeat(32) })
    await expect(transport.request("start", { connectionId: "fallback", roomId: "33", protocolVersion: 1 }))
      .rejects.toMatchObject({ code: "BILIBILI_DANMAKU_CONNECT_FAILED" })
    expect(credentialReads).toBe(2)
    expect(await transport.request("getWbiKeys", payload)).toMatchObject({ imgKey: "4".repeat(32) })
    const controller = new AbortController()
    const ready = new Promise<void>(resolveReady => transport.subscribe("materials-probe", () => resolveReady()))
    pending = transport.request("getWbiKeys", { ...payload, forceRefresh: true }, { signal: controller.signal })
      .catch(error => error)
    await ready
    controller.abort()
    expect(await pending).toMatchObject({ code: "REALTIME_WORKER_STOPPED" })
    expect(await transport.request("getWbiKeys", payload)).toMatchObject({ imgKey: "4".repeat(32) })
  } finally {
    await transport.stop()
    await pending
    await rm(directory, { recursive: true, force: true })
  }
})
