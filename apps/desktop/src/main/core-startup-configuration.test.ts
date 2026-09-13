import { randomBytes } from "node:crypto"
import { EventEmitter } from "node:events"
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"
import { build } from "vite"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { LocalCoreController } from "./core-client"

const shell = vi.hoisted(() => ({ fork: vi.fn() }))
vi.mock("electron", () => ({ utilityProcess: { fork: shell.fork } }))

class IsolatedCoreProcess extends EventEmitter {
  pid: number | undefined
  stderr = new EventEmitter()
  constructor(readonly worker: Worker) {
    super()
    worker.on("online", () => { this.pid = worker.threadId; this.emit("spawn") })
    worker.on("message", message => this.emit("message", message))
    worker.stderr.on("data", chunk => this.stderr.emit("data", chunk))
    worker.on("error", error => this.stderr.emit("data", error instanceof Error ? error.stack ?? error.message : String(error)))
    worker.on("exit", code => { this.pid = undefined; this.emit("exit", code) })
  }
  postMessage(value: unknown) { this.worker.postMessage(value) }
  kill() { void this.worker.terminate() }
}

describe("live configuration failure across Core entry and desktop host", () => {
  let buildDirectory: string
  let directory: string
  let core: LocalCoreController | undefined
  const workers: Worker[] = []
  beforeAll(async () => {
    buildDirectory = await mkdtemp(resolve(tmpdir(), "bmd-core-config-entry-"))
    await build({ configFile: false, logLevel: "silent", ssr: { noExternal: true }, build: {
      ssr: fileURLToPath(new URL("./__fixtures__/core-process-worker.ts", import.meta.url)),
      outDir: buildDirectory, emptyOutDir: false, target: "node24",
      rollupOptions: { output: { entryFileNames: "core-worker.mjs", chunkFileNames: "[name]-[hash].mjs" } }
    } })
    shell.fork.mockImplementation((_entry: string, _args: string[], options: { env: NodeJS.ProcessEnv }) => {
      const worker = new Worker(resolve(buildDirectory, "core-worker.mjs"), { env: options.env, stderr: true })
      workers.push(worker)
      return new IsolatedCoreProcess(worker)
    })
  }, 30_000)
  afterEach(async () => {
    await core?.stop(); core = undefined
    for (const worker of workers.splice(0)) await worker.terminate()
    if (directory) await rm(directory, { recursive: true, force: true })
  })
  afterAll(async () => { if (buildDirectory) await rm(buildDirectory, { recursive: true, force: true }) })

  async function setup(contents: string) {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-core-config-host-"))
    await mkdir(resolve(directory, "config"))
    const path = resolve(directory, "config", "bilibili-live-collection.json")
    await writeFile(path, contents, "utf8")
    core = new LocalCoreController({ entryPath: "test-only-worker-entry", dataDirectory: directory,
      credentialKeyBase64: randomBytes(32).toString("base64"), douyinOAuth: { mode: "disabled" },
      startupTimeoutMs: 10_000, requestTimeoutMs: 10_000 })
    return { controller: core, path }
  }
  it("returns only a stable actionable config error and can recover after correcting the file", async () => {
    const f = await setup('{"unknown":"synthetic-private-configuration"}')
    const error = await f.controller.start().then(() => undefined, (caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/^BILIBILI_LIVE_CONFIG_INVALID: /)
    expect((error as Error).message).not.toMatch(/synthetic-private|core-process|\.mjs|\n|D:\\/u)
    expect(f.controller.isRunning()).toBe(false)
    await expect(access(resolve(directory, "control.db"))).rejects.toMatchObject({ code: "ENOENT" })
    await writeFile(f.path, '{"enabled":false}', "utf8")
    const recovered = await f.controller.start()
    expect(recovered.coreStatus).toMatchObject({ state: "ready", databaseReady: true })
  }, 30_000)
})
