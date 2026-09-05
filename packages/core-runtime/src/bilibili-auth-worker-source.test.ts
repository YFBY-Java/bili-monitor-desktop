import { describe, expect, it, vi } from "vitest"

import * as sourceModule from "./bilibili-auth-worker-source"

describe("BilibiliAuthWorkerSource", () => {
  it("maps generate, poll and nav validation to the isolated auth worker", async () => {
    const exported = sourceModule as unknown as Record<string, unknown>
    expect(typeof exported.BilibiliAuthWorkerSource).toBe("function")
    if (typeof exported.BilibiliAuthWorkerSource !== "function") return

    const request = vi.fn(async (type: string) => {
      if (type === "bilibili.auth.qr.generate") {
        return {
          qrUrl: "https://passport.bilibili.com/scan?qrcode_key=key",
          qrcodeKey: "key",
          cookies: []
        }
      }
      if (type === "bilibili.auth.qr.poll") {
        return { code: 86101, message: "waiting", cookies: [] }
      }
      return {
        account: { mid: "99", uname: "Alice" },
        rawPayload: { code: 0 }
      }
    })
    const stop = vi.fn(async () => undefined)
    const Source = exported.BilibiliAuthWorkerSource as new (transport: {
      request: typeof request
      stop: typeof stop
    }) => {
      generate: () => Promise<unknown>
      poll: (input: unknown) => Promise<unknown>
      validate: (input: unknown) => Promise<unknown>
      stop: () => Promise<void>
    }
    const source = new Source({ request, stop })

    await expect(source.generate()).resolves.toMatchObject({ qrcodeKey: "key" })
    await expect(source.poll({ qrcodeKey: "key", cookies: [] })).resolves.toMatchObject({ code: 86101 })
    await expect(source.validate({ cookies: [] })).resolves.toMatchObject({ account: { mid: "99" } })
    expect(request.mock.calls.map(([type]) => type)).toEqual([
      "bilibili.auth.qr.generate",
      "bilibili.auth.qr.poll",
      "bilibili.auth.validate"
    ])
    await source.stop()
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
