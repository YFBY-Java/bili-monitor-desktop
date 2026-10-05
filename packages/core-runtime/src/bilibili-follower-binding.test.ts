import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadFollowerCollectionConfiguration } from "./bilibili-follower-collection-config"

describe("original Spring follower environment binding and scheduler condition", () => {
  let directory: string | undefined
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = undefined })
  async function load(environment: NodeJS.ProcessEnv) {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-follower-binding-"))
    return loadFollowerCollectionConfiguration(directory, environment)
  }
  const enabled = "APP_BILIBILI_FOLLOWERMONITOR_ENABLED"
  const storage = "APP_BILIBILI_FOLLOWERMONITOR_STORAGEENABLED"
  const attempts = "APP_BILIBILI_FOLLOWERMONITOR_MAXATTEMPTS"
  const delay = "APP_BILIBILI_FOLLOWERMONITOR_SCHEDULERDELAYMS"

  it.each([
    ["true", true], ["on", true], ["YES", true], ["1", true], [" FALSE ", false],
    ["Off", false], ["no", false], ["0", false], ["\u0000\ttrue\r\u0000", true]
  ] as const)("binds enabled %j to %s without disabling storage", async (value, expected) => {
    expect(await load({ [enabled]: value })).toMatchObject({ enabled: expected, storageEnabled: true })
  })
  it.each(["", " ", "null", "truth", "falſe", "FALſE", "\u3000true\u3000", "\u00a0false\u00a0"])(
    "rejects invalid primitive enabled %j even with storage disabled", async value => {
      await expect(load({ [enabled]: value, [storage]: "false" })).rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
    })
  it.each([
    ["false", false], ["FALSE", false], ["FaLsE", false], [" false ", true],
    ["\tfalse", true], ["", true], ["off", true], ["0", true], ["no", true], ["null", true],
    ["falſe", false], ["FALſE", false], [" falſe ", true]
  ] as const)("uses the untrimmed storage condition for %j", async (value, expected) => {
    expect(await load({ [storage]: value })).toMatchObject({ storageEnabled: expected })
  })
  it.each([
    ["1 5 0 0", 1500], ["\t+0042\r\n", 42], ["1\u001c2\u30003", 123],
    ["0x2a", 42], ["0X2A", 42], ["#2a", 42], ["-0x2a", -42], ["-#2A", -42],
    ["010", 10], ["+010", 10], ["2147483647", 2147483647], ["-2147483648", -2147483648],
    ["0x7fffffff", 2147483647], ["-0x80000000", -2147483648], ["１２３", 123],
    ["١٢٣", 123], ["0xＦＦ", 255], ["0x١f", 31], ["00000000000000000000000000003", 3], ["-0", 0], ["-#0", 0]
  ] as const)("binds ordinary int %j to %s", async (value, expected) => {
    expect(await load({ [attempts]: value })).toMatchObject({ maxAttempts: expected })
  })
  it.each([
    "", " ", "2147483648", "-2147483649", "0x80000000", "-0x80000001", "+0x3", "+#3",
    "0x-3", "0x+3", "1.0", "1e3", "1_000", "²", "𝟙", "\u00001\u0000", "\u00a01",
    "1\u20072", "1\u202f2", "0xＧ", "--3"
  ])("rejects ordinary int %j even if the scheduler is absent", async value => {
    await expect(load({ [attempts]: value, [enabled]: "false" })).rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
  })
  it("parses arbitrarily many leading zeroes without overflow or coercion limits", async () => {
    expect(await load({ [attempts]: `${"0".repeat(10_000)}3` })).toMatchObject({ maxAttempts: 3 })
  })
  // Expected BMP digit blocks independently enumerated with the original JDK's Character.digit(char, 10).
  it.each([
    "0123456789", "٠١٢٣٤٥٦٧٨٩", "۰۱۲۳۴۵۶۷۸۹", "߀߁߂߃߄߅߆߇߈߉", "०१२३४५६७८९", "০১২৩৪৫৬৭৮৯",
    "੦੧੨੩੪੫੬੭੮੯", "૦૧૨૩૪૫૬૭૮૯", "୦୧୨୩୪୫୬୭୮୯", "௦௧௨௩௪௫௬௭௮௯", "౦౧౨౩౪౫౬౭౮౯", "೦೧೨೩೪೫೬೭೮೯",
    "൦൧൨൩൪൫൬൭൮൯", "෦෧෨෩෪෫෬෭෮෯", "๐๑๒๓๔๕๖๗๘๙", "໐໑໒໓໔໕໖໗໘໙", "༠༡༢༣༤༥༦༧༨༩",
    "၀၁၂၃၄၅၆၇၈၉", "႐႑႒႓႔႕႖႗႘႙", "០១២៣៤៥៦៧៨៩", "᠐᠑᠒᠓᠔᠕᠖᠗᠘᠙", "᥆᥇᥈᥉᥊᥋᥌᥍᥎᥏",
    "᧐᧑᧒᧓᧔᧕᧖᧗᧘᧙", "᪀᪁᪂᪃᪄᪅᪆᪇᪈᪉", "᪐᪑᪒᪓᪔᪕᪖᪗᪘᪙", "᭐᭑᭒᭓᭔᭕᭖᭗᭘᭙",
    "᮰᮱᮲᮳᮴᮵᮶᮷᮸᮹", "᱀᱁᱂᱃᱄᱅᱆᱇᱈᱉", "᱐᱑᱒᱓᱔᱕᱖᱗᱘᱙", "꘠꘡꘢꘣꘤꘥꘦꘧꘨꘩",
    "꣐꣑꣒꣓꣔꣕꣖꣗꣘꣙", "꤀꤁꤂꤃꤄꤅꤆꤇꤈꤉", "꧐꧑꧒꧓꧔꧕꧖꧗꧘꧙", "꧰꧱꧲꧳꧴꧵꧶꧷꧸꧹",
    "꩐꩑꩒꩓꩔꩕꩖꩗꩘꩙", "꯰꯱꯲꯳꯴꯵꯶꯷꯸꯹", "０１２３４５６７８９"
  ])("accepts all ten digits of Java's BMP decimal block %j", async digits => {
    expect(await load({ [attempts]: digits })).toMatchObject({ maxAttempts: 123456789 })
  })
  it.each([
    "\t", "\n", "\u000b", "\u000c", "\r", "\u001c", "\u001d", "\u001e", "\u001f", " ",
    "\u1680", "\u2000", "\u2001", "\u2002", "\u2003", "\u2004", "\u2005", "\u2006", "\u2008", "\u2009",
    "\u200a", "\u2028", "\u2029", "\u205f", "\u3000"
  ])("removes Java whitespace within ordinary int values: %j", async whitespace => {
    expect(await load({ [attempts]: `1${whitespace}2` })).toMatchObject({ maxAttempts: 12 })
  })
  it.each([" 1000 ", "1 000", "0x3", "#3", "0", "-1"])(
    "rejects bound int delay %j when the original annotation condition is active", async value => {
      await expect(load({ [delay]: value })).rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
    })
  it.each(["off", "no", "0", " FALSE "])("still validates raw delay when enabled=%j", async value => {
    await expect(load({ [enabled]: value, [delay]: "0" })).rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
  })
  it.each(["false", "FALSE"])("does not validate scheduled delay text if enabled is exactly %j", async value => {
    expect(await load({ [enabled]: value, [delay]: " -1 " })).toMatchObject({ enabled: false, schedulerDelayMs: -1 })
  })
  it.each(["0", "-2147483648", "0x3", " 1000 "])("skips scheduled-text consumption for disabled storage: %j", async value => {
    const expected = value === "0x3" ? 3 : Number(value)
    expect(await load({ [storage]: "FALSE", [delay]: value })).toMatchObject({ storageEnabled: false, schedulerDelayMs: expected })
  })
  it.each(["", "PT1S", "2147483648"])("cannot bypass int binding with disabled storage: %j", async value => {
    await expect(load({ [storage]: "false", [delay]: value })).rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
  })
  it.each(["+0010", "１０００", "١٠٠٠"])("accepts untrimmed positive decimal scheduler text %j", async value => {
    const expected = value === "+0010" ? 10 : 1000
    expect(await load({ [delay]: value })).toMatchObject({ schedulerDelayMs: expected })
  })
  it("does not fall back from a high-priority empty primitive to a valid alias", async () => {
    await expect(load({ [enabled]: "", SOCIAL_MONITOR_BILIBILI_FOLLOWER_MONITOR_ENABLED: "true" }))
      .rejects.toMatchObject({ code: "BILIBILI_FOLLOWER_CONFIG_INVALID" })
  })
  it("does not fall back from an empty storage condition to a disabled alias", async () => {
    expect(await load({ [storage]: "", SOCIAL_MONITOR_BILIBILI_FOLLOWER_STORAGE_ENABLED: "false" }))
      .toMatchObject({ storageEnabled: true })
  })
})
