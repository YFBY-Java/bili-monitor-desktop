import { mkdtemp, readFile, rm } from "node:fs/promises"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { expect, it, vi } from "vitest"
import { PlatformAdapterListSchema, PlatformCollectionExecutionSchema, RunPlatformCollectionInputSchema } from "@bmd/contracts"

import { BilibiliFollowerWorkerSource } from "./bilibili-follower-worker-source"
import { LocalCoreRuntime } from "./local-core-runtime"
import { BilibiliWorkerError, NdjsonPythonWorkerTransport } from "./ndjson-python-worker-transport"

it("runs the original account adapter once with exact IDs and preserves failures and unsupported declarations", async () => {
  const fixture: { adapterList: unknown; input: unknown; execution: unknown } = JSON.parse(
    await readFile(new URL("../../contracts/fixtures/platform-collection.json", import.meta.url), "utf8"))
  const adapterList = PlatformAdapterListSchema.parse(fixture.adapterList)
  const input = RunPlatformCollectionInputSchema.parse(fixture.input)
  const execution = PlatformCollectionExecutionSchema.parse(fixture.execution)
  expect(RunPlatformCollectionInputSchema.safeParse({ ...input, externalId: "\u3000" }).success).toBe(false)
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-platform-collection-"))
  expect(directory.toLowerCase()).toMatch(/^d:/)
  const mid = "9007199254740993"
  const evidenceObject = { objectId: `sha256:${"a".repeat(64)}`, relativePath: "objects/aa/card.json",
    sha256: "a".repeat(64), sizeBytes: 20, mediaType: "application/json" }
  let failed = false
  const transport = {
    request: vi.fn(async () => {
      if (failed) throw new BilibiliWorkerError("BILIBILI_AUTH_EXPIRED", "登录失效", false)
      return { mid, nickname: " 采集账号 ", profileUrl: `https://space.bilibili.com/${mid}`,
        followerCount: "9007199254740995", fetchedAt: "2026-10-06T01:00:00.000Z",
        sourceEndpoint: "x/web-interface/card", evidenceObject, statusCode: 200, durationMs: 10 }
    }),
    stop: vi.fn(async () => undefined)
  }
  const runtime = await LocalCoreRuntime.start({ dataDirectory: directory, version: "0.2.0",
    followerSource: new BilibiliFollowerWorkerSource(transport), schedulerEnabled: false,
    credentialKey: new Uint8Array(32).fill(1) })
  try {
    expect(typeof runtime.listPlatformAdapters).toBe("function")
    expect(runtime.listPlatformAdapters()).toEqual(adapterList)

    const success = await runtime.runPlatformCollection(input)
    expect(success).toEqual(execution)
    expect(transport.request).toHaveBeenCalledWith("bilibili.platform.fetch-account.v1",
      expect.objectContaining({ mid, attempt: 1, taskId: expect.any(String), leaseId: expect.any(String) }))
    expect(runtime.listBilibiliFollowerMonitorsV2().total).toBe(0)

    failed = true
    const failure = await runtime.runPlatformCollection({ platformCode: "bilibili", dataType: "account", externalId: mid })
    expect(failure).toMatchObject({ status: "MANUAL_REVIEW", fetchResult: { success: false, data: null,
      errorType: "AUTH_EXPIRED", retryable: false, riskLevel: "LOW", rateLimitInfo: { policyKey: "failure" } } })
    expect.soft(failure.fetchResult.message).toBe("登录失效")

    const unsupported = await runtime.runPlatformCollection({ platformCode: "bilibili", dataType: "danmaku", externalId: mid })
    expect(unsupported).toMatchObject({ status: "MANUAL_REVIEW", fetchResult: { success: false, data: null,
      errorType: "UNSUPPORTED", retryable: false, riskLevel: "LOW", rateLimitInfo: { policyKey: "unsupported" } } })
    expect(transport.request).toHaveBeenCalledTimes(2)

    const internalError = new Error("synthetic internal failure, not a platform result")
    transport.request.mockRejectedValueOnce(internalError)
    await expect.soft(runtime.runPlatformCollection(input)).rejects.toMatchObject({
      code: "INTERNAL_ERROR", message: "INTERNAL_ERROR: 本地平台采集发生内部错误。", cause: internalError
    })

    // Only HTTPS I/O is replayed; use the existing actual Python parser/runtime
    // to verify that a platform failure and an internal converter are distinct.
    const workerDirectory = await mkdtemp(resolve(tmpdir(), "bmd-platform-worker-errors-"))
    expect(workerDirectory.toLowerCase()).toMatch(/^d:/)
    let workerRuntime: LocalCoreRuntime | undefined
    try {
      const workerTransport = new NdjsonPythonWorkerTransport({
        pythonExecutable: process.env.BMD_PYTHON_EXE!,
        pythonPath: resolve(process.cwd(), "../../workers/python/tests/fixtures/follower_error_response"),
        dataDirectory: workerDirectory, role: "crawler"
      })
      const workerSource = new BilibiliFollowerWorkerSource(workerTransport)
      const requestSpy = vi.spyOn(workerTransport, "request")
      workerRuntime = await LocalCoreRuntime.start({ dataDirectory: workerDirectory, version: "0.2.0",
        followerSource: workerSource, schedulerEnabled: false, credentialKey: new Uint8Array(32).fill(1) })
      const run = (externalId: string) => workerRuntime!.runPlatformCollection({
        platformCode: "bilibili", dataType: "account", externalId
      })
      const riskFailure = await run("50")
      expect.soft(riskFailure).toMatchObject({ status: "MANUAL_REVIEW", fetchResult: {
        errorType: "RISK_CONTROL", message: "  合成风控  ", retryable: false, riskLevel: "HIGH"
      } })
      const readFailureEvidence = async (result: typeof riskFailure, expectedBody: object) => {
        const ref = result.fetchResult.rawPayloadObject
        expect.soft(ref).not.toBeNull()
        expect(result.fetchResult.rawPayload).toBeNull()
        if (ref) {
          const bytes = await readFile(resolve(workerDirectory, ref.relativePath))
          expect(ref.sha256).toBe(createHash("sha256").update(bytes).digest("hex"))
          expect(ref.sizeBytes).toBe(bytes.length)
          expect(JSON.parse(bytes.toString("utf8"))).toEqual(expectedBody)
        }
      }
      await readFailureEvidence(riskFailure, { code: " -352 ", message: "  合成风控  " })
      expect((await run("4")).status).toBe("SUCCESS")
      await expect.soft(run("4")).rejects.toMatchObject({ code: "INTERNAL_ERROR",
        cause: { code: "BILIBILI_RESPONSE_CONVERSION_ERROR" } })
      await expect.soft(run("4")).rejects.toMatchObject({ code: "INTERNAL_ERROR",
        cause: { code: "BILIBILI_RESPONSE_CONVERSION_ERROR" } })
      const httpFailure = await run("4")
      expect.soft(httpFailure).toMatchObject({ status: "MANUAL_REVIEW", fetchResult: {
        errorType: "SERVER_ERROR", message: "Bilibili HTTP 503 from x/web-interface/card",
        retryable: true, riskLevel: "MEDIUM"
      } })
      await readFailureEvidence(httpFailure, { code: 0 })
      expect((await run("2")).status).toBe("SUCCESS")
      const apiFailure = await run("2")
      expect.soft(apiFailure).toMatchObject({ status: "MANUAL_REVIEW", fetchResult: {
        errorType: "UNKNOWN", message: "  合成API错误  ", retryable: true, riskLevel: "LOW"
      } })
      await readFailureEvidence(apiFailure, { code: "500", message: "  合成API错误  " })
      expect(requestSpy).toHaveBeenCalledTimes(7)
      expect(requestSpy.mock.calls.every(([type, request]) => type === "bilibili.platform.fetch-account.v1"
        && typeof request === "object" && request !== null && "attempt" in request && request.attempt === 1)).toBe(true)
      expect(requestSpy.mock.calls.every(([, request]) => typeof request === "object" && request !== null
        && "captureFailureEvidence" in request && request.captureFailureEvidence === true)).toBe(true)
      expect(workerRuntime.listBilibiliFollowerMonitorsV2().total).toBe(0)
      const inputCases: { inputs: Array<{ externalId: string; mid: string | null }> } = JSON.parse(
        await readFile(new URL("../../contracts/fixtures/platform-account-inputs.json", import.meta.url), "utf8"))
      for (const item of inputCases.inputs) {
        const beforeCalls = requestSpy.mock.calls.length
        const result = await run(item.externalId)
        if (item.mid === null) {
          expect(result).toMatchObject({ status: "MANUAL_REVIEW", fetchResult: {
            errorType: "PARSE_ERROR", message: "Bilibili mid must be numeric.", retryable: false, rawPayloadObject: null
          } })
          expect(requestSpy.mock.calls.length).toBe(beforeCalls)
        } else {
          expect.soft(result.status).toBe("SUCCESS")
          expect.soft(result.fetchResult.data?.externalAccountId).toBe(item.mid)
          expect.soft(requestSpy.mock.calls.at(-1)?.[1]).toMatchObject({ mid: item.mid, attempt: 1 })
        }
      }
      expect(workerRuntime.listBilibiliFollowerMonitorsV2().total).toBe(0)
      const optedOut = { mid: "3", taskId: "no-evidence", leaseId: "no-evidence-lease", attempt: 1 }
      await workerSource.fetchCard(optedOut)
      await workerSource.fetchCard(optedOut).then(() => { throw new Error("Expected the original auth failure") }, error => {
        expect(error).toBeInstanceOf(BilibiliWorkerError)
        expect(error).toMatchObject({ code: "BILIBILI_AUTH_EXPIRED" })
        expect(error).not.toHaveProperty("evidenceObject", expect.any(Object))
      })
    } finally {
      await workerRuntime?.stop()
      await rm(workerDirectory, { recursive: true, force: true })
    }
  } finally {
    await runtime.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
