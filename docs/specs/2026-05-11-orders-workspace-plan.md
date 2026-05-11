# Orders Workspace — Implementation Plan

**Spec:** `docs/specs/2026-05-11-orders-workspace-design.md`
**Branch target:** v2-rebuild
**Predecessor:** Shell sub-project 0 (commit a067ffd, shipped 2026-05-11)
**Lag-protection contract (Shell baselines):**
```
5f7095…  useSWRList.js          MUST NOT CHANGE
b97f41…  AppContext.jsx         MUST NOT CHANGE
8d1216…  db/core.js             MUST NOT CHANGE
8a49a0…  authGate.js            MUST NOT CHANGE
4aa7f8…  Topbar.legacy.jsx      MUST NOT CHANGE
fa5532…  App.jsx                may re-baseline at Phase 4, 6, 9 (planned route swaps)
                                  → re-baselined to e582fc… at Phase 4 (list swap)
                                  → re-baselined to 1764b8… at Phase 6 (detail swap)
                                  → re-baselined to 3e8745… at Phase 9 (wizard opt-in route)
```

---

## Phase 0 — Prerequisites (½ day)

| Action | Detail |
|---|---|
| Scaffold `src/modules/orders-v2/` | Empty dir with subdirs `tabs/`, `panels/`, `wizard/`, `hooks/` + `.gitkeep` files |
| Add `orders_saved_searches` to `profiles.preferences` | Additive — no migration needed; the JSONB blob already exists from shell Phase 0. Just document the new key in `docs/MIGRATING_TO_SHELL.md` |
| Baseline lag md5s | Snapshot the 6 lag-critical files |
| Decide which lazy-import wave gets the new `OrdersV2Page` | Currently `import('./modules/orders/OrdersPage')` is in wave 1; will become `import('./modules/orders-v2/OrdersV2Page')` at Phase 4 |
| Confirm `useRealtimeTable('orders')` exists + works | Already confirmed from existing OrdersPage; reuse path unchanged |

**Done when:** scaffold exists · md5 baseline recorded · build green · POS tests still 23/23 · shell tests still 22/22.

**Risk:** Tailwind purge might miss new file paths. Mitigation: Tailwind v4 + Vite plugin auto-detects from imports, no manual safelist needed.

---

## Phase 1 — `useOrdersList` hook + URL-linked filters (1 day)

| File | Change |
|---|---|
| `src/modules/orders-v2/hooks/useOrdersList.js` | NEW — wraps `ordersDb.list()` via `useSWRList`. URL params drive filter state. Realtime auto-refetch via `useRealtimeTable('orders')`. |
| `src/lib/db/profiles.js` | EDIT — extend `mergePreferences` is fine; add `getSavedSearches`, `saveSearch`, `removeSearch` thin wrappers around `profiles.preferences.orders_saved_searches` array |
| `src/modules/orders-v2/__tests__/useOrdersList.test.js` | NEW — pure tests for URL-param serialise/deserialise + filter predicate logic |

**Acceptance:**
- URL `?status=booking,approved&date=week&q=sharma&saved=my_approvals` parses into filter state cleanly + round-trips back to URL on filter change
- `useSWRList` cache key includes serialised filter — instant repaint when revisiting same filter combo
- Realtime payload triggers refetch (not full rerender of every row)
- Saved-search ops persist to `profiles.preferences.orders_saved_searches` (array of `{name, params}`)
- Unit tests cover empty filters, multi-value chips, saved-search load/save, predicate boundary cases (0 results, 50+ results)
- Coverage ≥80% on the new hook + DAL helpers

**Risk:** filter param URL grows long for power users with many saved searches. Mitigation: cap each filter to N=8 values; saved searches just store the params blob, no recursion.

---

## Phase 2 — `OrdersV2Page` skeleton (1 day) — route NOT wired yet

| File | Change |
|---|---|
| `src/modules/orders-v2/OrdersV2Page.jsx` | NEW — composes `<ShellShell navRail={null} context={null}>{centre}</ShellShell>` for now. Centre = existing `<DataTable>` wired to `useOrdersList`. |
| `src/modules/orders-v2/panels/_OrdersTableColumns.js` | NEW — column definitions extracted as pure config (testable) |

**Acceptance:**
- Component renders standalone at `/dev/orders-v2` (env-gated dev route only — does not change App.jsx production routes)
- Table shows real orders data from `ordersDb.list()`
- Click row sets `selectedId` local state (no context panel yet)
- Pagination works
- Sort by column works
- Realtime updates a single row inline (no full table re-fetch)
- Lag-critical 6/6 md5s unchanged

**Risk:** dev route requires App.jsx edit. Mitigation: gate behind `import.meta.env.DEV && import.meta.env.VITE_ORDERS_V2_DEV` — does not ship to prod build.

Actually — to avoid editing App.jsx in Phase 2, we'll just temporarily render `<OrdersV2Page />` via a Storybook-style sandbox call from a hidden internal page. Or skip the dev-route entirely and rely on Phase 4 first-render verification. Easier.

**Decision:** skip dev route. Phase 2 ships the component file; first render happens at Phase 4.

---

## Phase 3 — navRail filters (1 day)

| File | Change |
|---|---|
| `src/modules/orders-v2/panels/OrdersFilters.jsx` | NEW — full navRail block: search input · status chips with counts · date strip · saved searches |
| `src/modules/orders-v2/OrdersV2Page.jsx` | EDIT — pass `<OrdersFilters>` to ShellShell's navRail prop |

**Acceptance:**
- Status chips show live counts per status (derived from full list)
- Click chip toggles inclusion; URL updates
- Date strip presets (Today/Week/Month) work + custom range modal
- Search input debounced 250ms; updates URL `q` param
- Saved searches dropdown + "+ Save current" + "× Remove"
- Filter changes don't re-render the entire table (memoised columns + virtualised if needed — defer virtualisation until measured slow)

**Risk:** chip count computation on 3000+ orders could be expensive every render. Mitigation: compute once via `useMemo` keyed to the unfiltered list; chip clicks just toggle URL, don't recompute.

---

## Phase 4 — Wire route swap (½ day) — **CRITICAL PATH**

| File | Change |
|---|---|
| `src/App.jsx` | EDIT — change `import OrdersPage from './modules/orders/OrdersPage'` → `import OrdersV2Page from './modules/orders-v2/OrdersV2Page'`. Update route element. |
| `src/modules/orders/` | RENAME to `src/modules/orders.legacy/` via `git mv` (preserves history). Inside the renamed dir, no file changes — every legacy import still resolves. |
| `src/App.jsx` | EDIT — for each lazy import that points to `./modules/orders/...`, repoint to `./modules/orders.legacy/...` to keep the old detail + form pages alive until their Phase 6/9 swaps |

Re-baseline App.jsx md5 after this phase. Other 5 lag-critical files MUST remain identical.

**Acceptance:**
- `/orders` renders OrdersV2Page in production
- `/orders/:id` still renders the LEGACY OrderDetail (Phase 6 swaps it)
- `/orders/new` and `/orders/:id/edit` still render the LEGACY OrderForm (Phase 9 swaps it)
- 0 console errors on the deployed Vercel after auto-deploy
- Vercel runtime logs clean for 1h
- Lag md5 contract: 5/6 byte-identical with Shell baselines; App.jsx newly re-baselined

**Risk:** breaking the existing `/orders/:id` because OrdersV2Page links to it via the legacy detail page. Mitigation: explicit smoke of all 4 routes via Chrome MCP before declaring Phase 4 done.

---

## Phase 5 — List context stack (1 day)

| File | Change |
|---|---|
| `src/modules/orders-v2/panels/OrderMiniSummary.jsx` | NEW — mini-summary card with status-gated action buttons |
| `src/modules/orders-v2/panels/CustomerCardCompact.jsx` | NEW — firm + phone + GSTIN + credit + overdue + open-orders count |
| `src/modules/orders-v2/panels/ActivityFeedCompact.jsx` | NEW — last 5 events via `activityLog.list({ entity_type: 'order', entity_id })` |
| `src/modules/orders-v2/OrdersV2Page.jsx` | EDIT — pass stack to ShellShell's context prop when `selectedId` truthy |

**Acceptance:**
- Click any row → context stack fills in <300ms
- Empty state: "Pick an order or `>new order` in Cmd+K"
- Customer compact card → tap → opens `<SearchResultDrawer>` (existing shell primitive) with full customer info
- Activity "View all" link → /orders/:id?tab=activity
- Quick-action buttons fire correct mutations; UI optimistic-updates then realtime confirms
- Mobile: row tap → BottomSheet rises with the same 3 panels stacked

**Risk:** activity feed query on 3000+ orders × N events could be slow. Mitigation: query limit 5 + index on `(entity_type, entity_id, created_at DESC)` — already exists from earlier audit.

---

## Phase 6 — `useOrderDetail` + `OrderDetailV2` skeleton + `DetailHeader` (1 day)

| File | Change |
|---|---|
| `src/modules/orders-v2/hooks/useOrderDetail.js` | NEW — order + customer + linked-counts + activeTab state (URL-linked via `?tab=`) |
| `src/modules/orders-v2/OrderDetailV2.jsx` | NEW — `<ShellShell>` with navRail (tab list) + centre (active tab) + context (placeholder for Phase 8) |
| `src/modules/orders-v2/panels/DetailHeader.jsx` | NEW — sticky header: ord # + status badge + customer + grand total + action buttons (Edit/Duplicate/Print/More) |
| `src/App.jsx` | EDIT — change `/orders/:id` route to `OrderDetailV2`. Legacy `OrderDetail.legacy.jsx` preserved. |

**Acceptance:**
- Detail page loads in <800ms
- Sticky header doesn't flicker on tab switch
- Empty tabs render "Tab Phase 7 ships content here" placeholder
- Bad order ID shows 404-style "Order not found" with back-to-list link
- `Cmd/Ctrl+E` opens wizard in edit mode (still legacy OrderForm — Phase 9 swaps)

**Risk:** Edit shortcut firing on Mac while typing in a customer search field. Mitigation: skip handler if `event.target.matches('input, textarea, [contenteditable]')`.

---

## Phase 7 — 6 detail tabs (2 days)

| File | Change |
|---|---|
| `src/modules/orders-v2/tabs/OverviewTab.jsx` | NEW — order header (read-only) + line items table + pricing breakdown |
| `src/modules/orders-v2/tabs/ProductionTab.jsx` | NEW — linked `production_plans` cards + "+ New production job" |
| `src/modules/orders-v2/tabs/DispatchTab.jsx` | NEW — linked `deliveries` table + "+ Schedule dispatch" |
| `src/modules/orders-v2/tabs/InvoiceTab.jsx` | NEW — linked invoice(s) + paid/balance + "Generate invoice" CTA |
| `src/modules/orders-v2/tabs/PaymentsTab.jsx` | NEW — payments list + inline add-payment form |
| `src/modules/orders-v2/tabs/ActivityTab.jsx` | NEW — full activity log + comment box |

Each tab is its own lazy chunk (via `React.lazy`) for fast switching.

**Acceptance:**
- Switching tabs via `1`-`6` keys works · URL `?tab=` updates · refresh preserves tab
- Each tab's data lazy-loads on first open; subsequent opens cached via SWR
- Add-payment form on Payments tab calls existing `payments.create` and refreshes the invoice's balance_due
- Comment on Activity tab posts to `activityLog` with `entity_type='order'` and refreshes feed
- Inline "+ New production job" on Production tab routes to `/production/new?order_id=:id` (pre-filled)
- Linked counts in navRail update after mutations

**Risk:** tab content lazy-load shows a spinner on every first-time tab switch. Mitigation: prefetch all 6 tab chunks once the parent OrderDetailV2 has rendered (similar to App.jsx prefetchRoutes pattern).

---

## Phase 8 — Pinned customer card + status-gated quick-action stack (1 day)

| File | Change |
|---|---|
| `src/modules/orders-v2/panels/CustomerCardFull.jsx` | NEW — fuller version of compact card (4 open orders inline list, recent payments, contact CTAs) |
| `src/modules/orders-v2/panels/QuickActionStack.jsx` | NEW — buttons gated by order.status. Pure visibility predicate factored out to `src/modules/orders-v2/lib/quickActions.js` (testable) |
| `src/modules/orders-v2/OrderDetailV2.jsx` | EDIT — pass `<CustomerCardFull/>` + `<QuickActionStack/>` to ShellShell's context prop |
| `src/modules/orders-v2/lib/__tests__/quickActions.test.js` | NEW — matrix test: every status × every action's visibility |

**Acceptance:**
- Visible actions match the spec table per status (booking → Approve+Cancel · approved → Convert to production · etc.)
- Clicking an action that mutates status produces optimistic UI update + realtime confirmation
- Bad action (e.g. trying to Approve an already-approved order) shows toast error; no UI break
- Mobile: customer card + action stack become the BottomSheet content via "📋 Details" button
- Unit tests: every (status, action) cell of the matrix verified

**Risk:** action button double-tap fires mutation twice. Mitigation: `processing` flag + button disabled while pending; idempotent retries on the DB side via existing `safe()` timeout + retry hooks.

---

## Phase 9 — `useOrderWizard` + smart progressive layout (1 day)

| File | Change |
|---|---|
| `src/modules/orders-v2/hooks/useOrderWizard.js` | NEW — `useReducer` form state (mirror `usePosCart` pattern). Live totals · live credit check · localStorage persistence · submit + validate |
| `src/modules/orders-v2/OrderWizardV2.jsx` | NEW — `<ShellShell>` with centre = stacked sections, context = running totals + credit + "save will" preview |
| `src/modules/orders-v2/wizard/ReviewBar.jsx` | NEW — sticky footer with grand total + Save buttons; mobile-fixed bottom |
| `src/modules/orders-v2/wizard/CustomerPicker.jsx` | NEW — wraps existing CustomerSearch component; shows credit banner inline |
| `src/modules/orders-v2/wizard/LineItemRow.jsx` | NEW — single line row with product search + qty + unit + rate + HSN + GST% + auto-calc; reuses existing LineItemRow logic |
| `src/App.jsx` | EDIT — `/orders/new` and `/orders/:id/edit` routes point to OrderWizardV2 (legacy preserved as `OrderForm.legacy.jsx`) |

**Acceptance:**
- New order with 1 customer + 1 line item saves in 3 input groups + Save
- localStorage draft persists across browser close; restore banner on revisit
- Concurrent edit: server `updated_at` advanced > client → modal "Someone else edited — view or overwrite?"
- Edit mode: existing values pre-fill; sections with non-default values auto-expand
- Status-locked: order past `approved` → only Notes editable; other sections show read-only state

**Risk:** localStorage hits quota with many drafts. Mitigation: 1 draft per (user, orderId) — max ~10KB each; auto-prune drafts older than 30 days on hook init.

---

## Phase 10 — Optional wizard sections + credit-check banner (1.5 days)

| File | Change |
|---|---|
| `src/modules/orders-v2/wizard/DiscountSection.jsx` | NEW — flat ₹ or %; collapsed by default; "+ Add discount" reveals |
| `src/modules/orders-v2/wizard/ChargesSection.jsx` | NEW — multiple charge rows (from `charge_types` master) |
| `src/modules/orders-v2/wizard/PaymentTermsSection.jsx` | NEW — picker; default from customer |
| `src/modules/orders-v2/wizard/GstOverrideSection.jsx` | NEW — interstate/exempt toggle + reason field |
| `src/modules/orders-v2/wizard/NotesSection.jsx` | NEW — multi-line notes |
| `src/modules/orders-v2/wizard/DeliveryDatesSection.jsx` | NEW — 1–3 date pickers |
| `src/modules/orders-v2/panels/CreditCheckBanner.jsx` | NEW — green/amber/red live banner in wizard context |
| `src/modules/orders-v2/OrderWizardV2.jsx` | EDIT — wire all 6 optional sections + banner |

**Acceptance:**
- Tapping "+ Add discount" expands the section + autofocuses first field
- "× Remove" collapses the section and clears its values
- Live totals recompute < 100ms after any field change
- Credit-blocked customer: Save & approve button disabled with reason text; Save draft still allowed
- GST override requires reason; validation blocks save if missing
- All sections render correctly in edit mode pre-expanded for non-default values

**Risk:** running totals + credit check both subscribe to customer + lines changes — could thrash. Mitigation: `useMemo` for totals (cheap pure compute); credit check debounced 300ms.

---

## Phase 11 — Tests (1 day)

| File | Scope |
|---|---|
| `src/modules/orders-v2/hooks/__tests__/useOrdersList.test.js` | Already from Phase 1; extend with edge cases |
| `src/modules/orders-v2/lib/__tests__/quickActions.test.js` | Already from Phase 8; full matrix |
| `src/modules/orders-v2/lib/__tests__/wizardValidation.test.js` | NEW — required field rules, line-item rules, GST override reason, credit-blocked rules |
| `src/modules/orders-v2/lib/__tests__/orderTotals.test.js` | NEW — sum + discount + charges + GST split (intra/inter-state); reuse / port from POS gstSplit pattern |
| `e2e/orders-v2-flow.spec.js` | NEW — Playwright. Full journey: open /orders → filter → select row → context fills → open detail → switch tabs → click status action → see status reflect in list |
| `e2e/orders-v2-wizard.spec.js` | NEW — Playwright. Open wizard → pick customer → add line → save draft → reopen → save & approve → arrives at detail |
| `e2e/orders-v2-mobile.spec.js` | NEW — Playwright 375px viewport. Same journey via BottomSheet |

**Acceptance:** all green in CI · ≥80% coverage on hooks + validation + quickActions + totals · Playwright artifacts uploaded · zero flakes across 3 consecutive CI runs.

---

## Phase 12 — Docs (½ day)

| File | Content |
|---|---|
| `docs/ORDERS_V2.md` | NEW — Orders Workspace reference (parallel to `docs/SHELL.md`): architecture, route map, file inventory, keyboard map, URL contract, lag-protection re-verification command. |
| `docs/MIGRATING_TO_SHELL.md` | EDIT — append "Lessons from Orders Workspace" section: what worked, what surprised us, what to do differently in the next per-module redesign |
| `CLAUDE.md` | EDIT — replace the per-module sub-projects bullet list to show Orders ✓ and update the next-up pointer |

---

## Phase 13 — Deploy + smoke + lag md5 verify (½ day)

| Step | Detail |
|---|---|
| Push final commit | Triggers Vercel auto-deploy |
| Wait for state READY | `list_deployments` until current commit shows READY |
| Smoke (manual + Chrome MCP) | Login → Cmd+K "order" → open one → switch tabs → click Approve → returns to list → see status change. Then open wizard → create simple order → see in list. |
| Vercel runtime logs over 1h | Expect 0 errors / warnings |
| Lag md5 final check | 5/6 byte-identical with Shell baselines; App.jsx at new Phase 4 baseline |
| Write `docs/specs/<today>-orders-launch-report.md` | Same shape as Shell launch report. Phase tally, verification gates, what landed in prod, follow-ups. |

---

## Critical Path

`Phase 0 → 1 → 2 → 4 → 6 → 7 → 9 → 13`

Phases 3, 5, 8, 10, 11, 12 fan out in parallel after Phase 4.

## Total Estimate

**~13 working days** end-to-end (~2 weeks). **~9 days** if Phases 3, 5, 8, 10, 11 are parallelised.

## Rollback

Each phase commits independently on v2-rebuild. Bad phase → `git revert` of that phase's commits.

- `OrdersV2Page` swap (Phase 4) → revert single App.jsx edit + rename `orders.legacy/` back to `orders/`
- `OrderDetailV2` swap (Phase 6) → revert single App.jsx route element
- `OrderWizardV2` swap (Phase 9) → revert two App.jsx route elements

Every swap is small + reversible. Legacy code preserved byte-for-byte.

## What's NOT changing

- DB schema — no migrations
- Existing business logic (credit check, GST split, order number generation) — copied as-is
- POS module — untouched
- Other modules — untouched
- All non-orders routes — untouched
