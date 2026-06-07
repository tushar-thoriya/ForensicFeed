import { expect, test, type Page } from '@playwright/test'

// Navigate from the feed into the first paper's detail page. Returns false
// when the local DB has no papers seeded, so callers can skip cleanly rather
// than fail — mirrors the empty-DB tolerance in home.spec.ts.
async function openFirstPaper(page: Page): Promise<boolean> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const titleLinks = page.locator('.paper-card-title-link')
  if ((await titleLinks.count()) === 0) return false
  await titleLinks.first().click()
  await page.waitForURL(/\/papers\//, { timeout: 2000 })
  return true
}

test.describe('paper detail + save/read', () => {
  // Serial mode: these three tests each navigate to the feed on a fresh dev
  // server. Running them in parallel makes three cold navigations race the
  // Next.js dev compile, which intermittently aborts one with ERR_ABORTED.
  // Serial warms the route on the first goto and keeps the rest fast + stable.
  test.describe.configure({ mode: 'serial' })
  test.use({ viewport: { width: 1280, height: 900 } })

  test('feed card opens the paper detail page', async ({ page }) => {
    const opened = await openFirstPaper(page)
    test.skip(!opened, 'no papers seeded in local DB')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: /back to feed/i })).toBeVisible()
  })

  test('save toggle flips and round-trips back to its initial state', async ({ page }) => {
    const opened = await openFirstPaper(page)
    test.skip(!opened, 'no papers seeded in local DB')

    const save = page.getByRole('button', { name: /save paper|unsave paper/i })
    await expect(save).toBeVisible()

    const initial = await save.getAttribute('aria-pressed')
    const flipped = initial === 'true' ? 'false' : 'true'

    await save.click()
    await expect(save).toHaveAttribute('aria-pressed', flipped)

    // Toggle back so the suite leaves no stray saved state in the DB.
    await save.click()
    await expect(save).toHaveAttribute('aria-pressed', initial ?? 'false')
  })

  test('read toggle flips and round-trips back to its initial state', async ({ page }) => {
    const opened = await openFirstPaper(page)
    test.skip(!opened, 'no papers seeded in local DB')

    const read = page.getByRole('checkbox')
    await expect(read).toBeVisible()

    const initiallyChecked = await read.isChecked()

    await read.click()
    if (initiallyChecked) {
      await expect(read).not.toBeChecked()
    } else {
      await expect(read).toBeChecked()
    }

    // Restore original read state.
    await read.click()
    if (initiallyChecked) {
      await expect(read).toBeChecked()
    } else {
      await expect(read).not.toBeChecked()
    }
  })
})
