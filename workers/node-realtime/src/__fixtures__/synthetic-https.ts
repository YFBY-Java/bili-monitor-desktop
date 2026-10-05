import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"

// Only the external HTTPS boundary is replaced; no listening socket or platform traffic.
export const syntheticHttps = {
  respond: async (_url: URL, _headers: Record<string, string>): Promise<Response> => new Response("{}"),
  requests: [] as Array<{ url: URL; headers: Record<string, string>; destroyed: boolean }>,
  request(url: URL, options: { headers: Record<string, string> }, callback: (response: PassThrough) => void) {
    const record = { url, headers: options.headers, destroyed: false }
    syntheticHttps.requests.push(record)
    const socket = new EventEmitter()
    let incoming: PassThrough | undefined
    const req = Object.assign(new EventEmitter(), {
      end: () => {
        queueMicrotask(() => {
          if (record.destroyed) return
          req.emit("socket", socket); socket.emit("secureConnect")
          void syntheticHttps.respond(url, options.headers).then(async response => {
            const body = Buffer.from(await response.arrayBuffer())
            if (record.destroyed) return
            incoming = Object.assign(new PassThrough(), {
              statusCode: response.status, headers: Object.fromEntries(response.headers)
            })
            callback(incoming)
            socket.emit("data", body); incoming.end(body)
          }).catch(error => req.emit("error", error))
        })
      },
      destroy: () => { record.destroyed = true; incoming?.destroy(); return req }
    })
    return req
  }
}

export function danmakuHttpReply(url: URL): Response {
  const data = url.pathname.endsWith("/spi") ? { b_3: "test-buvid", b_4: "test-buvid4" }
    : url.pathname.endsWith("/nav") ? { wbi_img: {
      img_url: `https://example.test/${"a".repeat(32)}.png`,
      sub_url: `https://example.test/${"b".repeat(32)}.png`
    } } : { token: "test-token", host_list: [{ host: "example.test" }] }
  return new Response(JSON.stringify({ code: 0, data }), { status: 200 })
}
