import { expect, test } from '@playwright/test'

test.describe('filter sidebar (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('toggling has-code updates URL', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Sidebar should be visible at >= 1100px
    await expect(page.getByLabel('Filters', { exact: true })).toBeVisible()

    // Click the "With code" radio in the Code availability section
    const codeRadio = page.getByLabel('With code')
    await codeRadio.click()

    await expect(page).toHaveURL(/[?&]hasCode=1/)
  })

  test('clear-all link from filtered empty state returns to default URL', async ({ page }) => {
    // Navigate directly to a filter combination that is highly unlikely to
    // match anything (year 1999 + copy-move tag), forcing the no-matches
    // empty state with the "Clear filters" CTA.
    await page.goto('/?source=arxiv&tag=copy-move&hasCode=1&year=1999')
    const clearLink = page.getByRole('link', { name: /clear filters/i })
    await expect(clearLink).toBeVisible()
    await clearLink.click()
    await expect(page).toHaveURL(/\/$/)
  })
})

test.describe('filter sheet (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('sheet trigger is visible and opens dialog', async ({ page }) => {
    await page.goto('/')
    const trigger = page.getByRole('button', { name: /^filters$/i })
    await expect(trigger).toBeVisible()
    await trigger.click()

    // <dialog> open state — title visible
    await expect(page.locator('.filter-sheet-title')).toBeVisible()

    // Close via the close button
    await page.getByRole('button', { name: /close filters/i }).click()
    await expect(page.locator('.filter-sheet-title')).toBeHidden()
  })
})
