import { test, expect } from '@playwright/test'

// All pages that should render after login
const PAGES = [
  { path: '/', title: 'Dashboard' },
  { path: '/orders', title: 'Orders' },
  { path: '/enquiries', title: 'Enquiries' },
  { path: '/calculator', title: 'Calculator' },
  { path: '/production', title: 'Production' },
  { path: '/stock', title: 'Stock' },
  { path: '/dispatch', title: 'Dispatch' },
  { path: '/invoices', title: 'Invoices' },
  { path: '/payments', title: 'Payments' },
  { path: '/purchase', title: 'Purchase' },
  { path: '/reports', title: 'Reports' },
  { path: '/jobwork', title: 'Jobwork' },
  { path: '/quality', title: 'Quality' },
  { path: '/notifications', title: 'Notifications' },
  { path: '/settings', title: 'Settings' },
  { path: '/import', title: 'Import' },
  // Masters
  { path: '/masters/customers', title: 'Customers' },
  { path: '/masters/products', title: 'Products' },
  { path: '/masters/materials', title: 'Materials' },
  { path: '/masters/machines', title: 'Machines' },
  { path: '/masters/colors', title: 'Colors' },
  { path: '/masters/suppliers', title: 'Suppliers' },
  { path: '/masters/brokers', title: 'Brokers' },
  { path: '/masters/charge-types', title: 'Charge Types' },
  { path: '/masters/order-types', title: 'Order Types' },
  { path: '/masters/payment-terms', title: 'Payment Terms' },
  { path: '/masters/warehouses', title: 'Warehouses' },
  { path: '/masters/banks', title: 'Banks' },
  { path: '/masters/staff', title: 'Staff' },
  { path: '/masters/hsn-codes', title: 'HSN' },
  { path: '/masters/units', title: 'Units' },
  { path: '/masters/machine-types', title: 'Machine Types' },
  { path: '/masters/product-types', title: 'Product Types' },
  { path: '/masters/yarn-types', title: 'Yarn Types' },
  { path: '/masters/process-types', title: 'Process' },
  { path: '/masters/operators', title: 'Operators' },
  { path: '/masters/chaal-types', title: 'Chaal' },
  { path: '/masters/packaging-types', title: 'Packaging' },
  { path: '/masters/transports', title: 'Transport' },
  { path: '/masters/quality-parameters', title: 'Quality' },
]

test.describe('All pages render without errors', () => {
  for (const { path, title } of PAGES) {
    test(`${path} — ${title}`, async ({ page }) => {
      const errors = []
      page.on('pageerror', (err) => errors.push(err.message))

      const response = await page.goto(path, { waitUntil: 'networkidle' })
      expect(response.status()).toBeLessThan(400)

      // Page should have visible content (not blank)
      await expect(page.locator('body')).not.toBeEmpty()

      // No JS errors
      expect(errors).toHaveLength(0)

      // Should not show error boundary
      const errorBoundary = page.locator('text=This page failed to render')
      await expect(errorBoundary).not.toBeVisible()
    })
  }
})
