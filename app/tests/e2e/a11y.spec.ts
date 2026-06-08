import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Automated WCAG 2.1 A/AA scan of the three main surfaces (+ the 404 screen).
// axe results don't vary meaningfully by rendering engine, so we run the scan
// once on chromium rather than triple-counting across webkit/mobile-safari.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function expectNoViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(violations).toEqual([])
}

test.describe('accessibility (axe)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'axe scan runs once on chromium')
  test.use({ viewport: { width: 1280, height: 900 } })

  test('feed has no axe violations', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expectNoViolations(page)
  })

  test('paper detail has no axe violations', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const links = page.locator('.paper-card-title-link')
    test.skip((await links.count()) === 0, 'no papers seeded in local DB')
    await links.first().click()
    await page.waitForURL(/\/papers\//, { timeout: 5000 })
    await expectNoViolations(page)
  })

  test('saved view has no axe violations', async ({ page }) => {
    await page.goto('/saved', { waitUntil: 'domcontentloaded' })
    await expectNoViolations(page)
  })

  test('paper-not-found screen has no axe violations', async ({ page }) => {
    await page.goto('/papers/__missing__', { waitUntil: 'domcontentloaded' })
    await expectNoViolations(page)
  })
})
