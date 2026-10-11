import https from "node:https"
import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { syncBuiltinESMExports } from "node:module"

// Only HTTPS is replaced. The built production NDJSON worker and cache run unchanged.
let nav = 0
let danmu = 0
https.request = (url, options, callback) => {
  let destroyed = false
  const socket = new EventEmitter()
  const req = Object.assign(new EventEmitter(), {
    destroy: () => { destroyed = true; return req },
    end: () => queueMicrotask(() => {
      if (destroyed) return
      req.emit("socket", socket)
      socket.emit("secureConnect")
      let body
      if (url.pathname.endsWith("/nav")) {
        if (options.headers["User-Agent"] === "Fixture WBI response String/1") {
          if (options.headers.Referer !== "https://www.bilibili.com/" || options.headers.Cookie) {
            req.emit("error", new Error("WBI material request must remain anonymous with homepage referer."))
            return
          }
          nav++
          const malformed = nav === 1 || nav === 4
          const incoming = Object.assign(new PassThrough(), { statusCode: malformed ? 503 : nav === 2 ? 403 : 200,
            headers: malformed ? { "content-type": "application/json;charset=not-a-real-charset" } : {} })
          callback(incoming)
          incoming.end(malformed ? "private nav header/body" : nav === 2 ? "private nav failure" : nav === 5
            ? JSON.stringify({ code: "-352", message: "private nav API text must not override the original message" }) : nav === 6
            ? "private malformed nav JSON" : Buffer.from(
            JSON.stringify({ code: `-0x65${"0".repeat(256)}p-1024`, data: { wbi_img: {
              img_url: `https://fixture.test/${"é".repeat(32)}.png`, sub_url: `https://fixture.test/${"b".repeat(32)}.png`
            } } }), "latin1"))
          return
        }
        if (options.headers["User-Agent"] === "Fixture rank configuration/2"
          && options.headers.Referer !== "https://www.bilibili.com/") {
          req.emit("error", new Error("WBI request did not retain its anonymous homepage referer."))
          return
        }
        nav++
        if (nav === 5) {
          process.stdout.write(JSON.stringify({ type: "event", connectionId: "materials-probe", event: { type: "material-wait" } }) + "\n")
          return
        }
        body = { code: -101, data: { wbi_img: {
          img_url: `https://fixture.test/${nav.toString(16).repeat(32)}.png`,
          sub_url: `https://fixture.test/${"b".repeat(32)}.png`
        } } }
      } else if (url.pathname.endsWith("/spi")) {
        body = { code: 0, data: { b_3: "synthetic-buvid" } }
      } else if (url.pathname.endsWith("getDanmuInfo")) {
        danmu++
        const cookie = options.headers.Cookie ?? ""
        const expected = danmu === 1 ? "fixture-a" : danmu === 3 ? "fixture-b" : undefined
        if (expected ? !cookie.includes(`SESSDATA=${expected}`) : cookie.includes("SESSDATA=")) {
          req.emit("error", new Error("Synthetic credential did not match the current fallback leg."))
          return
        }
        body = { code: [-101, -352, -101, -400][danmu - 1], message: "synthetic fallback" }
      } else {
        req.emit("error", new Error("Unexpected synthetic endpoint."))
        return
      }
      const incoming = Object.assign(new PassThrough(), { statusCode: 200, headers: {} })
      callback(incoming)
      incoming.end(Buffer.from(JSON.stringify(body)))
    })
  })
  return req
}
syncBuiltinESMExports()
void import("../../../../workers/node-realtime/src/process.ts")
