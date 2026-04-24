// ─── PERF MARKS ──────────────────────────────────────────────
// Lightweight timing wrapper for fetch calls. Emits to console in DEV + to
// performance.measure so browser devtools can pick it up.
//
// Use it to confirm where ms go on slow-feeling pages:
//   const data = await perfMark('orders.listPaged', () => ordersDb.listPaged(...))
//
// Zero runtime cost in prod (wraps call, records measure, returns result).
// Does not throw even if `performance` is unavailable (SSR / old browsers).

const BUDGET_MS = {
  fetch: 800,      // anything above this is noteworthy
  render: 200,
}

export async function perfMark(label, fn, { budget = BUDGET_MS.fetch } = {}) {
  if (typeof performance === 'undefined' || !performance.now) return await fn()
  const start = performance.now()
  try {
    const result = await fn()
    const dur = performance.now() - start
    try {
      performance.measure(`perf:${label}`, { start, duration: dur })
    } catch {
      /* performance.measure may not accept options — ignore */
    }
    if (import.meta.env.DEV && dur > budget) {
       
      console.warn(`[perf] ${label} took ${dur.toFixed(0)}ms (budget ${budget}ms)`)
    }
    return result
  } catch (err) {
    const dur = performance.now() - start
    if (import.meta.env.DEV) {
       
      console.warn(`[perf] ${label} FAILED after ${dur.toFixed(0)}ms`, err)
    }
    throw err
  }
}

export const PERF_BUDGET = BUDGET_MS
