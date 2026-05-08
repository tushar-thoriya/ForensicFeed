import { expect, test } from '@playwright/test'

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
] as const

test('home page renders ForensicFeed heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ForensicFeed')
})

for (const vp of VIEWPORTS) {
  test(`feed has no horizontal overflow at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/')
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(overflow).toBe(false)
  })

  test(`feed renders paper cards at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/')
    // Either at least one paper card or the empty state — both are valid.
    const cards = page.locator('.paper-card')
    const empty = page.locator('.empty-state')
    const cardCount = await cards.count()
    const emptyCount = await empty.count()
    expect(cardCount + emptyCount).toBeGreaterThan(0)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test(`feed visual snapshot at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: `tests/e2e/screenshots/feed-${vp.name}.png`,
      fullPage: false,
    })
  })
}
