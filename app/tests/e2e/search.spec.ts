import { expect, test } from '@playwright/test'

test.describe('full-text search', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('typing updates URL with q param after debounce', async ({ page }) => {
    await page.goto('/')
    const input = page.getByRole('searchbox', { name: /search papers/i })
    await expect(input).toBeVisible()

    await input.fill('forgery')
    // 300ms debounce + nav latency — wait for URL change rather than fixed sleep
    await page.waitForURL(/[?&]q=forgery/, { timeout: 2000 })
    await expect(page).toHaveURL(/[?&]q=forgery/)
  })

  test('Escape clears the input and removes q param', async ({ page }) => {
    await page.goto('/?q=forgery')
    const input = page.getByRole('searchbox', { name: /search papers/i })
    await expect(input).toHaveValue('forgery')

    await input.focus()
    await input.press('Escape')

    await page.waitForURL(/^[^?]*\/?$/, { timeout: 2000 })
    await expect(input).toHaveValue('')
  })

  test('clear button removes q while preserving other filters', async ({ page }) => {
    await page.goto('/?q=forgery&tag=localization')
    const clearButton = page.getByRole('button', { name: /clear search/i })
    await expect(clearButton).toBeVisible()
    await clearButton.click()

    await page.waitForURL(/tag=localization/, { timeout: 2000 })
    await expect(page).not.toHaveURL(/[?&]q=/)
    await expect(page).toHaveURL(/tag=localization/)
  })

  test('Enter submits search immediately (push, not replace)', async ({ page }) => {
    await page.goto('/')
    const input = page.getByRole('searchbox', { name: /search papers/i })
    await input.fill('localization')
    await input.press('Enter')

    await page.waitForURL(/[?&]q=localization/, { timeout: 2000 })

    // Back button should return to the prior URL (no q)
    await page.goBack()
    await expect(page).not.toHaveURL(/[?&]q=/)
  })

  test('no-search-matches empty state renders with clear-search link', async ({ page }) => {
    // Pick a query that cannot match any real paper
    await page.goto('/?q=zzzzqqqqimpossiblequerystring')
    const empty = page.getByText(/no papers match/i)
    await expect(empty).toBeVisible()
    const clearLink = page.getByRole('link', { name: /clear search/i })
    await expect(clearLink).toBeVisible()
  })
})
