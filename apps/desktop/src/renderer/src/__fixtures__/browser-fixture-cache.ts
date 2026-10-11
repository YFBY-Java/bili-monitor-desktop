import { fileURLToPath } from "node:url"

// Identical fixture servers can reuse Vite's dependency-only cache. React state,
// HTTP listeners, browser contexts and IPC fixtures remain local to each suite.
export const browserFixtureRoot = fileURLToPath(new URL("..", import.meta.url))
export const browserFixtureCacheDirectory = fileURLToPath(new URL("../../../../node_modules/.vite-browser-fixtures", import.meta.url))
