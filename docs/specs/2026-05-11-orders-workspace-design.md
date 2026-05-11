# SARAS ERP — Orders Workspace (Sub-project 1)

**Date:** 2026-05-11
**Owner:** RPK (RPK Industries, Jaipur)
**Project:** saras-erp-v2
**Branch target:** v2-rebuild
**Status:** Design — approved, awaiting implementation plan
**Predecessor:** Shell sub-project 0 (`docs/specs/2026-05-09-erp-shell-design.md` · shipped 2026-05-11)

---

## 1. Problem Statement

The Orders module is the most-used non-POS surface in SARAS ERP. Today it has three pages, ~3,900 LOC total:

| Surface | File | Size | Today's UX issue |
|---|---|---|---|
| List | `OrdersPage.jsx` | 847 LOC | flat table; no spatial context cards; click an order → leave the list, lose your place |
| Detail | `OrderDetail.jsx` | 624 LOC | linear scroll; jump-between-sections is slow; status-gated actions hidden in a dropdown |
| Wizard | `OrderForm.jsx` + steps | ~1,800 LOC | 4-step wizard tax for simple 1-line orders; "Next → Next → Save" 3 clicks of friction per order |

The shell sub-project 0 (shipped 2026-05-11) gave us the primitives — `<ShellShell>`, `<TopbarV2>`, `<CommandPaletteV2>`, status pills, `<BottomSheet>`. This sub-project applies them to all three Orders surfaces.

## 2. Goals & Non-Goals

**Goals**
- 3-panel workspace on `/orders` (filters · table · selected-order context stack)
- Tabbed `/orders/:id` detail page with 6 tabs (Overview · Production · Dispatch · Invoice · Payments · Activity), customer card + status-gated quick actions pinned in context
- Smart progressive wizard at `/orders/new` and `/orders/:id/edit` — required fields visible, optional sections behind `+ Add X` buttons; reduces friction for the 80% case (one customer, 1-3 lines, no discount)
- Phone parity — every screen usable at 320px width via existing shell responsive ladder
- Real-time updates — another user's status change reflects in <1s
- URL-linked state — filters and active tab survive refresh
- Save discipline — draft auto-saved to localStorage; concurrent-edit conflict prompts before overwrite

**Non-Goals**
- Kanban view (Q2 = A, table only)
- DB schema changes — entirely client-side refactor
- Per-module wizard for Enquiries (separate sub-project)
- Bulk-edit framework (out of scope; only bulk-approve via row checkboxes)
- POS module touches — unchanged

## 3. Decisions Locked During Brainstorming

| # | Decision | Choice |
|---|---|---|
| 1 | Scope | B — All three surfaces (list + detail + wizard) |
| 2 | List layout | A — Table only (kanban deferred; doesn't scale to 3,000+ orders) |
| 3 | List context panel | D — Stacked: mini-summary + customer card + activity feed |
| 4 | Detail layout | A — Tabbed navRail (6 tabs); customer card pinned in context |
| 5 | Wizard shape | D — Smart progressive (required + `+ Add` for optional) |
| 6 | Architecture | #2 — Side-by-side new module (`orders-v2/`); legacy → `orders.legacy/` |

## 4. Architecture

### 4.1 Route map (no path changes)

```
/orders                → OrdersV2Page
/orders/new            → OrderWizardV2 (create mode)
/orders/:id            → OrderDetailV2
/orders/:id/edit       → OrderWizardV2 (edit mode)
```

App.jsx swaps 4 route elements (single planned re-baseline).

### 4.2 File map

```
src/modules/orders-v2/
├── OrdersV2Page.jsx
├── OrderDetailV2.jsx
├── OrderWizardV2.jsx
├── tabs/
│   ├── OverviewTab.jsx
│   ├── ProductionTab.jsx
│   ├── DispatchTab.jsx
│   ├── InvoiceTab.jsx
│   ├── PaymentsTab.jsx
│   └── ActivityTab.jsx
├── panels/
│   ├── OrdersFilters.jsx          (navRail for list)
│   ├── OrderMiniSummary.jsx
│   ├── CustomerCardCompact.jsx
│   ├── ActivityFeedCompact.jsx
│   └── DetailHeader.jsx
├── wizard/
│   ├── CustomerPicker.jsx
│   ├── LineItemRow.jsx
│   ├── DiscountSection.jsx
│   ├── ChargesSection.jsx
│   ├── PaymentTermsSection.jsx
│   ├── GstOverrideSection.jsx
│   ├── NotesSection.jsx
│   ├── DeliveryDatesSection.jsx
│   └── ReviewBar.jsx               (sticky footer with totals + Save)
└── hooks/
    ├── useOrdersList.js
    ├── useOrderDetail.js
    └── useOrderWizard.js

src/modules/orders/                 RENAMED to src/modules/orders.legacy/
└── *.legacy.jsx                    preserved for rollback
```

### 4.3 Reuse — shell + DB

- `<ShellShell>`, `<TopbarV2>`, `<CommandPaletteV2>`, `<BottomSheet>`, `<SearchResultDrawer>` from shell sub-project
- `<DataTable>`, `<StatusBadge>`, `<Modal>`, `<SearchSelect>`, `<Button>` from UI barrel
- `useSWRList`, `useRealtimeTable`, `safe()`, `useApp()`, `useAuth()` — unchanged
- `orders.list / get / create / update`, `customers.checkCustomerCredit`, `generate_order_number` — unchanged

### 4.4 Lag-protection contract

```
5f7095…  useSWRList.js          MUST NOT CHANGE
b97f41…  AppContext.jsx         MUST NOT CHANGE
8d1216…  db/core.js             MUST NOT CHANGE
8a49a0…  authGate.js            MUST NOT CHANGE
4aa7f8…  Topbar.legacy.jsx      MUST NOT CHANGE
fa5532…  App.jsx                may re-baseline once (Phase 4 route swap)
```

## 5. List page (`/orders`)

`<ShellShell>` with all three slots filled.

### 5.1 navRail — filters

- **Search box** — debounced 250ms; full-text on order number + customer firm name
- **Status chips** — multi-select with counts: Draft · Booking · Approved · Production · QC · Dispatch · Completed · Cancelled
- **Date strip** — Today · This Week · This Month · Custom range
- **Saved searches** — per-user `profiles.preferences.orders_saved_searches` JSONB. "+ Save current" preserves URL params under a label.

All filter state URL-linked (`?status=...&date=...&q=...&saved=...`).

### 5.2 centre — table

- Columns: # · customer · status badge · grand total · delivery date · age
- Click row → selects → context panel fills
- Double-click OR `Cmd+Enter` → opens `/orders/:id`
- Multi-select via checkboxes → bulk toolbar (Approve all · Export · Cancel)
- Real-time via `useRealtimeTable('orders', ...)`
- 50 rows / page; sort by header click

### 5.3 context — stacked

When row selected:

1. **Mini summary** — order # · customer · status · grand total · key dates · quick-action buttons (Approve · Cancel · Convert to Production · Generate Invoice — status-gated)
2. **Customer card compact** — firm · phone · GSTIN · credit balance · overdue days · count of open orders. Tap → `<SearchResultDrawer>` peek.
3. **Activity feed compact** — last 5 events. "View all" → Activity tab of detail page.

When nothing selected: empty-state "Pick an order or `>new order` in Cmd+K".

### 5.4 Mobile

- navRail collapses to "🔍 Filter" tab
- context becomes `<BottomSheet>` on row tap
- Table compresses to 2 columns (# + status badge), rest tap-expand

### 5.5 Keyboard

`/` or `Cmd+K` palette · `↑↓` row nav · `Enter` show context · `Cmd+Enter` open detail · `F3` jump to filter search

## 6. Detail page (`/orders/:id`)

### 6.1 Sticky header (`<DetailHeader>`)

- Order # · status badge · customer · grand total
- Actions on right: Edit · Duplicate · Print · "..." (Cancel · Delete · Export PDF)
- Stays visible across tab switches + centre scroll

### 6.2 navRail — 6 tabs

`1`-`6` keys jump tabs. Linked-module counts shown below tab list.

| # | Tab | Content |
|---|---|---|
| 1 | Overview | Header · line items · pricing breakdown · inline status-progression |
| 2 | Production | Linked `production_plans` cards (machine · operator · % done) · "+ New job" |
| 3 | Dispatch | Linked `deliveries` (challan # · vehicle · status) · "+ Schedule" |
| 4 | Invoice | Linked invoice(s) · amount paid · balance · PDF |
| 5 | Payments | Payments list + inline add-payment form |
| 6 | Activity | Full chronological log · inline comment box |

Each tab a lazy chunk; loads its data on open.

### 6.3 context — pinned

- **Customer card** — full version of compact card (4 open orders inline list etc.)
- **Quick action stack** — status-gated. Examples:
  - `booking` → Approve (green) + Cancel (red)
  - `approved` → Convert to production + Edit
  - `production` → Mark QC complete
  - `qc` → Mark ready for dispatch
  - `dispatched` → Generate invoice (if missing)
  - `completed` → Print final invoice only

### 6.4 Keyboard map

`1`-`6` tabs · `Cmd+E` edit · `Cmd+D` duplicate · `Cmd+P` print · `Cmd+N` add note · `Esc` back to list

### 6.5 Mobile

- Sticky header → ord # + status badge only
- navRail → horizontal scrollable tab strip at top of centre
- context → `<BottomSheet>` ("📋 Details" button)

## 7. Wizard (`/orders/new` and `/orders/:id/edit`)

### 7.1 Required (always visible)

- **Customer** — search-select; auto-fills GSTIN, state, address, payment terms; inline credit-check banner
- **Line items** — repeatable rows. Product search · qty · unit · rate · HSN · GST%. "+ Add line" appends.

### 7.2 Optional (collapsed, "+ Add X" reveals)

- Discount (flat ₹ or %)
- Charges / freight (from `charge_types` master)
- Payment terms override
- GST override / interstate
- Notes
- Delivery dates (1–3)

Edit mode pre-expands any section with non-default values.

### 7.3 context — running totals

Always visible (sticky bottom strip on mobile):

- **Summary** — Subtotal · CGST · SGST · IGST · GRAND (live as you type)
- **Credit check** — green ✓ within / amber approaching / red blocked. If blocked, "Save & approve" disabled with reason text.
- **Save will:** preview — plain-English side effects ("Create draft · reserve stock · notify approver")

### 7.4 Save actions

- **Save draft** — `status='draft'`, stays on wizard
- **Save & approve** — `status='booking'`, redirects to `/orders/:id`
- `Cmd+S` = Save draft · `Cmd+Shift+S` = Save & approve

### 7.5 Validation

- Customer required
- ≥1 line with qty>0 and rate>0
- All lines must have product_id (no free-text)
- GST override requires reason
- Credit-blocked customers cannot Save & approve (only draft)

### 7.6 Persistence

- Draft auto-saved to `localStorage` keyed by `order_wizard:${userId}:${orderId||'new'}`
- Restore banner on next visit
- Cleared on successful save

### 7.7 Edit mode

- Same component, pre-hydrated
- Status-locked: past `approved`, only Notes editable
- Concurrent-edit detection on save (server `updated_at` > client snapshot → modal)

## 8. Data flow

### 8.1 `useOrdersList`

- Filter state in URL params
- `useSWRList('orders.list:${userId}:${urlParams}', ordersDb.list)`
- `useRealtimeTable('orders')` auto-refetch
- Selected-row local state
- Exposes `{ rows, loading, refetch, selectedId, setSelectedId, filters, setFilter, savedSearches, saveCurrentSearch }`

### 8.2 `useOrderDetail(orderId)`

- `ordersDb.get(id)` — order + customer + lines + linked counts
- Per-tab lazy fetch (production / dispatch / invoice / payments / activity)
- `useRealtimeTable('orders')` filtered by id
- Exposes `{ order, customer, loading, refetch, activeTab, setActiveTab, linkedCounts }`

### 8.3 `useOrderWizard({ orderId? })`

- `useReducer` for form state (POS `usePosCart` pattern)
- Live totals via `useMemo`
- Live credit check on customer change (debounced 300ms)
- localStorage persistence
- `submit(action)` runs validation, calls `orders.create` or `.update`, clears storage
- Exposes `{ state, totals, creditCheck, validate, submit, isDirty, addLine, ... }`

### 8.4 URL contract

| Route | Params | Purpose |
|---|---|---|
| /orders | `?status=&date=&q=&saved=&focus=<id>` | Filter + initial selection |
| /orders/:id | `?tab=overview\|production\|...\|activity` | Deep-link to tab |
| /orders/new | none | New |
| /orders/:id/edit | none | Edit |

## 9. Errors & edge cases

| Scenario | Handling |
|---|---|
| Wizard browser-closed | localStorage restore banner on revisit |
| Concurrent edit | Server `updated_at` > client → "view their changes or overwrite" modal |
| Credit-blocked mid-wizard | Banner red; Save&approve disabled with reason |
| 3,000+ orders | Already paged via fetchAllPaged; SWR cached; realtime updates single rows |
| 0-result filter | Empty-state with "Clear filters" button |
| Realtime drops | Topbar Live pill amber; stale UI keeps working; refetch on reconnect |
| Cross-tab DELETE | Realtime payload → row vanishes with 200ms fade + toast |
| Invalid status transition | `orders.updateStatus` errors; toast with reason; no UI lockout |
| Bad detail id | 404-style empty card + back-to-list link |
| Phone keyboard pushes context | BottomSheet handles via input-focus scroll-into-view |
| GST override w/o state | "Customer has no state code — IGST assumed" warning |
| Double-clicked action | Idempotency-guard via `processing` state + disabled button |

## 10. Testing

| Layer | Tool | Scope |
|---|---|---|
| Unit | Node `--test` | Pure helpers — URL filter serialise · totals · credit check · validation · status-gated visibility |
| Component | deferred (Vitest if needed) | Covered by E2E |
| E2E | Playwright | Full journey: list → filter → click → context → detail → tabs → quick-action → status reflect. Desktop + 375px mobile. |
| Visual regression | Playwright screenshots | 320 / 768 / 1280 for list · detail Overview · wizard initial · wizard with all sections expanded |
| Manual | One full booking | Create → approve → production → dispatch → invoice → payment on deployed Vercel |
| Coverage gate | ≥80% on hooks + validation | New logic |

## 11. Rollout — 13 phases

| Phase | What | Days |
|---|---|---|
| 0 | Scaffold `src/modules/orders-v2/` · `orders_saved_searches` JSONB column · baseline md5s | 0.5 |
| 1 | `useOrdersList` + URL-linked filters + saved-searches DAL | 1 |
| 2 | `OrdersV2Page` skeleton (centre table only, route NOT wired) | 1 |
| 3 | navRail filters (status chips, date strip, search, saved) | 1 |
| 4 | Wire route swap (App.jsx re-baseline); legacy → `orders.legacy/` | 0.5 |
| 5 | List context stack (mini-summary, customer card, activity feed) | 1 |
| 6 | `useOrderDetail` + `OrderDetailV2` skeleton + DetailHeader | 1 |
| 7 | 6 detail tabs (Overview, Production, Dispatch, Invoice, Payments, Activity) | 2 |
| 8 | Pinned customer card + status-gated quick-action stack | 1 |
| 9 | `useOrderWizard` + smart progressive layout | 1 |
| 10 | Wizard sections (required + optional) + credit-check banner | 1.5 |
| 11 | Tests — unit + Playwright E2E + visual regression | 1 |
| 12 | Docs — `docs/ORDERS_V2.md` + launch report | 0.5 |
| 13 | Deploy + smoke + lag md5 verify + 24h log audit | 0.5 |

**Total: ~13 working days.** Critical path: 0 → 1 → 2 → 4 → 6 → 7 → 9 → 13. Phases 3, 5, 8, 10, 11, 12 fan out after Phase 4.

## 12. Acceptance criteria

- All existing order workflows still work (create, approve, edit, status transitions, generate invoice, record payment, cancel)
- New list paints in <1.5s with 3,000+ orders
- Cmd+K finds an order by number in <500ms
- Simple new order (customer + 1 line) ≤ 3 visible input groups + Save
- Mobile (375px): every page usable, no horizontal scroll, BottomSheet for context, sticky save on wizard
- Lag-critical 5/6 md5s match Shell baselines; App.jsx re-baseline once
- 0 Vercel runtime errors in 24h after deploy
- Edit-mode round-trip: open existing → no changes → Save → diff empty

## 13. Out of scope (deferred to later sub-projects)

- Kanban / board view
- Enquiries module redesign (sibling, separate sub-project)
- Bulk-edit framework
- AI-assisted "duplicate previous order for this customer"
- Multi-currency
- Excel export beyond CSV
