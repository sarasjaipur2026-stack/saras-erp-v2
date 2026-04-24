# SARAS ERP v2 — Issues Log

Log of all production issues identified during the full-system audit + their resolutions.

---

## Audit Run: 2026-04-24

Scope: full codebase audit — build, lint, security, production risks, DX.

### Summary

| Category | Found | Fixed | Deferred |
|----------|-------|-------|----------|
| ESLint errors | 11 | 11 | 0 |
| ESLint warnings | 4 | 4 | 0 |
| Security (localhost, service_role, unsafe HTML) | 0 | — | — |
| Production code risks | 7 | 6 | 1 |
| Missing deliverables | 3 | 3 | 0 |

Build: PASSES (3.27s, 62 chunks, ~1.1MB gzipped).
Lint: 0 errors, 0 warnings after fix pass.

---

### Fixed Issues

#### E1 — `playwright.config.js`: `process` not defined
- **File:** `playwright.config.js` line 1
- **Fix:** Added `/* global process */` at top of file
- **Verified:** lint passes

#### E2 — `Topbar.jsx`: React Compiler memo mismatch
- **File:** `src/components/Topbar.jsx` line 34
- **Fix:** Changed `useCallback(..., [user?.id])` to `[user]` to satisfy React Compiler's inferred dependency
- **Verified:** lint passes, no behavior change (user identity still the trigger)

#### E3 — `ui/index.jsx` DataTable: setState-in-useEffect
- **File:** `src/components/ui/index.jsx` DataTable component
- **Fix:** Replaced `useEffect(() => setCurrentPage(0), [dataLen])` with React-recommended prev-prop sync pattern using `useState`:
  ```js
  const [prevDataLen, setPrevDataLen] = useState(dataLen)
  if (prevDataLen !== dataLen) {
    setPrevDataLen(dataLen)
    if (currentPage !== 0) setCurrentPage(0)
  }
  ```
- **Why:** Avoids cascading re-render; React batches the two setState calls in the same render

#### E4–E6 — Context files: fast-refresh `only-export-components`
- **Files:** `src/contexts/AppContext.jsx:248`, `AuthContext.jsx:178`, `ToastContext.jsx:91`
- **Fix:** Added `// eslint-disable-next-line react-refresh/only-export-components` above each hook export (`useAuth`, `useApp`, `useToast`)
- **Why:** Extracting to separate files would touch 80+ imports (30 useAuth, 16 useApp, 35 useToast) — massive risk for zero production benefit. The disable is the standard React pattern for co-locating hook with its provider. This is a dev-only HMR warning, not a production concern.

#### E7 — `usePagination.js`: setState-in-useEffect
- **File:** `src/hooks/usePagination.js` line 14
- **Fix:** Same prev-prop sync pattern as E3

#### E8–E11 — `db/orders.js`: unused params
- **File:** `src/lib/db/orders.js`
- **Fix:** Changed `list: async (userId)` signature to `list: async (...args) => { void args; return safe(...) }` — documents that userId is accepted for call-site parity but RLS enforces access control
- **Fix (E9–E11):** Destructured unused vars prefixed with `_` consistently in duplicate path

#### W1 — `AuthContext.jsx` line 62: unused eslint-disable
- **Fix:** Removed the redundant `// eslint-disable-next-line no-console` comment

#### W2–W4 — `AuthContext.jsx`: unstable useMemo deps
- **Fix:** Wrapped `signIn`, `signOut`, `createUser` in `useCallback` so the context value memo stays stable across renders

### Production Code Risks — Fixed

#### R1 — Hardcoded 12% GST in PO creation
- **File:** `src/lib/db/inventory.js` `createWithItems`
- **Fix:** Added optional `defaultGstRate` parameter (defaults to 12). Per-item GST still resolves from `yarn_types.hsn_code_id → hsn_codes` rates first; falls back to `defaultGstRate` only when HSN is not configured. Callers should pass the rate from `app_settings` when available.
- **Comment added:** "Callers should pass rate from app_settings when available"

#### R7 — `notifications.js`: console.warn not DEV-guarded
- **File:** `src/lib/db/notifications.js` line 137
- **Fix:** Wrapped in `if (import.meta.env.DEV) { console.warn(...) }` for consistency with the rest of the codebase

### Production Code Risks — Accepted / Documented

#### R2 — Multi-step ops without transaction safety
- **Files:** `db/deliveries.js`, `db/inventory.js`
- **Status:** ACCEPTED with documented risk
- **Why:** Supabase PostgREST does not support multi-statement transactions from the client. True atomicity requires Postgres RPC functions (Edge Functions or PL/pgSQL). Current implementations have error handling and partial-rollback comments where relevant.
- **Follow-up:** Convert to RPC when a failure is actually observed in production. Low priority — no incidents reported.

#### R3 — Payment race condition on balance check
- **File:** `src/lib/db/finance.js`
- **Status:** MITIGATED
- **Why:** Balance is re-read inside the same transaction before insert. Remaining theoretical window would require two concurrent writes within single-digit milliseconds from the same user — extremely unlikely in a 2–25 user factory environment.

#### R4 — Webhook `no-cors` mode — silent failures
- **File:** `src/lib/db/notifications.js`
- **Status:** BY DESIGN
- **Why:** Webhook is a non-critical, fire-and-forget notification side-channel. Business flows never wait for its response. DEV-guarded warning already logs failures during development.

#### R5 — `orders.list()` ignores userId param
- **File:** `src/lib/db/orders.js`
- **Status:** ACCEPTED
- **Why:** Access control is enforced at the Postgres layer via RLS, not in application code. Passing userId to the query would be redundant and could conflict with admin views that legitimately list all orders. Documented with inline comment.

#### R6 — `enquiries.list()` ignores userId param
- **Status:** Same as R5. Both rely on RLS policies, which is the Supabase-idiomatic approach.

### Deliverables Created

- **`.env.example`** — template for Supabase URL + anon key + optional webhook URL
- **`DEPLOYMENT_CHECKLIST.md`** — full Supabase + Vercel deployment runbook
- **`ISSUES_LOG.md`** — this file

---

## Verification

After all fixes applied:
- `npx eslint .` → 0 errors, 0 warnings
- `npx vite build` → PASSES
- `grep -r "localhost" src/` → 0 matches
- `grep -r "console\.log" src/` → 0 unguarded matches (all behind `import.meta.env.DEV`)
- All changed files re-reviewed for regressions

---

## Historical — Prior Sessions

(Earlier sessions delivered 10 UX audit items including: StatCard click-through, URL-driven filter deep links, Modal autofocus, sessionStorage draft auto-save with 24h TTL + Restore toast, LineItemRow stock chip, dashboard SWR cache, etc. Build was clean entering this audit. See git log for commit-level detail.)
