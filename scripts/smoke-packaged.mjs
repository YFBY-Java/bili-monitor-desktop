// Test driver only: the tested application and workers use their bundled runtimes.
// Usage: node scripts/smoke-packaged.mjs "D:\...\BiliMonitor Desktop.exe"
// An installation outside release additionally requires --allow-test-root "D:\test-install".
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, realpath, stat, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const arguments_ = process.argv.slice(2)
assert.ok(arguments_.length === 1 || (arguments_.length === 3 && arguments_[1] === "--allow-test-root"),
  "Expected application EXE path, optionally followed by --allow-test-root and an explicit D-drive test directory.")
assert.ok(isAbsolute(arguments_[0]), "Application EXE path must be absolute.")
assert.equal(process.platform, "win32", "This smoke test validates the Windows package.")
assert.equal(parse(repository).root.toLowerCase(), "d:\\", "Test data must stay on D:.")
const executable = await realpath(arguments_[0])
const inside = (root, path) => {
  const child = relative(root, path)
  return child !== "" && child !== ".." && !child.startsWith(`..\\`) && !isAbsolute(child)
}
let allowedRoot = join(repository, "release")
if (arguments_[2]) {
  assert.ok(isAbsolute(arguments_[2]), "Test root must be absolute.")
  allowedRoot = await realpath(arguments_[2])
  assert.equal(parse(allowedRoot).root.toLowerCase(), "d:\\", "Test installation must stay on D:.")
  assert.notEqual(allowedRoot.toLowerCase(), parse(allowedRoot).root.toLowerCase(), "A whole drive is not a test root.")
}
assert.ok(inside(allowedRoot, executable), "Application EXE is outside the permitted package/test directory.")
assert.equal(basename(executable).toLowerCase(), "bilimonitor desktop.exe", "Pass the installed application, not the NSIS installer.")
assert.ok((await stat(executable)).isFile())
const resources = join(dirname(executable), "resources")
assert.ok((await stat(join(resources, "app.asar"))).isFile(), "Packaged app.asar is missing.")

const scratchRoot = join(repository, ".tools", "temp")
await mkdir(scratchRoot, { recursive: true })
const dataDirectory = await mkdtemp(join(scratchRoot, "bmd-packaged-smoke-"))
const tempDirectory = join(dataDirectory, "temp")
await mkdir(tempDirectory)
await mkdir(join(dataDirectory, "config"))
for (const [name, value] of [
  ["bilibili-follower-collection.json", { enabled: false }],
  ["bilibili-live-collection.json", { enabled: false }],
  ["bilibili-live-danmaku.json", { enabled: false, autoStartEnabled: false }]
]) await writeFile(join(dataDirectory, "config", name), JSON.stringify(value), { flag: "wx" })

const environment = { ...process.env }
for (const key of Object.keys(environment)) {
  if (/^(BMD|SOCIAL|APP_BILIBILI|APP_SUBJECT|PYTHON|NODE|ELECTRON_|VIRTUAL_ENV|PLAYWRIGHT_)/i.test(key)
    || /^(path|temp|tmp|tmpdir)$/i.test(key)) delete environment[key]
}
const systemRoot = Object.entries(environment).find(([key]) => key.toLowerCase() === "systemroot")?.[1]
assert.ok(systemRoot, "Windows SystemRoot is missing.")
environment.PATH = join(systemRoot, "System32")
environment.TEMP = tempDirectory
environment.TMP = tempDirectory
environment.TMPDIR = tempDirectory

const ownedPids = new Set()
const evidence = { executable, dataDirectory, path: environment.PATH, schemaVersion: 18,
  realPlatformRequests: false, userDatabase: false, installerAcceptance: false }
let stage = "python"
let application
let failure

function runBundled(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: dataDirectory, env: environment,
    windowsHide: true, encoding: "utf8", timeout: 45_000, maxBuffer: 2 * 1024 * 1024, ...options })
  if (result.pid) ownedPids.add(result.pid)
  for (const line of (result.stdout ?? "").split(/\r?\n/u)) {
    if (line.startsWith("SMOKE_PIDS=")) for (const pid of JSON.parse(line.slice(11))) ownedPids.add(pid)
  }
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  return result.stdout.trim().split(/\r?\n/u).filter(line => line && !line.startsWith("SMOKE_PIDS="))
}

function descendants(rootPid) {
  assert.ok(Number.isInteger(rootPid) && rootPid > 0)
  const command = `$items = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId); `
    + `$known = [Collections.Generic.HashSet[int]]::new(); [void]$known.Add(${rootPid}); `
    + `do { $added = $false; foreach ($item in $items) { if ($known.Contains([int]$item.ParentProcessId) `
    + `-and $known.Add([int]$item.ProcessId)) { $added = $true } } } while ($added); `
    + `ConvertTo-Json -InputObject @($known) -Compress`
  const result = spawnSync(join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { env: environment, cwd: dataDirectory, windowsHide: true, encoding: "utf8", timeout: 15_000 })
  assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  for (const pid of JSON.parse(result.stdout.trim())) ownedPids.add(pid)
}

function survivingPids() {
  return [...ownedPids].filter(pid => {
    try { process.kill(pid, 0); return true }
    catch (error) { if (error.code === "ESRCH") return false; throw error }
  })
}

async function corePid() {
  const metrics = await application.evaluate(({ app }) => app.getAppMetrics().map(item => ({ name: item.name, pid: item.pid })))
  for (const item of metrics) ownedPids.add(item.pid)
  const cores = metrics.filter(item => item.name === "BiliMonitor Local Core")
  assert.equal(cores.length, 1, "Expected exactly one Local Core.")
  descendants(application.process().pid)
  return cores[0].pid
}

try {
  const request = type => {
    const id = randomUUID()
    return JSON.stringify({ id, type, timestamp: new Date().toISOString(), correlationId: id, traceId: randomUUID(), payload: {} })
  }
  const responses = runBundled(join(resources, "python-worker", "bmd-python-worker.exe"), ["--role", "crawler"], {
    input: `${request("worker.ping")}\n${request("worker.capabilities")}\n`
  }).map(line => JSON.parse(line))
  assert.equal(responses[0].type, "worker.ping.result")
  assert.equal(responses[0].payload.state, "ready")
  assert.equal(responses[1].type, "worker.capabilities.result")
  assert.ok(responses[1].payload.capabilities.includes("bilibili.platform.fetch-account.v1"))
  assert.ok(responses[1].payload.capabilities.includes("bilibili.live.rank.fetch.v2"))
  evidence.python = { ready: true, capabilities: responses[1].payload.capabilities.length }

  stage = "bundled-node-browser"
  const nodeProbe = String.raw`
    const assert = require("node:assert/strict");
    const path = require("node:path");
    const resources = process.argv[1];
    const packaged = require("node:module").createRequire(path.join(resources, "app.asar", "package.json"));
    const assertPackaged = filename => assert.ok(["app.asar", "app.asar.unpacked"].some(name =>
      filename.toLowerCase().startsWith(path.join(resources, name).toLowerCase() + path.sep)), filename);
    for (const name of ["ws", "playwright"]) assertPackaged(packaged.resolve(name));
    const playwrightRequire = require("node:module").createRequire(packaged.resolve("playwright"));
    assertPackaged(playwrightRequire.resolve("playwright-core"));
    const { DatabaseSync } = require("node:sqlite");
    const database = new DatabaseSync(":memory:");
    assert.equal(database.prepare("SELECT 1 AS value").get().value, 1);
    database.close();
    assert.equal(typeof packaged("ws"), "function");
    const { chromium } = packaged("playwright");
    assert.ok(chromium.executablePath().toLowerCase().startsWith(path.join(resources, "playwright-browsers").toLowerCase() + path.sep));
    (async () => {
      const browser = await chromium.launch({ headless: true, timeout: 20000 });
      try {
        const page = await browser.newPage();
        await page.route(/^https?:/u, route => route.abort());
        await page.goto("about:blank");
        await page.evaluate(() => { document.title = "BiliMonitor packaged smoke"; });
        assert.equal(await page.title(), "BiliMonitor packaged smoke");
        const cdp = await browser.newBrowserCDPSession();
        const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
        console.log("SMOKE_PIDS=" + JSON.stringify(processInfo.map(item => item.id)));
        await cdp.detach();
      } finally { await browser.close(); }
      console.log(JSON.stringify({ sqlite: true, ws: true, playwright: true, chromiumAboutBlank: true, electron: process.versions.electron, node: process.versions.node }));
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `
  const nodeOutput = runBundled(executable, ["-e", nodeProbe, resources], {
    env: { ...environment, ELECTRON_RUN_AS_NODE: "1", PLAYWRIGHT_BROWSERS_PATH: join(resources, "playwright-browsers") }
  })
  evidence.bundledRuntime = JSON.parse(nodeOutput.at(-1))

  stage = "application"
  const { _electron } = createRequire(join(repository, "apps", "desktop", "package.json"))("playwright")
  application = await _electron.launch({ executablePath: executable, args: [], cwd: dataDirectory,
    env: { ...environment, BMD_DATA_DIR: dataDirectory, BMD_DOUYIN_OAUTH_MODE: "disabled", BMD_E2E_HEADLESS: "1" }, timeout: 30_000 })
  ownedPids.add(application.process().pid)
  const identity = await application.evaluate(({ app }) => ({ packaged: app.isPackaged, appPath: app.getAppPath() }))
  assert.equal(identity.packaged, true)
  assert.equal(resolve(identity.appPath).toLowerCase(), join(resources, "app.asar").toLowerCase())
  const page = await application.firstWindow()
  page.setDefaultTimeout(30_000)
  await page.route(/^https?:/u, route => route.abort())
  await page.waitForFunction(() => globalThis.bmd !== undefined)
  const first = await page.evaluate(() => globalThis.bmd.core.bootstrap())
  assert.equal(first.coreStatus.state, "ready")
  assert.equal(first.coreStatus.schemaVersion, 18)
  assert.equal(resolve(first.coreStatus.dataDirectory), dataDirectory)
  evidence.firstCorePid = await corePid()

  stage = "navigation"
  const pages = [
    ["用户监控", "B站用户监控", 1, "bilibili-subjects", ".subject-directory"],
    ["粉丝监控", "B站用户粉丝监控", 1, "bilibili-followers", ".follower-directory"],
    ["直播间监控", "B站直播间监控", 1, "bilibili-live", ".live-workspace"],
    ["数据中心", "数据中心", 1, "live-data", ".live-workspace"],
    ["分析看板", "分析看板", 1, "live-analytics", ".bilibili-live-analysis"],
    ["抖音登录态", "我的抖音登录态", 2, "douyin-auth", ".douyin-auth-workspace"],
    ["平台采集", "平台管理与单次采集", 2, "platform-collection", ".platform-collection-workspace"]
  ]
  const navigation = page.getByRole("navigation", { name: "业务导航" })
  assert.equal(await navigation.getByRole("button").count(), pages.length)
  evidence.pages = []
  for (const [label, heading, level, hash, selector] of pages) {
    const button = navigation.getByRole("button", { name: label, exact: true })
    await button.click()
    await page.waitForFunction(expected => location.hash === expected, `#${hash}`)
    await page.getByRole("heading", { name: heading, level, exact: true }).waitFor()
    await page.locator(selector).waitFor()
    if (hash === "live-data") await page.getByText("数据中心暂无来源", { exact: true }).waitFor()
    assert.equal(await button.getAttribute("aria-current"), "page")
    assert.equal(await page.getByText("页面加载失败，请重新加载。", { exact: true }).count(), 0)
    evidence.pages.push(label)
  }

  stage = "local-subject-restart"
  const displayName = `安装包离线验收 ${randomUUID()}`
  const subject = await page.evaluate(name => globalThis.bmd.bilibiliSubjects.create({ displayName: name, tags: ["packaged-smoke"] }), displayName)
  assert.equal(subject.displayName, displayName)
  const second = await page.evaluate(() => globalThis.bmd.core.restart())
  assert.equal(second.coreStatus.state, "ready")
  assert.equal(second.coreStatus.schemaVersion, 18)
  evidence.secondCorePid = await corePid()
  assert.notEqual(evidence.firstCorePid, evidence.secondCorePid)
  const retained = await page.evaluate(subjectId => globalThis.bmd.bilibiliSubjects.get({ subjectId }), subject.id)
  assert.equal(retained.id, subject.id)
  assert.equal(retained.displayName, displayName)
  assert.deepEqual(retained.tags, ["packaged-smoke"])
  await page.evaluate(subjectId => globalThis.bmd.bilibiliSubjects.remove({ subjectId }), subject.id)
  assert.deepEqual(await page.evaluate(() => globalThis.bmd.bilibiliSubjects.list()), [])
  evidence.localSubjectRestartRetention = true
  evidence.localSubjectRemoved = true
  evidence.packaged = true
  stage = "graceful-close"
} catch (error) {
  failure = error
} finally {
  if (application) {
    try { descendants(application.process().pid) } catch (error) { failure ??= error }
    try { await application.close() } catch (error) { failure ??= error }
  }
}

const exitDeadline = Date.now() + 10_000
while (survivingPids().length && Date.now() < exitDeadline) await delay(200)
evidence.ownedPidSurvivors = survivingPids()
evidence.ownedPids = [...ownedPids]
if (evidence.ownedPidSurvivors.length) failure ??= new Error(`Owned processes survived graceful close: ${evidence.ownedPidSurvivors.join(", ")}`)
console.log(JSON.stringify({ ...evidence, passed: !failure, ...(failure ? { failedStage: stage, error: failure.message } : {}) }))
if (failure) process.exitCode = 1
