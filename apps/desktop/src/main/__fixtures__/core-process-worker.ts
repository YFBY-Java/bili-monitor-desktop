// Test-only MessagePort adapter: run the actual Core entry without starting Electron or a GUI.
import { parentPort } from "node:worker_threads"

if (!parentPort) throw new Error("Expected isolated test worker")
const port = parentPort
Object.defineProperty(process, "parentPort", { value: {
  on: (event: string, listener: (event: { data: unknown }) => void) => port.on(event, data => listener({ data })),
  postMessage: (message: unknown) => port.postMessage(message)
} })
process.stderr.write("Test-only startup diagnostic at D:/synthetic-private-runtime/module.js\n")
await import("../core-process")
