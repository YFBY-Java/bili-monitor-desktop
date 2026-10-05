import { afterEach, expect, it, vi } from "vitest"
import { followerConfigurationFixture } from "./__fixtures__/follower-configuration"

let fixture: Awaited<ReturnType<typeof followerConfigurationFixture>> | undefined
afterEach(async () => { await fixture?.close(); fixture = undefined; vi.unstubAllEnvs(); vi.restoreAllMocks() })

it.each([
  ["surrounding whitespace", "  合成昵称  ", "//i2.hdslb.com/synthetic.jpg"],
  ["NBSP name", "\u00a0", "not-a-url"],
  ["160 supplementary characters", "🌸".repeat(160), "https://i2.hdslb.com/synthetic.jpg"],
  ["raw avatar whitespace", "正常昵称", "  https://i2.hdslb.com/synthetic.jpg  "],
  ["scalar avatar text", "false", "false"]
])("keeps the real Core workbench queryable with %s from a follower", async (_label, nickname, avatarUrl) => {
  fixture = await followerConfigurationFixture({ requestMinIntervalMs: 0 })
  const originalCard = fixture.options.followerSource.fetchCard
  fixture.options.followerSource.fetchCard = async request => ({ ...await originalCard(request), nickname, avatarUrl })
  const core = await fixture.start()
  const user = await core.addBilibiliFollowerMonitor({ mid: "2" })
  const subject = await core.createBilibiliSubject({ bilibiliUserMonitorId: user.id, danmuEnabled: false })
  expect(subject).toMatchObject({ displayName: nickname, avatarUrl })
  expect(core.getBilibiliSubject(subject.id)).toMatchObject({ displayName: nickname, avatarUrl })
  expect(core.listBilibiliSubjects()).toMatchObject([{ id: subject.id, displayName: nickname, avatarUrl }])
  expect(core.getBilibiliSubjectWorkbench(subject.id)).toMatchObject({ subject: { displayName: nickname, avatarUrl },
    bilibiliUser: { nickname, avatarUrl } })
  await fixture.stop()
  const restarted = await fixture.start()
  expect(restarted.listBilibiliSubjects()).toMatchObject([{ id: subject.id, displayName: nickname, avatarUrl }])
  expect(restarted.getBilibiliSubjectWorkbench(subject.id).bilibiliUser).toMatchObject({ nickname, avatarUrl })
})
