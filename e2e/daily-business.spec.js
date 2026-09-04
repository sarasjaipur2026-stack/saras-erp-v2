import { test, expect } from '@playwright/test'

const allRoutes = [
  '/', '/orders', '/orders/new', '/enquiries', '/enquiries/new', '/calculator',
  '/production', '/jobwork', '/quality', '/purchase', '/stock', '/dispatch',
  '/invoices', '/payments', '/reports', '/notifications', '/settings',
  '/settings/users', '/import', '/masters/customers', '/masters/products',
  '/masters/materials', '/masters/suppliers', '/masters/staff', '/masters/catalogs',
  '/masters/colors', '/masters/machines', '/masters/brokers', '/masters/warehouses',
  '/masters/banks', '/masters/units', '/masters/order-types', '/masters/payment-terms',
  '/masters/charge-types', '/masters/hsn-codes', '/masters/machine-types',
  '/masters/product-types', '/masters/yarn-types', '/masters/process-types',
  '/masters/operators', '/masters/chaal-types', '/masters/packaging-types',
  '/masters/transports', '/masters/quality-parameters',
]

const mobileRoutes = [
  '/', '/orders', '/orders/new', '/calculator', '/production', '/jobwork',
  '/purchase', '/stock', '/dispatch', '/invoices', '/payments', '/reports', '/settings',
]

test('every daily-business screen opens without a runtime failure', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(`page: ${error.message}`))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  const routes = testInfo.project.name === 'mobile' ? mobileRoutes : allRoutes

  for (const route of routes) {
    await test.step(route, async () => {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' })
      expect(response?.status(), `${route} HTTP status`).toBeLessThan(400)
      await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[?#].*)?$`))
      await expect(page.locator('main')).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('#root')).not.toContainText(/something went wrong|failed to load page/i)

      if (testInfo.project.name === 'mobile') {
        const viewport = await page.evaluate(() => ({
          pageWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        }))
        expect(viewport.pageWidth, `${route} must not overflow the phone viewport`)
          .toBeLessThanOrEqual(viewport.viewportWidth + 2)
      }
    })
  }

  expect(errors).toEqual([])
})

test('order costing and print actions are reachable from the exact order', async ({ page }) => {
  await page.goto('/orders')
  const firstOrder = page.locator('tbody tr').first()
  await expect(firstOrder).toBeVisible({ timeout: 15_000 })
  await firstOrder.click()
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/)

  const costing = page.getByRole('button', { name: /calculate|edit costing/i }).first()
  await expect(costing).toBeVisible()
  const orderPath = new URL(page.url()).pathname
  await costing.click()
  await expect(page).toHaveURL(/\/calculator\?order=[0-9a-f-]+&item=[0-9a-f-]+/)

  await page.goto(orderPath)
  await page.getByRole('button', { name: /^print$/i }).click()
  await expect(page.getByRole('button', { name: /order confirmation/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /production slip/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /delivery challan/i })).toBeVisible()
})
