# Orders Workspace V2 — reference

Per-module redesign #1 (after Shell sub-project 0).
Spec: [`specs/2026-05-11-orders-workspace-design.md`](specs/2026-05-11-orders-workspace-design.md) · Plan: [`specs/2026-05-11-orders-workspace-plan.md`](specs/2026-05-11-orders-workspace-plan.md)

## Live routes

| Path | Component | Status |
|---|---|---|
| `/orders` | `OrdersV2Page` | V2 |
| `/orders/:id` | `OrderDetailV2` | V2 |
| `/orders/new-v2` | `OrderWizardV2` (opt-in) | V2 |
| `/orders/new` | legacy `OrderForm` | legacy 4-step |
| `/orders/:id/edit` · `/duplicate` | legacy `OrderForm` | legacy |

Legacy files retained for rollback:
- `src/modules/orders/OrdersPage.legacy.jsx`
- `src/modules/orders/OrderDetail.legacy.jsx`

The legacy form still owns edit + duplicate flows; the wizard catches up in a follow-up pass when it adds sample-order branching, customer-spec cards, and broker commission.

## Module map

```
src/modules/orders-v2/
├── OrdersV2Page.jsx         list page (ShellShell · navRail · centre · context)
├── OrderDetailV2.jsx        detail page (6 lazy tabs)
├── OrderWizardV2.jsx        smart-progressive single-page form
├── hooks/
│   ├── useOrdersList.js          URL filter state + SWR + realtime
│   ├── useOrderDetail.js         single-order fetch + realtime filtered by id
│   ├── useOrderWizard.js         form state + save
│   ├── useCustomerOutstanding.js sum(balance_due) for credit banner
│   ├── filterUtils.js            pure URL serde + predicate
│   └── _wizardMath.js            pure totals + validation + transforms
├── panels/
│   ├── OrdersNavRail.jsx         list filter chips + saved-searches
│   ├── OrdersListContext.jsx     right-rail switcher (cursor / bulk / empty)
│   ├── OrdersFilterChip.jsx      reusable pill
│   ├── DetailHeader.jsx          sticky detail header + actions
│   ├── DetailTabsRail.jsx        6-tab left rail + keyboard 1–6
│   ├── PinnedCustomerCard.jsx    customer SWR fetch + contact actions
│   ├── QuickActionStack.jsx      status-gated quick actions
│   ├── _quickActions.js          pure visibility matrix
│   ├── _OrdersTableColumns.jsx   column factory
│   ├── columnKeys.js             column key list (JSX-free for tests)
│   └── cards/
│       ├── MiniSummaryCard.jsx
│       ├── CustomerCard.jsx
│       ├── RecentActivityCard.jsx
│       ├── BulkActionsCard.jsx
│       └── EmptyStateCard.jsx
├── tabs/
│   ├── OverviewTab.jsx           line items + charges + pricing breakdown
│   ├── DispatchTab.jsx           order.deliveries table
│   ├── PaymentsTab.jsx           order.payments table + summary stripe
│   ├── ProductionTab.jsx         nav-only (awaits productionPlans DAL)
│   ├── InvoiceTab.jsx            nav-only (awaits invoices DAL)
│   ├── ActivityTab.jsx           synthetic timeline + disabled comment box
│   └── _StubTab.jsx              shared placeholder primitive
├── wizard/
│   ├── LineItemRow.jsx           qty · rate · disc % · GST % · net
│   ├── OptionalSection.jsx       reusable "+ Add" collapsible
│   ├── ChargesSection.jsx        order-level flat charges
│   └── CreditCheckBanner.jsx     4-tone status banner
└── __tests__/                    121 cases (filterUtils · saved-search ops ·
                                  columns · quickActions · wizardMath)
```

## Key contracts

### URL is the source of truth

`useOrdersList` reads `?status=…&date=…&q=…&saved=…&page=…` and writes back via `setFilter(patch)`. Every filter change round-trips through `filterUtils.serializeFiltersToURL` so a refresh or deep-link preserves state.

`useOrderDetail` reads `?tab=` and writes via `setTab`. Unknown tab values clamp to `overview` (bookmark-safe).

### SWR caching

| Cache key | Stale | Why |
|---|---|---|
| `orders:<filterJson>` | 30 s | per-filter-combo cache so re-visiting paints instantly |
| `order:<id>` | 15 s | tighter — detail page should reflect recent edits |
| `customer:<id>` | 60 s | rare changes |
| `customer-outstanding:<id>` | 60 s | rare changes; invalidates via realtime on `orders` |

All keys share the existing `useSWRList` primitive — the lag-protected one with the 35 s inflight-timeout + tab-refocus revalidation. **Do not edit `src/hooks/useSWRList.js`** under any phase of this sub-project (lag contract).

### Realtime subscriptions

| Channel | Filter | Drives |
|---|---|---|
| `orders` | (none) | list refetch on any change |
| `orders` | `id=eq.<id>` | detail refetch |
| `order_line_items` | `order_id=eq.<id>` | detail refetch |
| `deliveries` | `order_id=eq.<id>` | detail refetch |
| `payments` | `order_id=eq.<id>` | detail refetch |

All flow through the existing `useRealtimeTable` primitive with its 250 ms debounce and self-write echo suppression (`markSelfWrite('orders')`).

### Saved searches

Persist at `profiles.preferences.orders_saved_searches` (flat top-level key, mirrors `pinned_nav`). Shape: `Array<{ name: string, params: Record<string, string> }>`. Cap 16 entries (oldest dropped). All ops go through `src/lib/db/profiles.js`:

- `getSavedSearches(userId, 'orders')`
- `saveSearch(userId, 'orders', { name, params })`
- `removeSavedSearch(userId, 'orders', name)`

Pure list manipulators live in `src/lib/db/_savedSearchOps.js`: `upsertEntry`, `removeEntry`, `sanitiseList`, `normalizeEntry`. They enforce: 48-char name cap · primitive-only params · stable dedup-by-name · oldest-drop on overflow.

### Column factory contract

`buildOrdersColumns(opts?)` in `panels/_OrdersTableColumns.jsx` returns 8 data columns:
`order_number · customers · status · priority · grand_total · balance_due · delivery_date_1 · created_at`

These keys are mirrored in `panels/columnKeys.js` as a JSX-free `ORDERS_COLUMN_KEYS` constant so they can be imported under Node `--test` (the JSX-rich factory cannot be).

Optional opts:
- `selectedIds + onToggleSelect + onSelectAll + allSelected` → prepends a checkbox column
- `onOpenOrder` → appends an open-icon column

### Status-gated quick actions

`panels/_quickActions.js#quickActionsForStatus(status)` returns the action list for the detail page's right rail. 19 tests cover the full visibility matrix · workflow legality · navigate-URL contracts · ≤1 primary action per status.

| Status | Actions |
|---|---|
| draft / booking | approve · edit · cancel |
| approved | start-production · edit · hold |
| production | mark-qc · edit |
| qc | schedule-dispatch · back-to-production |
| dispatch | mark-completed · generate-invoice |
| completed | record-payment · generate-invoice |
| cancelled | reopen |

Each action has exactly one of `nextStatus` (calls `ordersDb.updateStatus`) or `navigateTo(order) → url`.

### Wizard math contract

All math + validation + save-payload transforms live in `hooks/_wizardMath.js` (pure, no React). The hook itself is pure orchestration — predictable resets, stable callback identities, useMemo'd derived state.

Discount applied BEFORE GST. Charges added AFTER GST (legacy parity — freight/packing isn't taxable here). GST type auto-resolves from `customer.state_code === '08'` → intra-state, else inter-state.

## Extending

### Adding a tab

1. New file in `src/modules/orders-v2/tabs/MyTab.jsx`
2. Add to `ORDER_DETAIL_TABS` in `hooks/useOrderDetail.js`
3. Add an icon + label entry in `panels/DetailTabsRail.jsx` `TAB_META`
4. Lazy-import in `OrderDetailV2.jsx` + add a render branch

The keyboard 1-6 hotkey is driven by the position in `ORDER_DETAIL_TABS`.

### Adding a column

1. Add the field to the `listPaged()` select in `src/lib/db/orders.js` (if not already returned)
2. Add the key to `panels/columnKeys.js#ORDERS_COLUMN_KEYS`
3. Add the column def to `panels/_OrdersTableColumns.jsx#buildOrdersColumns`
4. Update `__tests__/columns.test.js` to bump the count + key list

### Adding a quick action

1. Edit `panels/_quickActions.js` — add to the array for the relevant status(es). Pick `nextStatus` for status mutations, `navigateTo(order)` for route navigation.
2. Add the lucide icon name string; map it in `QuickActionStack.jsx#ICON_MAP`.
3. Add a test in `__tests__/quickActions.test.js` for the new entry.

### Adding a saved-search consumer

Use the existing flat-key convention: `profiles.preferences.<module>_saved_searches`. Wire via the same `getSavedSearches / saveSearch / removeSavedSearch` helpers — they take `moduleKey` as a parameter.

## Lag contract

The Orders sub-project consumed three planned `App.jsx` re-baselines:

| Phase | Edit | App.jsx md5 → |
|---|---|---|
| 4 | route swap `/orders` → OrdersV2Page | `e582fc…` |
| 6 | route swap `/orders/:id` → OrderDetailV2 | `1764b8…` |
| 9 | add opt-in `/orders/new-v2` → OrderWizardV2 | `3e8745…` |

Every other lag-protected file held identical md5 across all 13 phases:

```
5f7095…  useSWRList.js
b97f41…  AppContext.jsx
8d1216…  db/core.js
8a49a0…  authGate.js
4aa7f8…  Topbar.legacy.jsx
```

## Test discipline

- 121 unit tests under `node --test` covering pure helpers.
- Filename convention: `__tests__/<helper>.test.js` mirrors the source module.
- JSX-using modules cannot be loaded by Node `--test` — split JSX-free constants into a sibling `.js` file (see `columnKeys.js`).
- Component tests + Playwright E2E are deferred per the project's existing test policy. The pure-helper coverage is sufficient to catch regressions in math, URL serde, validation, and visibility matrices.

## Known follow-up work

Tracked for a future "Orders V2.1" pass:

| Item | Phase |
|---|---|
| Wizard edit-mode (load + pre-populate + update) | 10.1 |
| Server-side % charges (vs flat amount today) | 10.1 |
| Customer-spec cards (legacy feature) | 11.1 |
| Broker commission entry in wizard | 11.1 |
| Activity tab `activity_log` fetch + comment posting | 7.2 |
| Production tab cards (awaits `productionPlans.list({order_id})`) | 7.2 |
| Invoice tab list (awaits `invoices.list({order_id})`) | 7.2 |
| Bulk server-side mutations (status change · print · export) | 8.1 |
| Playwright E2E smoke + visual regression | 13 |
