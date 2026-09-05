import {
  BilibiliAuthWorkerGenerateResultSchema,
  BilibiliAuthWorkerNavResultSchema,
  BilibiliAuthWorkerPollInputSchema,
  BilibiliAuthWorkerPollResultSchema,
  BilibiliAuthWorkerValidateInputSchema,
  type BilibiliAuthWorkerGenerateResult,
  type BilibiliAuthWorkerNavResult,
  type BilibiliAuthWorkerPollInput,
  type BilibiliAuthWorkerPollResult,
  type BilibiliAuthWorkerValidateInput
} from "@bmd/contracts"

import type { BilibiliAuthSource } from "./bilibili-auth-service"

export interface AuthWorkerRequestTransport {
  request: (type: string, payload: unknown) => Promise<unknown>
  stop?: () => Promise<void>
}

export class BilibiliAuthWorkerSource implements BilibiliAuthSource {
  constructor(private readonly transport: AuthWorkerRequestTransport) {}

  async generate(): Promise<BilibiliAuthWorkerGenerateResult> {
    return BilibiliAuthWorkerGenerateResultSchema.parse(
      await this.transport.request("bilibili.auth.qr.generate", {})
    )
  }

  async poll(input: BilibiliAuthWorkerPollInput): Promise<BilibiliAuthWorkerPollResult> {
    const parsed = BilibiliAuthWorkerPollInputSchema.parse(input)
    return BilibiliAuthWorkerPollResultSchema.parse(
      await this.transport.request("bilibili.auth.qr.poll", parsed)
    )
  }

  async validate(input: BilibiliAuthWorkerValidateInput): Promise<BilibiliAuthWorkerNavResult> {
    const parsed = BilibiliAuthWorkerValidateInputSchema.parse(input)
    return BilibiliAuthWorkerNavResultSchema.parse(
      await this.transport.request("bilibili.auth.validate", parsed)
    )
  }

  async stop(): Promise<void> {
    await this.transport.stop?.()
  }
}
