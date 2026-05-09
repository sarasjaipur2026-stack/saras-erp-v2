# SARAS ERP — Shell + Design System (Sub-project 0)

**Date:** 2026-05-09
**Owner:** RPK (RPK Industries, Jaipur)
**Project:** saras-erp-v2
**Branch target:** v2-rebuild
**Status:** Design — approved, awaiting implementation plan

---

## 1. Problem Statement

POS shipped with a deliberate UX language: 3-panel spatial constancy, full-screen layout, keyboard-first power user mode, touch-friendly fallback. It demonstrably works — cashier-grade speed, "I never lose my place" feel, phone parity.

The remaining 14 ERP modules use the original generic layout. Reapplying the POS pattern to each module requires shared primitives — without them, per-module work duplicates layout logic, navigation, status surfaces, and responsive behaviour. This sub-project builds those primitives.

The shell unblocks the per-module redesigns that follow (Orders Workspace, Production Board, Stock + Purchase, Dispatch, Invoicing + Payments + Reports, Masters cleanup), each of which gets its own brainstorm → spec → 13-phase build cycle.

## 2. Goals & Non-Goals

**Goals**
- One responsive shell — same layout adapts to phone (<768px), tablet (768-1279px), desktop (≥1280px); no role-locked variants apart from POS
- "Now What" home replaces empty Dashboard — action-prompted feed of pending work
- Universal Cmd+K palette as primary navigation surface — search across customers/suppliers/orders/invoices/payments/products/materials, with verb commands
- 3-panel `<ShellShell>` layout primitive — `navRail · centre · context` — every module mounts inside it
- Topbar with always-visible status pills (connection, realtime, print bridge, notifications) and avatar menu
- Sidebar redesign — personal pinning, recent pages, mobile drawer; existing categories preserved
- Lag-protection contract held — 5/6 lag-critical files unchanged; Topbar.jsx replaced with deliberate re-baseline; App.jsx single planned re-baseline

**Non-Goals (v1 of the shell)**
- Per-module redesigns (Orders Workspace etc.) — separate sub-projects after this lands
- Tabbed multi-page UX (use browser tabs)
- Sidebar minimisation animation (just hamburger collapse on mobile)
- Customisable category order
- Themes / dark mode (separate later spec if wanted)

## 3. Decisions Locked During Brainstorming

| # | Decision | Choice |
|---|---|---|
| 1 | Most-used non-POS module (shapes shell priorities) | Orders |
| 2 | Device target | Responsive — phone + tablet + desktop, no role-locked variants |
| 3 | Top design priorities to attack | (a) "Now What" home, (b) universal Cmd+K as primary nav, (c) 3-panel spatial constancy |
| 4 | Architecture | In-place upgrade — replace existing `LayoutShell` with `ShellV2`. No `/v2/*` paths, no flags. |
| 5 | Visual style | POS-uniform — same indigo accent, same Plus Jakarta Sans, same slate neutrals. No department colour-coding. |
| 6 | Keyboard depth | F-keys reserved for POS specifics (F1 search, F2 customer, F4 hold, F8 pay, F12 reprint). Cmd+K everywhere as the universal accelerator. |

## 4. Architecture

### 4.1 Shell topology

```
<ShellV2>                                    ← replaces existing <LayoutShell>
  ├ <TopbarV2>                              ← new — status pills, Cmd+K hotbar, avatar menu
  ├ <Sidebar>                               ← existing, plus pinned + recent
  ├ <ShellShell>                            ← new — 3-panel scaffold each page mounts inside
  │   ├ navRail   (page-supplied, optional)
  │   ├ centre    (page-supplied, required)
  │   └ context   (page-supplied, optional)
  └ <CommandPalette>                        ← always mounted, Cmd+K opens

<NowWhatHome>                                ← rendered when path === '/'
  ├ Action cards (action-prompted, role-aware)
  └ Quick-action row (+New Order, +POS, Search)
```

POS layout (`<PosLayout>` from earlier work) is unchanged — POS keeps its full-screen register UI; ShellV2 only replaces the non-POS shell.

### 4.2 Responsive ladder

| Width | Behaviour |
|---|---|
| **≥1280px (xl)** | Full layout. Sidebar (~256px) + ShellShell.navRail (~200px) + centre (fluid) + ShellShell.context (~360px). 4 visible regions max. |
| **1024–1279px (lg)** | Sidebar collapses to icons-only. ShellShell.context becomes a "📋 Details" pull-tab on the right edge — opens as slide-over. |
| **768–1023px (md)** | Sidebar becomes hamburger drawer. ShellShell shows centre only; both rails behind tab buttons at top of centre ("🔍 Filter", "📋 Details"). |
| **<768px (sm)** | Single column. Sidebar = hamburger. ShellShell.context = bottom-sheet that swipes up. ShellShell.navRail = top filter button → modal. |

### 4.3 Routing

No new routes. `App.jsx` swaps the existing `<LayoutShell />` element for `<ShellV2 />`. Existing `<Outlet />` pattern preserved. `/` route renders `<NowWhatHome />` instead of the current `<Dashboard />` (Dashboard moves to `pages/Dashboard.legacy.jsx` for rollback).

## 5. Components

```
src/components/shell/
├── ShellV2.jsx                  ← new top-level wrapper (replaces LayoutShell)
├── TopbarV2.jsx                 ← new (existing Topbar.jsx → Topbar.legacy.jsx)
├── ShellShell.jsx               ← new — 3-panel responsive scaffold
├── StatusPills.jsx              ← connection / realtime / print / notif pills
├── PinnedNav.jsx                ← sidebar pinned section + recent pages
└── CommandPaletteV2.jsx         ← upgrade of existing CommandPalette
                                   ↳ search domain grouping, verb commands, side-drawer mode

src/pages/
├── NowWhatHome.jsx              ← replaces Dashboard at path '/'
└── Dashboard.legacy.jsx         ← preserved for rollback

src/hooks/
├── usePinnedNav.js              ← persist pinned items to profile.preferences
├── useRecentPages.js            ← auto-track last N visited routes (sessionStorage)
└── useShellHealth.js            ← surfaces connection/realtime/notif state for pills
```

### 5.1 `<ShellShell>` API

```jsx
<ShellShell
  navRail={<OrdersFilters/>}        // optional
  context={<CustomerCard/>}          // optional
  navRailWidth={200}                 // optional default
  contextWidth={360}                 // optional default
>
  <OrdersList/>                      // centre, always shown
</ShellShell>
```

Pages without rails just render children — `<ShellShell>` collapses to single column. Calculator and Settings deliberately skip both rails.

### 5.2 `<NowWhatHome>` cards

| Card | Source | Tap action | Color |
|---|---|---|---|
| Overdue payments | `customer_ledger` net debt + `customers.overdue_days_allowed` exceeded | /payments?filter=overdue | red |
| Orders pending approval | `orders.status='booking' AND credit check pending` | /orders?filter=pending | amber |
| Low stock | `stock JOIN products WHERE quantity < min_stock_level` | /stock?filter=low | red |
| Jobs ready for QC | `production_plans WHERE status='qc_pending'` | /quality?filter=pending | amber |
| Dispatches scheduled today | `deliveries WHERE delivery_date = today AND status != 'completed'` | /dispatch?filter=today | green |
| Held bills in POS | `invoices WHERE held=true AND user_id=me` | /pos (auto-recall) | amber |
| Today's sales | `pos_sessions JOIN pos_tenders WHERE today` | /pos/history | blue |
| New enquiries today | `enquiries WHERE created_at >= today` | /enquiries | blue |

Each card is `useSWRList`-backed with realtime subscription. Empty cards hide. Inbox-zero state: "✅ Nothing needs your attention right now."

### 5.3 `<CommandPaletteV2>` domain grouping

Single text box, results grouped by domain header:

| Domain | Source | Example |
|---|---|---|
| 🧭 Navigate | nav items + recent pages | "ord" → "Go to Orders" |
| 👥 People | `customers` + `suppliers` | "sharma" → "Sharma Textiles · 9XXXX" |
| 📦 Records | `orders` + `invoices` + `payments` + `enquiries` | "0042" → "POS-20260509-0042 · ₹283" |
| 📐 Products | `products` + `materials` | "round cord" → "VRT-005 · stock 84m · ₹12/m" |

Backed by existing Postgres `search_entities(q, types[], max_per, p_user_id)` RPC.

**Keyboard map:** `Cmd/Ctrl+K` and `/` open · arrows navigate · Enter jumps · `Cmd/Ctrl+Enter` opens in side drawer (cross-module lookup without leaving page) · Tab cycles domain filter · Esc dismisses.

**Verb commands** (typed prefix `>`): `>add customer` · `>new order` · `>pos` · `>q <query>` (force search mode).

**Recent items** show on empty palette — last 5 records you touched.

### 5.4 `<TopbarV2>` zones

```
[☰] SARAS · Jaipur     [🔍 Search anywhere · Cmd+K]      [● live] [🔔 2] [👤 RPK]
```

| Zone | Contents |
|---|---|
| Left | Hamburger (mobile) + brand mark + tenant label |
| Centre | Cmd+K hotbar — fake input that opens palette on click. Mobile: 🔍 icon only. |
| Right | Status pills (connection · realtime · print bridge when on /pos · notifications · avatar) |

### 5.5 Status pill states

| Pill | Green | Amber | Red |
|---|---|---|---|
| Connection | online | reconnecting | offline (queued writes) |
| Realtime | subscribed | reconnecting | disconnected |
| POS print bridge | bridge online | — | bridge offline |
| Notifications | count or 0 | new since you opened | — |

### 5.6 Sidebar redesign

- **Pinned** section at top — `profile.preferences.pinned_nav` JSON. Right-click any nav item → "Pin to top". Default empty.
- **Recent** section under pinned — last 3 visited routes (auto-tracked via `useRecentPages`).
- **Categories preserved** — Production · Masters · Inventory · Finance · System unchanged.
- **Mobile** — sidebar becomes off-canvas drawer behind hamburger. Tap outside dismisses.

## 6. Data Flow

### 6.1 NowWhat refresh model

Each card uses its own `useSWRList` SWR key — independent staleness, independent retry. Cache renders instantly, background refresh on focus / 60s stale. Realtime subscriptions on `payments`, `orders`, `stock`, `pos_print_jobs`, `notifications` push updates without manual refresh. One broken card never blanks the home — it shows inline "Couldn't load · tap retry".

### 6.2 Pinned nav persistence

```sql
-- existing profiles.preferences JSONB column extended
{
  "pinned_nav": [
    { "path": "/pos", "label": "POS" },
    { "path": "/orders", "label": "Orders" },
    { "path": "/masters/customers", "label": "Customers" }
  ]
}
```

Updated via `profiles.update({ preferences: ... })`. Client caches in `useApp` so sidebar doesn't refetch every render.

### 6.3 Recent pages

`useRecentPages` listens to `useLocation()`. Pushes to ring buffer (size 5) in `sessionStorage` keyed by `pos_recent:userId`. Survives navigation, resets on logout.

### 6.4 Status pill signals

| Pill | Source |
|---|---|
| Connection | navigator.onLine + supabase auth refresh failures |
| Realtime | supabase realtime subscription state callbacks |
| Print bridge | existing `usePrintBridge` (only mounted on /pos) |
| Notifications | existing notifications subscription, count badge |

`useShellHealth` consolidates these into one observable state for `<StatusPills>`.

## 7. UX & Layout

### Spatial-constancy rule

The same physical pixel position holds the same kind of thing on every page:

- **Top:** chrome (status pills, search, user)
- **Far left:** app nav (Sidebar)
- **Inner left:** module-specific filters (navRail)
- **Centre:** the work
- **Inner right:** related context cards (context)
- **Bottom (phone-only):** quick action tab bar

### Mobile pattern

- Hamburger top-left opens Sidebar drawer
- Topbar 🔍 icon opens Cmd+K full-screen sheet
- Bottom-sheet for context cards (swipe up)
- All targets ≥44px tap area
- No horizontal scroll on any page at 320px width

## 8. Errors & Edge Cases

| Edge case | Handling |
|---|---|
| One NowWhat card query fails | Card shows red footer "Couldn't load · tap retry". Other cards keep working. |
| Cmd+K returns 0 results | "Nothing found · try `>add customer`?" Suggests verb fallback. |
| `search_entities` times out | Existing `safe()` 30s timeout. Palette shows "Search slow · still trying…" then "Search timed out — refine your query." |
| Realtime drops | Status pill amber, auto-reconnect; >60s = red, toast suggests reload. |
| Tablet user opens both rails | API allows only one slide-over at a time — opening one auto-closes the other. |
| Phone bottom-sheet open during navigation | Sheet auto-closes on route change. State preserved in URL where possible. |
| User pins a route they lack permission for | Pin shows; tap → `<AccessDenied />` (existing behaviour). |
| Cashier role opens NowWhat | Card visibility predicates check role — cashier sees only POS-relevant cards (today's sales, held bills). |
| Slow network on Cmd+K | 300ms debounce + inline spinner. Esc dismisses anytime. |

## 9. Testing

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest / `node --test` | `usePinnedNav`, `useRecentPages`, card visibility predicates, search domain ranking |
| Component | Vitest + React Testing Library | `<ShellShell>` responsive collapse @ 320 / 768 / 1280 · `<NowWhatHome>` empty/loaded/error · `<CommandPaletteV2>` keyboard nav |
| Visual regression | Playwright screenshot diff | Baseline: home, /orders, /pos, settings — at 320 / 768 / 1280 |
| E2E | Playwright | Full journey: login → NowWhat loads → Cmd+K typed → click result → ShellShell renders → resize to mobile → drawer + bottom-sheet work |
| Coverage gate | ≥80% on shell primitives | Shell is reused everywhere; bugs cascade |

## 10. Lag-Protection Contract

5 of 6 lag-critical files MUST stay byte-identical:

```
useSWRList.js       must not change
AppContext.jsx      must not change
db/core.js          must not change
authGate.js         must not change
Topbar.jsx          → moved to Topbar.legacy.jsx, replaced by TopbarV2.jsx.
                      New baseline locked after Phase 4.
App.jsx             → one element swap (LayoutShell → ShellV2) plus / route
                      change. Re-baselined after Phase 4.
```

Topbar.jsx is in the lag-protection list, so this is a deliberate exception. Treated like Phase 4 of the POS work: build TopbarV2 alongside, swap, re-baseline.

## 11. Rollout Sequence (13-phase plan)

| Phase | What | Days |
|---|---|---|
| 0 | Prereqs — pinned-nav schema migration, status pill components, tests scaffolding | 0.5 |
| 1 | `<ShellShell>` primitive + responsive logic + visual regression baselines | 1 |
| 2 | TopbarV2 with status pills + Cmd+K hotbar | 1 |
| 3 | Sidebar — pinned section + recent pages + mobile drawer verification | 0.5 |
| 4 | Wire ShellV2 into App.jsx (lag-md5 re-baseline for Topbar.jsx + App.jsx) | 0.5 |
| 5 | Cmd+K palette upgrade — domain grouping + verbs + side-drawer mode | 1 |
| 6 | NowWhat home — replace Dashboard, 8 live cards, role-aware | 1.5 |
| 7 | Per-page swap to `<ShellShell>` (structural only, no per-module redesigns) | 1 |
| 8 | Status pills wired to real signals (connection, realtime, print bridge, notifs) | 0.5 |
| 9 | Mobile responsive polish — drawer, bottom-sheet, touch targets, no horizontal scroll | 1 |
| 10 | Tests — unit + component + visual regression | 1 |
| 11 | Documentation — design system reference + per-module migration guide | 0.5 |
| 12 | Deploy + smoke + lag md5 verification on prod | 0.5 |
| 13 | Buffer | 0.5 |

**Total: ~10 working days.**

Per-module redesigns (Orders Workspace, Production Board, etc.) are separate sub-projects after this lands.

## 12. Acceptance Criteria

- New `/` (NowWhatHome) loads in <1.5s on the deployed Vercel URL
- Cmd+K from any page returns first results within 500ms (debounced + Postgres-indexed)
- All 14 modules render inside `<ShellShell>` without visual regression at 320 / 768 / 1280 widths
- Mobile (320px): every page is usable — hamburger works, context cards reachable via bottom-sheet, no horizontal scroll
- Lag-critical 5/6 md5s match baseline; Topbar.jsx and App.jsx are at new locked baselines after Phase 4
- Vercel runtime logs: 0 errors during 24h after deploy
- ESLint: 0 errors (warnings allowed for known-flaky lints we accepted in POS work)
- Build: green; bundle size delta < +10% over current

## 13. Out of Scope (deferred to later sub-projects)

- Per-module redesigns (Orders Workspace, Production Board, Stock + Purchase, Dispatch, Invoicing/Payments/Reports, Masters cleanup)
- Themes / dark mode
- Tabbed multi-page UX
- Notifications panel redesign (existing NotificationsPage stays as-is)
- Saved-search persistence per module (each module's spec covers it)
- Bulk-operation framework (covered when Masters cleanup sub-project runs)
