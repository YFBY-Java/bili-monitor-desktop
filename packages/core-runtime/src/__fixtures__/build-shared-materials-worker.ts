import { createRequire } from "node:module"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export async function buildSharedMaterialsWorker(directory: string): Promise<string> {
  const appRequire = createRequire(new URL("../../../../apps/desktop/package.json", import.meta.url))
  const viteRequire = createRequire(appRequire.resolve("vite"))
  const { build } = viteRequire("esbuild") as { build: (options: Record<string, unknown>) => Promise<unknown> }
  const entry = resolve(directory, "synthetic-realtime-worker.cjs")
  await build({
    entryPoints: [fileURLToPath(new URL("./shared-materials-worker.mjs", import.meta.url))],
    outfile: entry, bundle: true, platform: "node", format: "cjs", target: "node24", logLevel: "silent"
  })
  return entry
}
