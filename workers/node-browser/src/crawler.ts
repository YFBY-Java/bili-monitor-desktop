import { PlaywrightCrawler, type PlaywrightCrawlingContext } from "crawlee"

import { assertBrowserNavigationAllowed } from "./browser-policy"

export interface BrowserArtifact {
  url: string
  title: string
  html: string
}

export function createBrowserCrawler(
  onArtifact: (artifact: BrowserArtifact, context: PlaywrightCrawlingContext) => Promise<void>
): PlaywrightCrawler {
  return new PlaywrightCrawler({
    maxConcurrency: 4,
    maxRequestRetries: 3,
    preNavigationHooks: [({ request }) => void assertBrowserNavigationAllowed(request.url)],
    requestHandler: async (context) => {
      const { page, request } = context
      await onArtifact(
        {
          url: request.loadedUrl ?? request.url,
          title: await page.title(),
          html: await page.content()
        },
        context
      )
    }
  })
}
