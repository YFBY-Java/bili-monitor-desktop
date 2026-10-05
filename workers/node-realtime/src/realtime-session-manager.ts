import { BilibiliDanmakuWorkerStartSchema, type BilibiliDanmakuWorkerStart } from "@bmd/contracts"
import { startBilibiliDanmakuConnection, type BilibiliDanmakuConnectionEvent,
  type RunningBilibiliDanmakuConnection } from "./bilibili-danmaku-connection"
import { ensureNotCancelled } from "./bilibili-http"

interface Session {
  controller: AbortController
  connection?: RunningBilibiliDanmakuConnection
}

export class RealtimeSessionManager {
  private readonly sessions = new Map<string, Session>()
  private stopped = false

  constructor(private readonly connect = startBilibiliDanmakuConnection) {}

  async start(raw: BilibiliDanmakuWorkerStart, onEvent: (event: BilibiliDanmakuConnectionEvent) => void) {
    if (this.stopped) throw Object.assign(new Error("Realtime Worker stopped."), { code: "REALTIME_WORKER_STOPPED" })
    const input = BilibiliDanmakuWorkerStartSchema.parse(raw)
    const previous = this.sessions.get(input.connectionId)
    if (!previous && this.sessions.size >= 100) {
      throw Object.assign(new Error("Realtime Worker connection limit reached."), { code: "REALTIME_WORKER_BUSY" })
    }
    previous?.controller.abort()
    const current: Session = { controller: new AbortController() }
    this.sessions.set(input.connectionId, current)
    try {
      if (previous?.connection) await previous.connection.stop()
      ensureNotCancelled(current.controller.signal)
      const connection = await this.connect({ roomId: input.roomId, signal: current.controller.signal,
        ...(input.protocolVersion === undefined ? {} : { protocolVersion: input.protocolVersion }),
        ...(input.credential ? { credential: input.credential } : {}),
        ...(input.httpConfiguration ? { httpConfiguration: input.httpConfiguration } : {}) }, event => {
        if (this.sessions.get(input.connectionId) !== current || current.controller.signal.aborted) return
        if (event.type === "closed") this.sessions.delete(input.connectionId)
        onEvent(event)
      })
      if (current.controller.signal.aborted || this.sessions.get(input.connectionId) !== current) {
        await connection.stop()
        current.controller.abort()
        ensureNotCancelled(current.controller.signal)
      }
      current.connection = connection
      return connection
    } finally {
      if (!current.connection && this.sessions.get(input.connectionId) === current) this.sessions.delete(input.connectionId)
    }
  }

  async stop(connectionId: string): Promise<void> {
    const current = this.sessions.get(connectionId)
    this.sessions.delete(connectionId)
    current?.controller.abort()
    await current?.connection?.stop()
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map(id => this.stop(id)))
  }

  async shutdown(): Promise<void> {
    this.stopped = true
    await this.stopAll()
  }
}
