import { describe, expect, it } from "vitest"

import {
  BootstrapResponseSchema,
  RuntimeEnvelopeSchema,
  createRuntimeEnvelope
} from "./runtime-protocol"

describe("runtime protocol", () => {
  it("creates and validates a versioned bootstrap request", () => {
    const envelope = createRuntimeEnvelope({
      id: "request-01",
      type: "core.bootstrap",
      correlationId: "correlation-01",
      traceId: "trace-01",
      timestamp: "2026-08-23T00:00:00.000Z",
      payload: {}
    })

    expect(RuntimeEnvelopeSchema.parse(envelope)).toEqual({
      id: "request-01",
      type: "core.bootstrap",
      version: 1,
      correlationId: "correlation-01",
      traceId: "trace-01",
      timestamp: "2026-08-23T00:00:00.000Z",
      payload: {}
    })
  })

  it("rejects messages without trace metadata", () => {
    expect(() =>
      RuntimeEnvelopeSchema.parse({
        id: "request-01",
        type: "core.bootstrap",
        version: 1,
        correlationId: "correlation-01",
        timestamp: "2026-08-23T00:00:00.000Z",
        payload: {}
      })
    ).toThrow()
  })

  it("validates a local Core bootstrap projection", () => {
    expect(
      BootstrapResponseSchema.parse({
        coreStatus: {
          state: "ready",
          version: "0.2.0",
          dataDirectory: "D:/bmd-data",
          databaseReady: true,
          schemaVersion: 1,
          startedAt: "2026-08-23T00:00:00.000Z"
        },
        workers: [],
        sequence: 1
      })
    ).toMatchObject({ coreStatus: { state: "ready", databaseReady: true } })
  })
})
