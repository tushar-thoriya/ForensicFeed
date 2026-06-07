import { request, type FullConfig } from '@playwright/test'

// Next.js dev compiles routes on first request. When several parallel Playwright
// workers hit a freshly-booted dev server at once, that first compile races and
// aborts navigations (net::ERR_ABORTED) or serves a not-yet-hydrated page. We
// warm every route here, serially, so by the time the workers start the dev
// server has already compiled and cached each route.
async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000'
  const ctx = await request.newContext({ baseURL })

  // One representative URL per compiled route segment:
  //   /                      → feed (also covers /?q= and /?filters)
  //   /saved                 → saved view
  //   /papers/<anything>     → the [id] route (404s, but the segment compiles)
  const routes = ['/', '/?q=warmup', '/saved', '/papers/__warmup__']
  for (const route of routes) {
    try {
      await ctx.get(route, { timeout: 60_000 })
    } catch {
      // A warm-up miss is non-fatal — the per-test retry still covers it.
    }
  }

  await ctx.dispose()
}

export default globalSetup
