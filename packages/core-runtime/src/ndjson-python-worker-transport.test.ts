import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import * as coreRuntime from "./index"
import {
  DEFAULT_PYTHON_WORKER_REQUEST_TIMEOUT_MS,
  pythonWorkerArguments
} from "./ndjson-python-worker-transport"

describe("NdjsonPythonWorkerTransport", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
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
    const testDirectory = await mkdtemp(resolve(tmpdir(), "bmd-python-transport-"))
    directory = testDirectory
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
})
