import { randomBytes, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import type { BilibiliAuthWorkerGenerateResult, BilibiliAuthWorkerNavResult, BilibiliAuthWorkerPollInput, BilibiliAuthWorkerPollResult } from "@bmd/contracts"
import { ControlDatabase } from "@bmd/storage"
import { BilibiliAuthService, type BilibiliAuthSource } from "../bilibili-auth-service"
import { CredentialCipher } from "../credential-cipher"

export function authGate() {
  let release = () => {}, entered = () => {}
  const pending = new Promise<void>(resolveGate => { release = resolveGate })
  const started = new Promise<void>(resolveGate => { entered = resolveGate })
  return { started, release, wait: () => { entered(); return pending } }
}

export class SyntheticAuthSource implements BilibiliAuthSource {
  calls = { generate: 0, poll: 0, validate: 0, stop: 0 }
  pollInputs: BilibiliAuthWorkerPollInput[] = []
  generated: BilibiliAuthWorkerGenerateResult = { qrUrl: "https://example.test/synthetic-auth", qrcodeKey: "SYNTHETIC_QR_KEY", cookies: [] }
  polled: BilibiliAuthWorkerPollResult = { code: 0, message: "ok", refreshToken: "SYNTHETIC_REFRESH",
    cookies: [ { name: "SESSDATA", value: "SYNTHETIC_SESSION" }, { name: "bili_jct", value: "SYNTHETIC_CSRF" }, { name: "DedeUserID", value: "99" } ] }
  nav: BilibiliAuthWorkerNavResult = { account: { mid: "99", uname: "登录迁移合成用户", level: 0, vipStatus: 0 }, rawPayload: { code: 0, data: { isLogin: true } } }
  generateWait = async (): Promise<void> => {}
  pollWait = async (): Promise<void> => {}
  navWait = async (): Promise<void> => {}
  navError: Error | undefined
  async generate() { this.calls.generate++; const value = structuredClone(this.generated); await this.generateWait(); return value }
  async poll(input: BilibiliAuthWorkerPollInput) { this.calls.poll++; this.pollInputs.push(structuredClone(input)); const value = structuredClone(this.polled); await this.pollWait(); return value }
  async validate() {
    this.calls.validate++
    const value = structuredClone(this.nav), error = this.navError
    await this.navWait()
    if (error) throw error
    return value
  }
  async stop() { this.calls.stop++ }
}

export async function openAuthHarness() {
  const directory = await mkdtemp(resolve(tmpdir(), "bmd-auth-migration-"))
  const source = new SyntheticAuthSource()
  const key = randomBytes(32)
  let database = await ControlDatabase.open(directory)
  const services: BilibiliAuthService[] = []
  const createService = () => {
    const service = new BilibiliAuthService({ database, source, cipher: new CredentialCipher(key), now: () => new Date(), idFactory: randomUUID })
    services.push(service)
    return service
  }
  let service = createService()
  return {
    directory, source, key,
    get database() { return database },
    get service() { return service },
    async login() {
      const start = await service.startQrLogin()
      const result = await service.pollQrLogin(start.loginId)
      return { start, result, stored: database.findActiveBilibiliCredential()! }
    },
    async reopen() {
      await Promise.all(services.map(value => value.stop()))
      database.close()
      database = await ControlDatabase.open(directory)
      service = createService()
    },
    async close() {
      await Promise.all(services.map(value => value.stop()))
      database.close()
      await rm(directory, { recursive: true, force: true })
    }
  }
}
