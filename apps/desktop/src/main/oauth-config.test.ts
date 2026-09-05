import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { loadDouyinOAuthConfiguration } from "./oauth-config"

describe("loadDouyinOAuthConfiguration", () => {
  let directory: string | undefined

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it("loads a deployable live configuration from the D-drive data directory", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-oauth-config-"))
    const configDirectory = join(directory, "config")
    await mkdir(configDirectory, { recursive: true })
    await writeFile(join(configDirectory, "douyin-oauth.env"), [
      "BMD_DOUYIN_OAUTH_MODE=live",
      "BMD_DOUYIN_OAUTH_CLIENT_KEY=desktop-key",
      "BMD_DOUYIN_OAUTH_CLIENT_SECRET=desktop-secret",
      "BMD_DOUYIN_OAUTH_REDIRECT_URI=bilimonitor://douyin-oauth",
      "BMD_DOUYIN_OAUTH_SCOPE=user_info,mobile"
    ].join("\n"), "utf8")

    expect(loadDouyinOAuthConfiguration(directory, {})).toEqual({
      mode: "live",
      clientKey: "desktop-key",
      clientSecret: "desktop-secret",
      redirectUri: "bilimonitor://douyin-oauth",
      scope: "user_info,mobile"
    })
  })

  it("creates an installed-app template and stays disabled until all live values exist", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-oauth-template-"))
    expect(loadDouyinOAuthConfiguration(directory, {})).toEqual({ mode: "disabled" })
    const template = await readFile(join(directory, "config", "douyin-oauth.env.example"), "utf8")
    expect(template).toContain("BMD_DOUYIN_OAUTH_CLIENT_SECRET=")
    expect(template).toContain("bilimonitor://douyin-oauth")
  })

  it("migrates a live client secret into the OS-protected local file", async () => {
    directory = await mkdtemp(resolve(tmpdir(), "bmd-oauth-protected-"))
    const configDirectory = join(directory, "config")
    const sourcePath = join(configDirectory, "douyin-oauth.env")
    await mkdir(configDirectory, { recursive: true })
    await writeFile(sourcePath, [
      "BMD_DOUYIN_OAUTH_MODE=live",
      "BMD_DOUYIN_OAUTH_CLIENT_KEY=desktop-key",
      "BMD_DOUYIN_OAUTH_CLIENT_SECRET=desktop-secret",
      "BMD_DOUYIN_OAUTH_REDIRECT_URI=bilimonitor://douyin-oauth"
    ].join("\n"), "utf8")
    const protector = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`protected:${value}`, "utf8"),
      decryptString: (value: Buffer) => value.toString("utf8").replace(/^protected:/u, "")
    }

    expect(loadDouyinOAuthConfiguration(directory, {}, protector)).toMatchObject({
      mode: "live",
      clientSecret: "desktop-secret"
    })
    await expect(access(sourcePath)).rejects.toThrow()
    expect(await readFile(join(configDirectory, "douyin-oauth.secure"), "utf8"))
      .not.toContain("desktop-secret")
    expect(loadDouyinOAuthConfiguration(directory, {}, protector)).toMatchObject({
      mode: "live",
      clientSecret: "desktop-secret"
    })
  })
})
