# SARAS ERP — Petpooja-Style POS Module

**Date:** 2026-04-28
**Owner:** RPK (RPK Industries, Jaipur)
**Project:** saras-erp-v2
**Status:** Design — approved, awaiting implementation plan

---

## 1. Problem Statement

SARAS ERP v2 today supports the full manufacturing flow (Orders → Production → Dispatch → Invoice). It has no surface for:

1. **Walk-in counter sales** at the Jaipur shop — cash/UPI buyer wants finished goods now, gets a bill, walks out.
2. **Field sales** — salesperson at a customer site capturing an order on a tablet and emitting an invoice on the spot.
3. **Fast-invoice for trading-mode orders** — orders that don't need production/dispatch should bypass the wizard.

A single Petpooja-style POS module covers all three. The cashier UX is a 3-panel touch-friendly register; the data model and DB writes go through the same `invoices` / `payments` tables the existing ERP already uses, so reports, ledgers, and customer balances keep working with no parallel universe.

## 2. Goals & Non-Goals

**Goals**
- ~30-second walk-in sale (cash/UPI, walk-in, no master record required)
- Tablet-friendly register UI for field-sales (mode B)
- "Quick Invoice" button on existing OrderDetail for mode C — one-click invoice from approved trading orders
- Cashier role with locked-down chrome (no ERP modules visible)
- Drawer session lifecycle (open with opening cash, close with reconciliation + Z-report)
- Multi-image gallery per SKU
- Hold/recall, split tender, per-line and per-bill discount, F-key shortcuts
- Thermal 80mm receipt at counter; A4 GST PDF / WhatsApp / Email everywhere
- Soft-warn negative stock — sale is never blocked by stock numbers

**Non-Goals (v1)**
- Offline-first PWA (single-shop, reliable wifi — defer to v2 if outages bite)
- Refunds / void-after-payment flow (handle v1 manually via existing return invoice)
- Multi-shop / multi-outlet (single Jaipur location)
- Loyalty programs, gift cards, store credit issuance
- Card terminal integration via SDK (use simple "Card" tender + reference field for v1)

## 3. Decisions Locked During Brainstorming

| # | Decision | Choice |
|---|---|---|
| 1 | Scope | A+B+C hybrid — counter + field + fast-invoice, shared core |
| 2 | Customer identity | Walk-in default, F2 to switch to registered customer |
| 3 | Tender flow | Split tender with explicit on-account credit option for registered customers |
| 4 | Document type | Cashier toggles per sale: Tax Invoice ↔ Bill of Supply |
| 5 | Product entry method | Mode-dependent — counter defaults to search, field defaults to category grid |
| 6 | Stock blocking | Soft-warn only; show negative stock; never block sale |
| 7 | Receipt formats | Thermal 80mm + A4 PDF + WhatsApp + Email — all four selectable per sale via checkboxes |
| 8 | Hardware | USB thermal at counter (Mode A) via local print bridge; browser print elsewhere |
| 9 | Architecture | Approach #2 — same repo, dedicated `<PosLayout/>` shell, lazy chunk |
| 10 | Visual style | Petpooja-style 3-panel touch UI (category rail · product grid · live bill) |
| 11 | Images | Multiple images per SKU with primary flag; new `product_images` table |

## 4. Architecture

### 4.1 Routes & Layout

```
<LayoutShell>                    ← existing ERP shell (Topbar + Sidebar)
  ├ /dashboard, /orders, /enquiries, /invoices, /masters/*, /reports

<PosLayout>                       ← new shell, no Topbar/Sidebar, full-screen
  ├ /pos             ← register, mode A (counter) — keyboard-driven, dense
  ├ /pos/field       ← register, mode B (field) — tablet-optimised, larger tiles
  ├ /pos/session     ← drawer open / close
  ├ /pos/history     ← today's sales, search, reprint
  └ /pos/exit        ← back to ERP shell
```

- **Mode C (fast invoice from order)** — not a `/pos/*` route. Adds a "Quick Invoice" button to existing `OrderDetail` that opens the same `<CheckoutDrawer>` the POS uses.
- POS chunk lazy-loads via `React.lazy` so ERP boot is unaffected.
- `<ProtectedRoute>` + `PermissionGate` wrap everything; cashier role has only `pos.access`.

### 4.2 Component Map

```
src/modules/pos/
├─ PosLayout.jsx
├─ PosRegisterPage.jsx        ← /pos and /pos/field, mode prop drives layout
├─ PosSessionPage.jsx         ← open/close drawer
├─ PosHistoryPage.jsx
├─ components/
│   ├─ CategoryRail.jsx
│   ├─ ProductGrid.jsx        ← virtualized via @tanstack/react-virtual
│   ├─ ProductTile.jsx        ← image, name, stock badge, price
│   ├─ SearchBar.jsx          ← typeahead (reuses SearchSelect)
│   ├─ CustomerChip.jsx       ← Walk-in pill + F2 switch
│   ├─ BillPanel.jsx          ← live cart, right side
│   ├─ BillLineItem.jsx       ← qty/price/discount/remove
│   ├─ DocTypeToggle.jsx      ← Tax Invoice ↔ Bill of Supply
│   ├─ CheckoutDrawer.jsx     ← split tender + a/b/c/d output checkboxes
│   ├─ HoldRecallSheet.jsx    ← F4 hold + recall list
│   ├─ NumpadOverlay.jsx      ← qty/price entry
│   ├─ ImageGallery.jsx       ← image carousel modal
│   └─ ZReportModal.jsx       ← drawer-close report
├─ hooks/
│   ├─ usePosCart.js          ← cart state, GST split, tender validation
│   ├─ usePosSession.js       ← current session
│   ├─ usePosShortcuts.js     ← F1 search, F2 customer, F3 discount, F4 hold,
│   │                           F8 pay, F12 reprint
│   └─ usePrintBridge.js      ← thermal print helper
├─ lib/
│   ├─ posDb.js               ← createSale / holdSale / recallSale /
│   │                           openSession / closeSession
│   ├─ gstSplit.js            ← reuses existing GST helpers
│   └─ tenderRules.js         ← split-tender sums must equal bill total
└─ print/
    ├─ thermalReceipt80.js    ← ESC/POS template
    └─ a4Invoice.jsx          ← reuses existing React-PDF invoice template
```

**Reused (no new copies):** `products`, `customers`, `hsn_codes`, `warehouses` via `useApp` / `useSWRList`; `invoices` and `payments` tables; `safe()`, `useSWRList`, `useRealtimeTable`; `Modal`, `Button`, `StatusBadge` from UI barrel.

**New external deps:**
- `@tanstack/react-virtual` — virtualized product grid (2,310 SKUs)
- Local print bridge — small Node helper at `localhost:9100` exposing `POST /print` for ESC/POS-over-USB. Optional, Mode A only, ~50 LOC.

## 5. Database

### 5.1 New Tables (5)

```sql
CREATE TABLE pos_terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('counter','field')),
  default_warehouse_id UUID REFERENCES warehouses(id),
  printer_config JSONB,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pos_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  terminal_id UUID NOT NULL REFERENCES pos_terminals(id),
  cashier_id UUID NOT NULL REFERENCES profiles(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_with NUMERIC(12,2) NOT NULL,
  closed_at TIMESTAMPTZ,
  closed_with NUMERIC(12,2),
  expected_cash NUMERIC(12,2),
  variance NUMERIC(12,2),
  notes TEXT
);

CREATE TABLE pos_tenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tender_type TEXT NOT NULL CHECK (tender_type IN ('cash','upi','card','account')),
  amount NUMERIC(12,2) NOT NULL,
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pos_print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  target TEXT NOT NULL CHECK (target IN ('thermal','a4','whatsapp','email')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed')),
  payload JSONB,
  attempts INT DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  thumb_path TEXT,
  is_primary BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX idx_product_images_one_primary
  ON product_images(product_id) WHERE is_primary = true;
```

All tables get RLS-on with `user_id = auth.uid()` policy mirroring `customers` / `products`.

### 5.2 Additive Columns (no destructive migration)

```sql
ALTER TABLE invoices ADD COLUMN source TEXT DEFAULT 'order'
  CHECK (source IN ('order','pos'));
ALTER TABLE invoices ADD COLUMN doc_type TEXT DEFAULT 'tax_invoice'
  CHECK (doc_type IN ('tax_invoice','bill_of_supply'));
ALTER TABLE invoices ADD COLUMN pos_session_id UUID REFERENCES pos_sessions(id);
ALTER TABLE invoices ADD COLUMN held BOOLEAN DEFAULT false;
ALTER TABLE invoices ADD COLUMN hold_label TEXT;

ALTER TABLE payments ADD COLUMN tender_type TEXT
  CHECK (tender_type IN ('cash','upi','card','account'));
```

### 5.3 Storage

New Supabase Storage bucket `product-images`:
- Public-read (CDN-served), authenticated-write
- Auto-resize via Supabase Image Transform on read (`?width=200` for tiles, `?width=800` for gallery)
- Upload UI in `ProductsPage` (masters) — drag-drop with client-side compression to ≤500KB before upload

## 6. Checkout Data Flow

```
[ add to cart ] → F8 / Charge button
       │
       ▼
[ CheckoutDrawer opens ]
       │
       ▼
[ cashier picks: tenders, doc_type, output checkboxes (a/b/c/d) ]
       │
       ▼
[ Confirm → posDb.createSale() — single Postgres RPC, atomic ]
       ├─ INSERT invoices (source='pos', doc_type, pos_session_id, customer_id|null)
       ├─ INSERT invoice_line_items × N
       ├─ INSERT payments × M tenders (tender_type stamped)
       ├─ INSERT pos_tenders × M (rich metadata)
       ├─ UPDATE finished-goods stock (decrement, allowed negative)
       ├─ INSERT pos_print_jobs × selected outputs
       └─ INSERT customer_ledger row when 'account' tender used
       │
       ▼
[ Supabase Realtime broadcasts → other tabs auto-refresh ]
       │
       ├─ PrintBridge subscribes to pos_print_jobs WHERE target='thermal'
       │     → ESC/POS → USB → 80mm thermal receipt
       │
       ├─ A4 → React-PDF render → window.print() OR download
       ├─ WhatsApp → Edge Function generates short link → opens wa.me/?text=
       └─ Email → Edge Function sends via Resend
       │
       ▼
[ cart resets, focus returns to search ]
```

**Hold & recall (F4):** same `createSale` path with `held=true`, no payments, no stock decrement, no print. Recall fetches `invoices WHERE held=true AND pos_session_id=current` and re-hydrates the cart.

**Session lifecycle:**
1. Open — `INSERT pos_sessions (opened_with=₹X)`
2. Sales stamp `pos_session_id` automatically
3. Close — count cash → expected = `opening + Σ(cash tenders) - Σ(cash refunds)` → `UPDATE pos_sessions` → render Z-report

**Atomicity:** `createSale` is a single Postgres function. If any step fails the transaction rolls back, cart stays intact, cashier sees a toast and can retry — no half-printed-no-stock-deducted bugs.

**Idempotency:** RPC takes a client-generated `idempotency_key` UUID. Same key → same invoice id returned. Safe to retry on network drop or button double-tap.

## 7. UX & Layout

Petpooja-style 3-panel layout, identical between mode A and mode B (mode B uses larger tiles for touch):

```
┌──────────────────────────────────────────────────────────────────┐
│ SARAS POS · Cashier RPK · Drawer #1 ₹4,200    [search] [F2 Walk-in] [Hold] [Recall] │
├──────────┬─────────────────────────────────────┬─────────────────┤
│          │                                     │ Bill #POS-0042  │
│ Categories │      Product Grid                 │ Walk-in cash    │
│ All 2,310  │      (4-column virtualized)       │ Doc: Bill of S. │
│ Round Cord │      tile = image · name ·        │ ───────────     │
│ Flat El.   │           stock · price            │ line items …   │
│ Drawcord   │                                    │                 │
│ Rope       │                                    │ Subtotal ₹270  │
│ Shoelace   │                                    │ GST ₹13.50     │
│ Tape       │                                    │ TOTAL ₹283.50  │
│ Other      │                                    │                 │
│            │                                    │ [Cash][UPI]     │
│            │                                    │ [Card][Account] │
│            │                                    │ [CHARGE → BILL] │
└──────────┴─────────────────────────────────────┴─────────────────┘
```

**Petpooja-isms baked in:**
- Hold & recall (F4) for parked bills
- Per-line discount (long-press row) and per-bill discount (footer)
- Discount > 10% prompts a reason code, audit-logged
- Cashier session — open with cash count, close with reconciliation
- Day-end Z-report — sales by tender, by category, GST summary, top 10 SKUs
- Numpad overlay on cart row tap — qty/price/discount with no keyboard
- F12 reprint — last 4 receipts
- Optional customer side-display (deferred until you buy a second monitor)

## 8. Errors & Edge Cases

| Edge case | Handling |
|---|---|
| Network drop mid-sale | Idempotency key on `createSale` — retry safe. UI shows "Saving…" with 30s timeout; cart preserved on failure. |
| Cashier double-taps Charge | Button debounce + idempotency key — no duplicate invoice. |
| Browser closed mid-cart | Cart persisted to `localStorage` keyed by `pos_session_id`; recovered on reopen. |
| Print bridge offline | Red dot in topbar. Sale completes anyway; print job queued. F12 reprint replays. Bridge picks up queued jobs on reconnect. |
| WhatsApp send fails | Copy-link fallback toast. Job marked `failed`, retryable from history. |
| Tender total ≠ bill total | `tenderRules.js` blocks Confirm. Drawer shows red "Short ₹50" / "Over ₹20" badge. |
| Customer swap mid-bill | GST recomputes (intra/inter-state may flip). Account-tender re-validated. |
| Negative stock | Soft warn — red badge. Sale allowed. Logged for daily reconciliation. |
| Discount abuse | > 10% prompts reason code; row inserted into `activity_log` with cashier id. |
| Void after payment | Out of scope v1 — manual return invoice via existing flow. |
| Drawer cash variance | Variance > ₹100 requires manager re-auth at close. Logged. |
| Cashier reaches non-POS route | `PermissionGate` blocks; cashier role has only `pos.access`. |
| Concurrent sales on two terminals | `useRealtimeTable` handles. Hold-recall scoped to terminal session — no collision. |
| Power cut | Last successful sale already in DB; `localStorage` recovers cart. Drawer reconciliation catches cash discrepancy. |

## 9. Permissions

New role: **`cashier`**
- `pos.access` — TRUE
- `pos.session.open` — TRUE
- `pos.session.close` — TRUE (variance > ₹100 requires manager PIN re-auth on the same screen)
- `pos.discount.line` — TRUE
- `pos.discount.bill` — TRUE (with reason code)
- `pos.bill.hold` — TRUE
- `pos.bill.void` — FALSE (manager only)
- All other ERP permissions — FALSE

Existing **`admin`** role gets every new permission by default.

## 10. Testing

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | `usePosCart` (add/remove/qty/discount/totals), `gstSplit` (intra/inter-state, IGST), `tenderRules` (sum-must-match, on-account requires registered) |
| Integration | Vitest + Supabase test DB | `createSale` RPC: 1 tender · split · on-account · held · failure-rollback. Verify invoices/payments/pos_tenders/stock flip atomically. |
| E2E | Playwright | Open drawer → walk-in cash sale → split UPI+cash sale → registered on-account sale → hold/recall → close drawer → Z-report. One run per mode. |
| Visual | Playwright screenshots | ProductGrid virtualization at 1200/2310 SKUs · ImageGallery carousel · CheckoutDrawer responsive (1024 / 1440 / 768) |
| Manual | Real thermal printer | One-time pre-launch: physical 80mm receipt, drawer kick (ESC/POS open-cash-drawer command), ESC/POS encoding (₹ symbol) |
| Coverage gate | 80% on `usePosCart` + `posDb` + `gstSplit` + `tenderRules`. UI components covered by visual regression. |

## 11. Out of Scope (v2 candidates)

- Offline-first PWA with IndexedDB sync
- Refund / void-after-payment workflow
- Multi-outlet / multi-shop support
- Loyalty programs, gift cards, store credit
- Card terminal SDK integration
- Customer side display
- Voice / barcode-scanner input

## 12. Acceptance Criteria

A walk-in cash sale on the deployed Vercel URL completes in < 30 seconds with: search → add 3 SKUs → F8 → Cash → Confirm → thermal receipt printed + invoice row in DB + stock decremented + audit log written + cart resets.

A field-sales tablet sale on `/pos/field` completes in < 60 seconds with: pick category → tap 3 product tiles → F2 → pick registered customer → F8 → split UPI+Account → Confirm → A4 PDF + WhatsApp link sent + ledger row inserted.

A "Quick Invoice" click on an existing approved trading order opens the same CheckoutDrawer pre-populated and emits a tax invoice within 10 seconds.
