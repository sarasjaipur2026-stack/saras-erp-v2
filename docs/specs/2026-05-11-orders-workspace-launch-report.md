# Orders Workspace V2 — launch report

**Sub-project 1** (after Shell sub-project 0)
**Branch:** `v2-rebuild`
**Phase span:** Phase 0 (`cc042b1`) → Phase 13 (this commit)
**Reference:** [`docs/ORDERS_V2.md`](../ORDERS_V2.md)
**Spec:** [`2026-05-11-orders-workspace-design.md`](2026-05-11-orders-workspace-design.md)
**Plan:** [`2026-05-11-orders-workspace-plan.md`](2026-05-11-orders-workspace-plan.md)

---

## Status: SHIPPED

All 13 phases landed on `v2-rebuild` and auto-deployed to Vercel preview at https://saras-erp-v2-rebuild.vercel.app.

| Surface | Route | State |
|---|---|---|
| List | `/orders` | V2 — OrdersV2Page |
| Detail | `/orders/:id` | V2 — OrderDetailV2 (6 lazy tabs) |
| Wizard (opt-in) | `/orders/new-v2` | V2 — OrderWizardV2 |
| New (default) | `/orders/new` | legacy 4-step OrderForm |
| Edit / Duplicate | `/orders/:id/edit · /duplicate` | legacy OrderForm |

Legacy retained for rollback as `OrdersPage.legacy.jsx` and `OrderDetail.legacy.jsx`.

---

## Phase-by-phase recap

| Phase | Commit | Headline | LOC |
|---|---|---|---|
| 0 | `cc042b1` | Scaffold + saved-searches convention | +15 |
| 1 | `867c122` | `useOrdersList` + URL filter state + saved-search DAL | +1009 |
| 2 | `82d2afe` | `OrdersV2Page` skeleton + column defs | +330 |
| 3 | `1158deb` | navRail filters (status · date · search · saved) | +401 |
| 4 | `0fba017` | **Route swap** `/orders` → V2 (App.jsx re-baseline #1) | +9 |
| 5 | `6a9f27d` | List context stack + bulk-select affordance | +570 |
| 6 | `64bf42b` | OrderDetailV2 skeleton + 6-tab rail (App.jsx re-baseline #2) | +575 |
| 7 | `e04418c` | 6 detail tabs lazy-loaded, 3 fully wired | +570 |
| 8 | `ca9863f` | Pinned customer card + status-gated quick actions | +542 |
| 9 | `3d96512` | Smart-progressive wizard, opt-in route (App.jsx re-baseline #3) | +617 |
| 10 | `732b803` | Credit-check · charges · sample · line discount | +441 |
| 11 | `dbbc2b1` | Wizard math + transforms unit tests (32 new cases) | +530 |
| 12 | `a413828` | Docs (`ORDERS_V2.md`, learnings, CLAUDE.md update) | +229 |
| 13 | this | Launch report | + |

Total: ~5800 net additions across 51 new files + edits to 9 existing.

---

## Final health check

### Build
- `vite build`: green · 886 ms · zero errors
- 62 output chunks, all six new OrderDetail tab chunks ≤ 9 KB
- New `OrdersV2Page` chunk: 20.08 KB / 6.06 KB gzip
- New `OrderDetailV2` scaffold: 10.44 KB / 3.46 KB gzip

### Tests
- **166 / 166** passing across three suites (Node `--test`):
  - 23 POS tests (carried from Shell sub-project)
  - 22 shell tests (carried from Shell sub-project)
  - **121 orders tests** (new in this sub-project)
- Breakdown of new orders tests:
  - filterUtils: 46 (URL serde + multi-value status + custom date + predicate boundary)
  - savedSearchOps: 20 (dedup · cap · normalisation · workflow)
  - columns: 4 (key list contract)
  - quickActions: 19 (visibility matrix · navigate URLs · workflow legality)
  - wizardMath: 32 (line net · totals · validation · gst-type · transforms · integration)

### ESLint
- 0 errors / 0 warnings on every file added or refactored by this sub-project.
- Pre-existing lint debt in `src/components/ui/index.jsx`, `src/pages/NowWhatHome.jsx`, etc. left untouched — separate audit work.

### Lag contract — final md5s

| File | Expected | Actual | Status |
|---|---|---|---|
| `src/hooks/useSWRList.js` | `5f7095…` | `5f7095…` | UNCHANGED |
| `src/contexts/AppContext.jsx` | `b97f41…` | `b97f41…` | UNCHANGED |
| `src/lib/db/core.js` | `8d1216…` | `8d1216…` | UNCHANGED |
| `src/lib/authGate.js` | `8a49a0…` | `8a49a0…` | UNCHANGED |
| `src/components/Topbar.legacy.jsx` | `4aa7f8…` | `4aa7f8…` | UNCHANGED |
| `src/App.jsx` | `3e8745…` (post-Phase 9) | `3e8745…` | held since Phase 9 |

Three planned App.jsx re-baselines (Phase 4 list · Phase 6 detail · Phase 9 wizard) — every other lag file held byte-identical across 13 phases.

---

## What's live for users

### List page (`/orders`)
- 3-panel ShellShell layout (navRail · centre · context)
- URL-linked filters: status (multi-select via Cmd/Ctrl+click) · date preset · search · saved
- Saved searches persisted per-user at `profiles.preferences.orders_saved_searches`
- Realtime row updates (debounced)
- Mini-summary + customer + activity-timeline cards in the right rail on row click
- Bulk-select replaces the context stack with a Print / Export / Change-status panel
- Server-side pagination

### Detail page (`/orders/:id`)
- Sticky header (order # · status · customer · totals · actions)
- 6 lazy-loaded tabs with keyboard 1–6 hotkeys
- 3 tabs fully wired (Overview · Dispatch · Payments) — read from already-fetched joins
- 3 tabs navigation-only (Production · Invoice · Activity) — await module-level DAL helpers
- Right rail: pinned customer card (SWR-cached, 60 s) + status-gated quick-action stack (8 statuses × 2–3 actions)
- Cmd/Ctrl+E hotkey opens legacy edit form
- 404-style empty state for bad IDs

### Wizard (`/orders/new-v2`, opt-in)
- Single-page smart-progressive layout
- Always-visible: Customer + Lines + Save
- Optional sections (+ Add): delivery date · notes · payment terms · order type · GST override · charges
- Sample-order toggle (flips header + persists `nature='sample'`)
- Customer phone/WA/email/GSTIN chips appear after pick
- Credit-check banner (4 tones — ok / approaching ≥80% / over-limit / no-limit) reading sum(balance_due) of customer's open orders
- Over-credit save guarded by `window.confirm` (soft block)
- Per-line discount %, GST %, auto-net computation
- Save via `orders.createAtomic` (header + lines + charges atomic)

---

## Known follow-up (Orders V2.1 backlog)

Tracked in [`docs/ORDERS_V2.md#known-follow-up-work`](../ORDERS_V2.md#known-follow-up-work):

- Wizard edit-mode (load + pre-populate + update via `orders.update`)
- Server-side % charges
- Customer-spec cards (legacy parity)
- Broker commission in wizard
- ActivityTab `activity_log` fetch + comment posting
- ProductionTab cards (awaits `productionPlans.list({order_id})`)
- InvoiceTab list (awaits `invoices.list({order_id})`)
- Bulk server-side mutations (status change, print, export)
- Playwright E2E smoke + visual regression at 1280 / 768 / 375

---

## Next sub-project

**#2 — Production Board (kanban)**

Same structure: brainstorm → spec → 13-phase plan → ship cycle. Reference `docs/MIGRATING_TO_SHELL.md#learnings-from-orders-v2` for what carried over.

Reply `/brainstorming production board` when ready.
