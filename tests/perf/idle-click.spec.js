// Post-idle click lag regression test
//
// Runs headless against PROD_URL (defaults to live Vercel URL). Measures:
//   1. Dashboard cold load time (TTFB → load event)
//   2. Click Orders → render time
//   3. Click Enquiries → render time
//   4. Simulated "expired JWT + click" — the scenario that regressed
//
// Emits ONE JSON line to stdout per run. The GitHub Action captures stdout,
// appends to perf-log.ndjson, and compares to rolling median.
//
// Requires SARAS_TEST_EMAIL + SARAS_TEST_PASSWORD env vars for authenticated
// runs. Without them, only the public landing is measured.

import { test, expect } from '@playwright/test'

const PROD_URL = process.env.PROD_URL || 'https://saras-erp-v2-rebuild.vercel.app'
const EMAIL = process.env.SARAS_TEST_EMAIL
const PASSWORD = process.env.SARAS_TEST_PASSWORD
const SUPABASE_URL_RE = /kcnujpvzewtuttfcrtyz\.supabase\.co/

const metrics = {
  timestamp: new Date().toISOString(),
  commit: process.env.GITHUB_SHA || 'local',
  branch: process.env.GITHUB_REF_NAME || 'local',
  prod_url: PROD_URL,
  authenticated: false,
  dashboard_load_ms: null,
  orders_click_ms: null,
  enquiries_click_ms: null,
  post_idle_orders_ms: null,
  expired_jwt_orders_ms: null,
  token_refreshes_in_post_idle: null,
  errors: [],
}

test('post-idle perf monitor', async ({ page }) => {
  page.on('pageerror', (err) => metrics.errors.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') metrics.errors.push(`console: ${msg.text().slice(0, 200)}`)
  })

  // ─── Phase 1: Dashboard cold load ───────────────────────
  const t0 = Date.now()
  await page.goto(PROD_URL, { waitUntil: 'load' })
  metrics.dashboard_load_ms = Date.now() - t0

  if (!EMAIL || !PASSWORD) {
    // No creds — just emit what we have
    console.log(JSON.stringify(metrics))
    return
  }

  // ─── Phase 2: Log in ────────────────────────────────────
  // Look for email / password inputs if we're on a login page
  const emailInput = page.locator('input[type="email"], input[name="email"]').first()
  if (await emailInput.count()) {
    await emailInput.fill(EMAIL)
    await page.locator('input[type="password"]').first().fill(PASSWORD)
    await Promise.all([
      page.waitForURL((u) => u.pathname === '/' || u.pathname === '/dashboard', { timeout: 30000 }),
      page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Log in")').first().click(),
    ])
  }
  metrics.authenticated = true

  // Wait for Dashboard to actually render
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })

  // ─── Phase 3: Warm Orders click ─────────────────────────
  const tOrders = Date.now()
  await page.locator('a[href="/orders"]').first().click()
  await page.waitForURL('**/orders', { timeout: 15000 })
  await expect(page.locator('h1', { hasText: /orders/i })).toBeVisible({ timeout: 10000 })
  metrics.orders_click_ms = Date.now() - tOrders

  // Back to Dashboard
  await page.goto(`${PROD_URL}/`, { waitUntil: 'networkidle' })

  // ─── Phase 4: Warm Enquiries click ──────────────────────
  const tEnq = Date.now()
  await page.locator('a[href="/enquiries"]').first().click()
  await page.waitForURL('**/enquiries', { timeout: 15000 })
  await expect(page.locator('h1', { hasText: /enquir/i })).toBeVisible({ timeout: 10000 })
  metrics.enquiries_click_ms = Date.now() - tEnq

  // ─── Phase 5: Simulate EXPIRED JWT + Orders click ───────
  // This is the scenario that regressed. We corrupt the access_token in
  // localStorage (exactly what Chrome's background-tab throttling produces)
  // and measure click-to-data.
  await page.goto(`${PROD_URL}/`, { waitUntil: 'networkidle' })

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
    if (!key) return
    const parsed = JSON.parse(localStorage.getItem(key))
    if (parsed.expires_at) parsed.expires_at = Math.floor(Date.now() / 1000) - 60
    if (parsed.currentSession?.expires_at) parsed.currentSession.expires_at = Math.floor(Date.now() / 1000) - 60
    const bad = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJleHBpcmVkIiwiZXhwIjoxfQ.xxx'
    if (parsed.access_token) parsed.access_token = bad
    if (parsed.currentSession?.access_token) parsed.currentSession.access_token = bad
    localStorage.setItem(key, JSON.stringify(parsed))
    // Also clear all session caches so we force re-fetches
    for (const sk of Object.keys(sessionStorage)) sessionStorage.removeItem(sk)
  })

  // Track Supabase requests
  const supabaseRequests = []
  page.on('request', (req) => {
    if (SUPABASE_URL_RE.test(req.url())) supabaseRequests.push({ url: req.url(), start: Date.now() })
  })

  const tExpired = Date.now()
  await page.locator('a[href="/orders"]').first().click()
  await page.waitForURL('**/orders', { timeout: 15000 })
  await expect(page.locator('h1', { hasText: /orders/i })).toBeVisible({ timeout: 10000 })
  // Wait a moment for any trailing requests
  await page.waitForTimeout(500)
  metrics.expired_jwt_orders_ms = Date.now() - tExpired
  metrics.post_idle_orders_ms = metrics.expired_jwt_orders_ms
  metrics.token_refreshes_in_post_idle = supabaseRequests.filter((r) => r.url.includes('/auth/v1/token')).length

  // Emit single JSON line for the workflow to capture
  console.log(JSON.stringify(metrics))
})
