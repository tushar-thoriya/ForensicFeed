import { expect, test } from '@playwright/test'

test.describe('domain tabs', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  const tabs = () => ({ nameForgery: 'Forgery & Localization', nameDeepfake: 'Deepfakes' })

  test('defaults to the forgery tab with no domain param in the URL', async ({ page }) => {
    await page.goto('/')
    const { nameForgery } = tabs()
    const forgery = page.getByRole('link', { name: nameForgery })
    await expect(forgery).toHaveAttribute('aria-current', 'page')
    await expect(page).not.toHaveURL(/domain=/)
  })

  test('clicking Deepfakes updates the URL and moves aria-current', async ({ page }) => {
    await page.goto('/')
    const { nameForgery, nameDeepfake } = tabs()
    await page.getByRole('link', { name: nameDeepfake }).click()

    await expect(page).toHaveURL(/[?&]domain=deepfake/)
    await expect(page.getByRole('link', { name: nameDeepfake })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('link', { name: nameForgery })).not.toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('direct load of ?domain=deepfake activates the deepfake tab', async ({ page }) => {
    await page.goto('/?domain=deepfake')
    await expect(page.getByRole('link', { name: 'Deepfakes' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('switching tabs preserves an active tag filter', async ({ page }) => {
    await page.goto('/?tag=localization')
    await page.getByRole('link', { name: 'Deepfakes' }).click()
    await expect(page).toHaveURL(/tag=localization/)
    await expect(page).toHaveURL(/domain=deepfake/)
  })

  test('the saved view does not render the domain tabs', async ({ page }) => {
    await page.goto('/saved')
    await expect(page.getByRole('navigation', { name: 'Paper domain' })).toHaveCount(0)
  })
})
