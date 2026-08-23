import { isIP } from "node:net"

export interface BrowserWorkerDescriptor {
  workerId: "browser-primary"
  workerType: "browser"
  transport: "stdio"
  capabilities: readonly ["browser.navigate", "browser.extract", "browser.screenshot"]
}

export function createBrowserWorkerDescriptor(): BrowserWorkerDescriptor {
  return {
    workerId: "browser-primary",
    workerType: "browser",
    transport: "stdio",
    capabilities: ["browser.navigate", "browser.extract", "browser.screenshot"]
  }
}

export function assertBrowserNavigationAllowed(target: string): string {
  const url = new URL(target)
  const hostname = url.hostname.toLowerCase()
  const ipVersion = isIP(hostname)
  const privateIpv4 =
    ipVersion === 4 &&
    (hostname.startsWith("127.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname))
  const loopbackIpv6 = ipVersion === 6 && (hostname === "::1" || hostname === "[::1]")

  if (url.protocol !== "https:" || hostname === "localhost" || privateIpv4 || loopbackIpv6) {
    throw new Error(`Browser navigation target is not allowed: ${target}`)
  }
  return url.toString()
}
