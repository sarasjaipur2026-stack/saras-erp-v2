import { test, expect } from '@playwright/test'

test.describe('Masters CRUD', () => {
  test('customers page loads and shows data table', async ({ page }) => {
    await page.goto('/masters/customers', { waitUntil: 'networkidle' })
    await expect(page.locator('h1').first()).toContainText('Customer')
    // Should show table
    await expect(page.locator('table').first()).toBeVisible()
  })

  test('add button opens modal on master page', async ({ page }) => {
    await page.goto('/masters/colors', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    // Click Add button
    const addBtn = page.locator('button', { hasText: /Add/ }).first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    await addBtn.click()
    // Modal should open — look for modal overlay or form inputs that appear
    await expect(page.locator('[role="dialog"], .fixed.inset-0, .fixed.z-50').first()).toBeVisible({ timeout: 5000 })
  })

  test('delete shows confirmation modal (not browser confirm)', async ({ page }) => {
    await page.goto('/masters/colors', { waitUntil: 'networkidle' })
    // Wait for table data
    await page.waitForTimeout(2000)
    const deleteBtn = page.locator('button svg.lucide-trash-2').first()
    if (await deleteBtn.isVisible()) {
      // Set up dialog handler — should NOT fire since we use a Modal now
      let dialogFired = false
      page.on('dialog', () => { dialogFired = true })
      await deleteBtn.click()
      await page.waitForTimeout(500)
      // Should show modal, not browser confirm
      expect(dialogFired).toBe(false)
      const modal = page.locator('text=Confirm Delete')
      await expect(modal).toBeVisible()
    }
  })
})
