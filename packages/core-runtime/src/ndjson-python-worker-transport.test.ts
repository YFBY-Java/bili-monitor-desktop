import { access, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { setTimeout } from "node:timers/promises"

import { afterEach, describe, expect, it } from "vitest"

import * as coreRuntime from "./index"
import {
  DEFAULT_PYTHON_WORKER_REQUEST_TIMEOUT_MS,
  BilibiliWorkerError,
  NdjsonPythonWorkerTransport,
  pythonWorkerArguments
} from "./ndjson-python-worker-transport"

describe("NdjsonPythonWorkerTransport", () => {
  let directory: string | undefined

  async function createTestDirectory(): Promise<string> {
    const temporaryRoot = resolve(process.cwd(), "../../.tools/temp")
    expect(temporaryRoot.slice(0, 3).toLowerCase()).toBe("d:\\")
    expect(resolve(tmpdir())).toBe(temporaryRoot)
    directory = await mkdtemp(resolve(temporaryRoot, "bmd-python-transport-"))
    return directory
  }

  afterEach(async () => {
    if (directory) {
      expect(dirname(directory)).toBe(resolve(process.cwd(), "../../.tools/temp"))
      expect(directory.split(/[\\/]/).at(-1)).toMatch(/^bmd-python-transport-/)
      await rm(directory, { recursive: true, force: true })
      directory = undefined
    }
  })

  it("uses the standalone packaged worker without Python module flags", () => {
    expect(DEFAULT_PYTHON_WORKER_REQUEST_TIMEOUT_MS).toBeGreaterThan(20_000)
    expect(pythonWorkerArguments("crawler", true)).toEqual(["--role", "crawler"])
    expect(pythonWorkerArguments("auth", false)).toEqual([
      "-m",
      "bmd_workers.runtime",
      "--role",
      "auth"
    ])
  })

  it("starts the project crawler worker over stdio without a business port", async () => {
    const pythonExecutable = process.env.BMD_PYTHON_EXE
    expect(pythonExecutable).toBeTruthy()
    const testDirectory = await createTestDirectory()
    const exported = coreRuntime as unknown as Record<string, unknown>
    expect(typeof exported.NdjsonPythonWorkerTransport).toBe("function")
    const Transport = exported.NdjsonPythonWorkerTransport as new (options: Record<string, unknown>) => {
      request: (type: string, payload: unknown) => Promise<unknown>
      stop: () => Promise<void>
    }
    const transport = new Transport({
      pythonExecutable,
      pythonPath: resolve(process.cwd(), "../../workers/python/src"),
      dataDirectory: testDirectory,
      role: "crawler",
      requestTimeoutMs: 5_000
    })

    try {
      await expect(transport.request("worker.ping", {})).resolves.toEqual({
        role: "crawler",
        state: "ready"
      })
      await expect(transport.request("中文能力", {})).rejects.toThrow(
        "Unsupported crawler worker message: 中文能力"
      )
    } finally {
      await transport.stop()
    }
  }, 15_000)

  it("ignores foreign final frames until the owning Python request finishes", async () => {
    const pythonExecutable = process.env.BMD_PYTHON_EXE
    expect(pythonExecutable).toBeTruthy()
    if (!pythonExecutable) throw new Error("Project Python executable is required.")
    const testDirectory = await createTestDirectory()
    const transport = new NdjsonPythonWorkerTransport({
      pythonExecutable,
      pythonPath: resolve(process.cwd(), "../../workers/python/tests/fixtures/final_association"),
      dataDirectory: testDirectory,
      role: "crawler",
      requestTimeoutMs: 5_000
    })

    try {
      let settled = false
      const pending = transport.request("worker.ping", { holdFinal: true }).then(
        value => { settled = true; return value },
        error => { settled = true; throw error }
      )
      // Observe both settlement paths immediately, including the forged worker.error.
      const outcome = pending.then(value => ({ value }), error => ({ error }))
      await expect.poll(async () => {
        try { await access(resolve(testDirectory, "final-held")); return true }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
          throw error
        }
      }, { timeout: 3_000 }).toBe(true)
      await setTimeout(50)
      expect(settled).toBe(false)
      await writeFile(resolve(testDirectory, "release-final"), "release", "utf8")
      await expect(outcome).resolves.toEqual({ value: { role: "crawler", state: "ready" } })

      const error = await transport.request("中文能力", {}).then(() => undefined, value => value)
      expect(error).toBeInstanceOf(BilibiliWorkerError)
      expect(error).toMatchObject({
        code: "SYNTHETIC_WORKER_ERROR",
        message: "合成错误",
        retryable: true,
        endpoint: "synthetic.endpoint",
        statusCode: 503,
        biliCode: -352
      })
      await expect(transport.request("worker.ping", {})).resolves.toEqual({
        role: "crawler", state: "ready"
      })
    } finally {
      await transport.stop()
    }
  }, 15_000)
})
