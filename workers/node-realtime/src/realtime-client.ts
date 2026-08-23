import WebSocket from "ws"

import { nextReconnectDelay } from "./reconnect-policy"

export interface RealtimeClientOptions {
  url: string
  onMessage: (payload: Buffer) => Promise<void>
  signal: AbortSignal
}

export async function runRealtimeClient(options: RealtimeClientOptions): Promise<void> {
  let attempt = 0
  while (!options.signal.aborted) {
    try {
      await runConnection(options)
      attempt = 0
    } catch (error) {
      if (options.signal.aborted) return
      await new Promise<void>((resolve) => setTimeout(resolve, nextReconnectDelay(attempt++)))
      if (error instanceof Error && error.name === "AbortError") return
    }
  }
}

function runConnection(options: RealtimeClientOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(options.url)
    const abort = (): void => socket.close(1000, "worker stopped")
    options.signal.addEventListener("abort", abort, { once: true })
    socket.on("message", (data) => {
      const payload = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
      void options.onMessage(payload).catch(reject)
    })
    socket.once("close", () => {
      options.signal.removeEventListener("abort", abort)
      resolve()
    })
    socket.once("error", reject)
  })
}
