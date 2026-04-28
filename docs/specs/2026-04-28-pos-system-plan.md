# SARAS POS — Implementation Plan

**Spec:** `docs/specs/2026-04-28-pos-system-design.md`
**Branch target:** `v2-rebuild`
**Lag-protection contract:** `useSWRList`, `AppContext`, `db/core`, `authGate`, `Topbar`, `App` md5s must remain unchanged across every phase.

---

## Phase 0 — Prerequisites (½ day)

| Action | Detail |
|---|---|
| Add deps | `npm i @tanstack/react-virtual` |
| Create Supabase Storage bucket | `product-images` — public read, authenticated write |
| Document bucket policies | new file `supabase/storage-policies.sql` |
| Add `pos.access` to permission catalog | `src/lib/permissions.js` (or wherever existing roles live) |
| Add `cashier` role seed | migration to insert role row |

**Done when:** `npm run build` green; bucket visible in Supabase dashboard; `pos.access` constant exported.

**Risk:** Bucket name collision. Mitigation: prefix with `saras-` if needed.

---

## Phase 1 — DB schema (1 day)

| File | Change |
|---|---|
| `supabase/migrations/2026-04-28T0000_pos_tables.sql` | CREATE TABLE × 5 (pos_terminals, pos_sessions, pos_tenders, pos_print_jobs, product_images), all CHECK constraints, RLS policies mirroring existing `customers` pattern |
| `supabase/migrations/2026-04-28T0001_pos_invoice_columns.sql` | ALTER invoices ADD source/doc_type/pos_session_id/held/hold_label; ALTER payments ADD tender_type |
| `supabase/migrations/2026-04-28T0002_pos_seed.sql` | Seed one default `pos_terminals` row per existing user (mode='counter'), seed cashier role |
| `src/lib/db.js` | Wire the 5 new tables through existing `createTable()` factory |

**Acceptance:**
- Migrations apply clean on local + staging Supabase.
- `select * from pos_terminals` returns 1 row per active user.
- Existing `invoices` queries unaffected (defaults preserve current behaviour — `source='order'`, `doc_type='tax_invoice'`, `held=false`).

**Risk:** RLS policy bug locks out admin. Mitigation: test with both admin + cashier role accounts before phase 2.

---

## Phase 2 — `createSale` Postgres RPC (1.5 days) **CRITICAL PATH**

| File | Change |
|---|---|
| `supabase/migrations/2026-04-28T0003_create_sale_rpc.sql` | Single PL/pgSQL function `pos_create_sale(payload jsonb, idempotency_key uuid) returns uuid`. All 7 steps from spec §6 in one transaction. Returns invoice_id. |
| `src/modules/pos/lib/posDb.js` | JS wrapper `createSale(payload, idempotencyKey)` → `safe(supabase.rpc('pos_create_sale', …))` |

**Acceptance:**
- Vitest integration test against Supabase test DB:
  - Single-tender sale → 1 invoice + 1 payment + 1 pos_tender + N invoice_line_items + stock decremented
  - Split tender (cash + UPI) → 1 invoice + 2 payments + 2 pos_tenders
  - On-account tender → ledger row inserted
  - Held bill (held=true) → no payments, no stock decrement, no print jobs
  - Same idempotency_key replayed → returns same invoice_id, no dup rows
  - Forced failure (e.g. invalid customer_id) → no rows in any table
- One transaction per sale — verified via `pg_stat_statements`.

**Risk:** Trigger interaction with existing `auto_log_activity` could cause partial commit. Mitigation: explicitly handle activity log inside the RPC.

---

## Phase 3 — Product images (1 day)

| File | Change |
|---|---|
| `src/modules/masters/components/ProductImageUpload.jsx` | NEW — drag-drop zone, client-side resize via `browser-image-compression` to ≤500KB, upload to bucket, INSERT product_images row |
| `src/modules/masters/components/ProductImageGallery.jsx` | NEW — list/reorder/set-primary/delete |
| `src/modules/masters/ProductsPage.jsx` | Embed gallery into product detail modal |
| `src/lib/db.js` | `productImages.list(productId)`, `setPrimary(id)`, `remove(id)` |

**Acceptance:**
- Upload 3 images for one SKU → all visible in gallery, first one auto-marked primary.
- Set image #2 primary → uniqueness index flips.
- Delete primary → next image becomes primary automatically (DB trigger or app-side fallback).

**Risk:** Storage quota. Mitigation: enforce 500KB cap client-side; warn at 80% bucket usage.

---

## Phase 4 — PosLayout shell + routing + permissions (1 day)

| File | Change |
|---|---|
| `src/modules/pos/PosLayout.jsx` | NEW — full-screen, no Topbar/Sidebar, Esc → /dashboard, online/offline/print-bridge status pill |
| `src/modules/pos/PosRegisterPage.jsx` | NEW — placeholder shell, mode prop |
| `src/modules/pos/PosSessionPage.jsx` | NEW — placeholder |
| `src/modules/pos/PosHistoryPage.jsx` | NEW — placeholder |
| `src/App.jsx` | Add 4 lazy routes wrapped in `<PosLayout>` + `<PermissionGate perm="pos.access">` (additive — no changes to existing routes; lag-md5 unchanged because new routes are appended, not edited inside existing tree — verify) |
| `src/lib/permissions.js` | Add `pos.*` permissions |

**Acceptance:**
- Login as admin → sidebar shows new "POS" entry → click → register page renders blank shell with topbar pill.
- Login as cashier → only `/pos/*` routes accessible; everything else redirects to `/pos`.
- `Esc` from `/pos` → returns to dashboard for admin, blocks for cashier.
- Lag md5 baseline still matches for the 6 protected files.

**Risk:** Adding routes to App.jsx changes its md5. Mitigation: route additions go inside an existing children block and the surrounding ProtectedRoute — re-baseline App.jsx md5 after Phase 4 lands and lock the new value.

---

## Phase 5 — Cart hook + GST split + tender rules (1 day)

| File | Change |
|---|---|
| `src/modules/pos/hooks/usePosCart.js` | NEW — Reducer-based: ADD/REMOVE/UPDATE_QTY/UPDATE_PRICE/LINE_DISCOUNT/BILL_DISCOUNT/SET_CUSTOMER/CLEAR. Persists to `localStorage` keyed by session_id. |
| `src/modules/pos/lib/gstSplit.js` | NEW — wraps existing GST helper from `src/lib/money.js` (or extracts it). Pure fn: `(lines, customerStateCode, ourStateCode) → { cgst, sgst, igst, total }` |
| `src/modules/pos/lib/tenderRules.js` | NEW — pure fn: `validate(tenders, billTotal, customerType) → { ok, errors }`. Sum equality, on-account requires registered, max one tender per type unless config allows. |

**Acceptance (Vitest unit, 80% coverage on these 3 files):**
- 20+ unit tests covering each reducer action, GST flip on customer-state change, tender validation paths.
- localStorage round-trip preserves cart across reload.

---

## Phase 6 — PosRegisterPage core UI (2 days)

| File | Change |
|---|---|
| `src/modules/pos/components/CategoryRail.jsx` | NEW |
| `src/modules/pos/components/ProductGrid.jsx` | NEW — virtualized via @tanstack/react-virtual |
| `src/modules/pos/components/ProductTile.jsx` | NEW — image (lazy from product_images primary), stock badge (green/amber/red), price |
| `src/modules/pos/components/SearchBar.jsx` | NEW — typeahead, debounced |
| `src/modules/pos/components/CustomerChip.jsx` | NEW — Walk-in / registered pill, F2 modal |
| `src/modules/pos/components/BillPanel.jsx` | NEW — live cart from usePosCart |
| `src/modules/pos/components/BillLineItem.jsx` | NEW — qty/price tap → NumpadOverlay |
| `src/modules/pos/components/DocTypeToggle.jsx` | NEW |
| `src/modules/pos/PosRegisterPage.jsx` | Compose 3-panel layout, mode-prop driven (counter dense vs field large tiles) |

**Acceptance:**
- Render 2,310 SKUs in grid → scroll smooth at 60fps (verified via React DevTools Profiler).
- Tap product → cart updates, GST recomputes.
- Switch customer → GST flips intra/inter-state correctly.
- Toggle doc type → label updates in BillPanel header.
- Lighthouse Performance score ≥ 85 on `/pos` (matches rest of app).

---

## Phase 7 — CheckoutDrawer + tender flow + outputs (1.5 days)

| File | Change |
|---|---|
| `src/modules/pos/components/CheckoutDrawer.jsx` | NEW — split tender UI, 4 tender buttons + Add-tender, output checkboxes (a/b/c/d), confirm button calls `posDb.createSale()` with idempotency key |

**Acceptance:**
- Walk-in cash sale: F8 → Cash → Confirm → 1 invoice + receipt printed (or queued) + cart resets.
- Split UPI+Cash: tender total enforced; "Short ₹X" badge if mismatch.
- On-account tender disabled when customer is walk-in.
- Idempotency: simulate 500 error after RPC starts → retry with same key → no dup invoice.

---

## Phase 8 — Hold/Recall, Numpad, Keyboard shortcuts (1 day)

| File | Change |
|---|---|
| `src/modules/pos/components/HoldRecallSheet.jsx` | NEW |
| `src/modules/pos/components/NumpadOverlay.jsx` | NEW |
| `src/modules/pos/hooks/usePosShortcuts.js` | NEW — F1 search, F2 customer, F3 discount, F4 hold, F8 pay, F12 reprint, Esc exit |
| `src/modules/pos/lib/posDb.js` | Add `holdSale`, `recallSale`, `voidHeld` methods |

**Acceptance:**
- F4 holds a 3-line cart → cart clears → recall returns identical lines + customer.
- F1 focuses search; F2 opens customer modal; F8 opens checkout — no browser default fires (Chrome F1=help override needed).

---

## Phase 9 — Session lifecycle + Z-report (1 day)

| File | Change |
|---|---|
| `src/modules/pos/PosSessionPage.jsx` | Open drawer (cash count input) + close drawer (count + reconcile + Z-report) |
| `src/modules/pos/components/ZReportModal.jsx` | NEW — by-tender, by-category, GST summary, top 10 SKUs |
| `src/modules/pos/hooks/usePosSession.js` | NEW |
| `src/modules/pos/lib/posDb.js` | `openSession`, `closeSession`, `currentSession` |

**Acceptance:**
- Open drawer with ₹4,200 → run 5 sales (mix of tenders) → close drawer counts cash → expected vs counted variance < ₹1.
- Z-report renders with correct numbers; downloads as PDF.
- Variance > ₹100 prompts manager PIN re-auth (mock for now; wire real check in v1.1).

---

## Phase 10 — Print bridge + receipt formats (1.5 days)

| File | Change |
|---|---|
| `tools/print-bridge/server.js` | NEW — Node helper at localhost:9100, watches Supabase `pos_print_jobs WHERE target='thermal' AND status='pending'`, writes ESC/POS over USB. ~80 LOC. |
| `tools/print-bridge/README.md` | NEW — setup, autostart on Windows |
| `src/modules/pos/print/thermalReceipt80.js` | NEW — ESC/POS template builder |
| `src/modules/pos/print/a4Invoice.jsx` | Reuse `src/modules/invoicing/InvoicePDF.jsx` (already exists for order-driven invoices) |
| `src/modules/pos/hooks/usePrintBridge.js` | NEW — health-check endpoint, status pill |
| Edge functions | `pos-send-whatsapp` + `pos-send-email` — small Supabase Edge functions (Resend for email, wa.me link for WhatsApp) |

**Acceptance:**
- Real thermal printer plugged in → bridge running → sale → physical 80mm receipt prints with ₹ symbol, drawer kicks open.
- WhatsApp checkbox → wa.me link opens with pre-filled message + invoice URL.
- Email checkbox → Resend delivers PDF attachment to customer email within 30s.
- Bridge offline → red dot in topbar; sale still completes; F12 reprint replays job after bridge reconnects.

**Risk:** ESC/POS encoding for ₹ varies by printer. Mitigation: fall back to "Rs." string on encoding error.

---

## Phase 11 — Mode C: Quick Invoice button (½ day)

| File | Change |
|---|---|
| `src/modules/orders/OrderDetail.jsx` | Add "Quick Invoice" button (visible only for trading-mode orders in approved state); opens `<CheckoutDrawer>` pre-populated from order line items |

**Acceptance:**
- Open a trading-mode order → click Quick Invoice → drawer shows full cart pre-filled → cashier picks tender → Confirm → invoice created with `source='pos'` and linked to the order via `order_id`.
- Production / dispatch flow for non-trading orders unaffected.

---

## Phase 12 — Tests (1 day)

| File | Change |
|---|---|
| `src/modules/pos/__tests__/usePosCart.test.js` | unit, ≥ 80% coverage |
| `src/modules/pos/__tests__/gstSplit.test.js` | unit |
| `src/modules/pos/__tests__/tenderRules.test.js` | unit |
| `src/modules/pos/__tests__/posDb.integration.test.js` | RPC integration |
| `e2e/pos-counter.spec.js` | Playwright — full counter journey |
| `e2e/pos-field.spec.js` | Playwright — full field journey |
| `e2e/pos-quick-invoice.spec.js` | Playwright — Mode C |

**Acceptance:** all green in CI; Playwright artifacts uploaded; coverage report ≥ 80% on the four critical files.

---

## Phase 13 — Deploy + verification (½ day)

| Step | Detail |
|---|---|
| Lag md5 final check | Re-baseline 6 protected files after Phase 4 routing edits; re-verify after each subsequent phase. |
| Vercel preview | Push to v2-rebuild → preview URL → smoke-test all 3 modes via Chrome MCP |
| Production rollout | Merge to main; gate behind `pos.access` permission; admin enables for cashier accounts manually for the first week |
| Monitor | Daily check on `pos_print_jobs` failure rate, `pos_sessions` variance distribution, `createSale` p95 latency |

**Done when:**
- Walk-in cash sale on deployed Vercel completes < 30s with thermal receipt.
- Field-sales tablet sale on deployed Vercel completes < 60s with WhatsApp link.
- Quick Invoice from existing order completes < 10s.
- Lag-critical md5s match baseline.
- Zero regressions on existing Orders / Production / Dispatch / Invoicing flows.

---

## Critical Path

`Phase 0 → 1 → 2 → 4 → 5 → 6 → 7 → 13`

Phases 3, 8, 9, 10, 11, 12 can fan out in parallel after Phase 5 lands (separate developers / sessions).

## Total Estimate

**13 days** of focused single-developer work end-to-end.
**8 days** if Phases 3, 8, 10, 11, 12 are parallelised.

## Rollback

Each phase is its own commit on `v2-rebuild`. Bad phase → `git revert` of that phase's commits. The additive-only DB migrations make Phase 1 / 2 / 3 trivially reversible (DROP COLUMN, DROP TABLE in reverse migration files, both already authored as part of phase 1).
