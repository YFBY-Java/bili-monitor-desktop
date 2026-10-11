import { existsSync } from "node:fs"
import { join } from "node:path"

import react from "@vitejs/plugin-react"
import { optimizeDeps, resolveConfig } from "vite"

import { browserFixtureCacheDirectory, browserFixtureRoot } from "../src/renderer/src/__fixtures__/browser-fixture-cache.ts"

// Vitest sets this before starting its workers. Prepare the matching cache in
// the standard test command, rather than racing the same builds in every hook.
process.env.NODE_ENV ??= "test"
const startedAt = performance.now()
const cachePresentBefore = existsSync(join(browserFixtureCacheDirectory, "deps", "_metadata.json"))
const config = await resolveConfig({ configFile: false, root: browserFixtureRoot,
  cacheDir: browserFixtureCacheDirectory, plugins: [react()],
  server: { host: "127.0.0.1", port: 0 }, logLevel: "error" }, "serve")
const metadata = await optimizeDeps(config)
console.log(JSON.stringify({ phase: "browser-fixture-dependencies", cachePresentBefore,
  elapsedMs: Math.round(performance.now() - startedAt), dependencyCount: Object.keys(metadata.optimized).length }))
