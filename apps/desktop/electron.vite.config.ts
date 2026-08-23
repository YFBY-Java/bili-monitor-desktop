import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

import react from "@vitejs/plugin-react"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"

const projectDirectory = dirname(fileURLToPath(import.meta.url))
const bundledDependencies = ["@bmd/contracts", "@bmd/core-runtime", "@bmd/storage", "zod"]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundledDependencies })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(projectDirectory, "src/main/index.ts"),
          "core-process": resolve(projectDirectory, "src/main/core-process.ts")
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["@bmd/contracts", "zod"] })],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs"
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve(projectDirectory, "src/renderer/src")
      }
    },
    plugins: [react()]
  }
})
