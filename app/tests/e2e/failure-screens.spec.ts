import { expect, test } from '@playwright/test'

test.describe('failure screens', () => {
  test('unknown paper id renders the designed 404 screen', async ({ page }) => {
    const response = await page.goto('/papers/this-paper-does-not-exist-xyz', {
      waitUntil: 'domcontentloaded',
    })

    // App Router sends a real 404 status for notFound(), not a soft 200.
    expect(response?.status()).toBe(404)

    await expect(page.getByRole('heading', { level: 1, name: /isn’t here/i })).toBeVisible()
    await expect(page.getByText(/paper not found/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /back to feed/i })).toBeVisible()
  })

  test('404 screen links back to the working feed', async ({ page }) => {
    await page.goto('/papers/another-missing-id', { waitUntil: 'domcontentloaded' })

    await page.getByRole('link', { name: /back to feed/i }).click()
    await page.waitForURL('**/', { timeout: 5000 })

    await expect(page.getByRole('heading', { level: 1, name: /forensicfeed/i })).toBeVisible()
  })
})
