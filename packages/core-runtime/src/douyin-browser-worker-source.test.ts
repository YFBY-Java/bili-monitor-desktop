import { describe, expect, it, vi } from "vitest"

import { DouyinBrowserWorkerSource } from "./douyin-browser-worker-source"

describe("DouyinBrowserWorkerSource", () => {
  it("maps Web QR lifecycle to the stdio browser worker without an HTTP server", async () => {
    const request = vi.fn(async (type: string) => {
      if (type === "douyin.web.start") return { workerSessionId: "worker-1", status: "STARTING", expiresAt: "2026-08-30T01:03:00.000Z" }
      if (type === "douyin.web.qr") return { imageBase64: "aW1hZ2U=", contentType: "image/png" }
      if (type === "douyin.web.status") return { status: "WAITING", message: "scan" }
      return { status: "UP" }
    })
    const source = new DouyinBrowserWorkerSource({ request, stop: vi.fn() })

    await expect(source.start(180)).resolves.toMatchObject({ workerSessionId: "worker-1" })
    await expect(source.qr("worker-1")).resolves.toBe("data:image/png;base64,aW1hZ2U=")
    await expect(source.status("worker-1")).resolves.toMatchObject({ status: "WAITING" })
    expect(request).toHaveBeenCalledWith("douyin.web.start", { expiresInSeconds: 180 })
  })
})
