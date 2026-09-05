import type { WorkerRequestTransport } from "./bilibili-follower-worker-source"
import type { DouyinOAuthSource } from "./douyin-auth-service"

function result(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Douyin OAuth Worker returned an invalid response.")
  }
  return value as Record<string, unknown>
}

export class DouyinOAuthWorkerSource implements DouyinOAuthSource {
  constructor(private readonly transport: WorkerRequestTransport) {}

  async exchangeCode(input: { clientKey: string; clientSecret: string; code: string }) {
    return result(await this.transport.request("douyin.oauth.exchange", input))
  }

  async refreshAccessToken(input: { clientKey: string; refreshToken: string }) {
    return result(await this.transport.request("douyin.oauth.refresh", input))
  }

  async fetchUserInfo(input: { accessToken: string; openId: string }) {
    return result(await this.transport.request("douyin.oauth.userinfo", input))
  }

  async stop(): Promise<void> {
    await this.transport.stop?.()
  }
}
