# SARAS ERP Shell — Implementation Plan

**Spec:** `docs/specs/2026-05-09-erp-shell-design.md`
**Branch target:** `v2-rebuild`
**Lag-protection contract:** 5 of 6 lag-critical files (`useSWRList`, `AppContext`, `db/core`, `authGate`) MUST remain byte-identical at every phase. `Topbar.jsx` and `App.jsx` are deliberate re-baselines at Phase 4.

---

## Phase 0 — Prerequisites (½ day)

| Action | Detail |
|---|---|
| Create `profiles.preferences` JSONB column if missing | Migration `add_profiles_preferences_jsonb`. Default `'{}'::jsonb`. |
| Verify `search_entities` RPC indexes | Confirm GIN indexes on `customers.search_text`, `suppliers.search_text`, `products.search_text`, `orders.invoice_number`, `invoices.invoice_number`. Add any missing. |
| Add `react-hotkeys-hook` dep | One small dep for keyboard binding ergonomics — `npm i react-hotkeys-hook`. (~3KB gzipped.) |
| Create `src/components/shell/` directory | Empty scaffold; future shell primitives land here. |
| Confirm baseline lag md5s | Snapshot the 6 lag-critical files for the contract. |

**Done when:** Migration applied · `search_entities` test query under 200ms p95 · `npm run build` green · all 6 lag md5s recorded.

**Risk:** GIN index creation on `customers` (3450 rows) blocks reads briefly. Mitigation: `CREATE INDEX CONCURRENTLY` if missing.

---

## Phase 1 — `<ShellShell>` primitive + responsive logic (1 day)

| File | Change |
|---|---|
| `src/components/shell/ShellShell.jsx` | NEW — 3-panel scaffold with responsive ladder. Container queries via Tailwind `@container` plugin if needed. |
| `src/components/shell/ShellShell.css` | NEW — minimal CSS for slide-over animations, container queries |
| `src/components/shell/__tests__/ShellShell.test.jsx` | NEW — render at 320 / 768 / 1280; assert correct panels visible + collapse classes applied |

**Acceptance:**
- All 4 breakpoints (320 / 768 / 1024 / 1280) collapse correctly
- `navRail` / `context` props default to `null` and component degrades to single-column
- Vitest component tests cover empty/single-rail/dual-rail variants
- Visual regression baselines captured for 4 widths

**Risk:** Tailwind container queries may need plugin. Mitigation: stick with viewport queries (`md:` / `lg:` / `xl:`) which are already in use.

---

## Phase 2 — TopbarV2 with status pills + Cmd+K hotbar (1 day)

| File | Change |
|---|---|
| `src/components/shell/TopbarV2.jsx` | NEW — left zone (hamburger + brand) + centre zone (Cmd+K hotbar) + right zone (status pills + avatar) |
| `src/components/shell/StatusPills.jsx` | NEW — 4 pills: connection, realtime, print bridge (only on /pos), notifications |
| `src/hooks/useShellHealth.js` | NEW — consolidates connection / realtime / notif state for pills |
| `src/components/Topbar.jsx` | NOT TOUCHED YET — replacement happens at Phase 4 |

**Acceptance:**
- TopbarV2 renders standalone in Storybook-like sandbox at `/dev/topbar` (gated by env)
- Status pills update live when network is toggled (DevTools offline mode)
- Cmd+K hotbar opens existing `<CommandPalette>` via state hoisted to `<ShellV2>` (still being built)
- Avatar dropdown matches existing menu items (Profile · Sign out)

**Risk:** `useShellHealth` could miss edge cases (Wi-Fi reconnect not flipping pill back to green). Mitigation: subscribe to `online`/`offline` events + Supabase auth refresh callbacks.

---

## Phase 3 — Sidebar pinned + recent pages + mobile drawer (½ day)

| File | Change |
|---|---|
| `src/components/Sidebar.jsx` | EDIT — add `<PinnedNav>` block at top; preserve existing categories. |
| `src/components/shell/PinnedNav.jsx` | NEW — pinned section + recent pages section |
| `src/hooks/usePinnedNav.js` | NEW — read/write `profiles.preferences.pinned_nav`, cached in `useApp` |
| `src/hooks/useRecentPages.js` | NEW — listens to `useLocation()`, ring buffer in sessionStorage |
| `src/lib/db/profiles.js` | NEW (or extend existing) — `updatePreferences(patch)` partial update |

**Acceptance:**
- Right-click any nav item → context menu "Pin to top" works
- Pinned items appear above categories with separator
- Recent (3) appears below pinned, updates live as user navigates
- Mobile (<768px) — sidebar opens as off-canvas drawer; tap outside dismisses; survives existing `transition-transform`
- Per-user preferences persist across logout/login

**Risk:** Right-click context menu may collide with browser default. Mitigation: long-press on touch + 3-dot menu icon visible on hover for desktop discoverability.

---

## Phase 4 — Wire ShellV2 + lag-md5 re-baseline (½ day) **CRITICAL PATH**

| File | Change |
|---|---|
| `src/components/shell/ShellV2.jsx` | NEW — top-level wrapper: `<TopbarV2>` + `<Sidebar>` + `<RouteShell>` + `<CommandPalette>`. Replaces `<LayoutShell>` element. |
| `src/components/Topbar.jsx` | RENAME to `Topbar.legacy.jsx` (preserved for rollback). |
| `src/App.jsx` | EDIT — single element swap: `<LayoutShell />` → `<ShellV2 />`. Other routes unchanged. **md5 re-baseline planned.** |
| **Lag md5 re-baseline contract** | After this phase: record new locked baselines for `Topbar.legacy.jsx` (replaces old `Topbar.jsx`) and `App.jsx`. Other 4 files MUST still match Phase 0 snapshot. |

**Acceptance:**
- Full app loads in deployed preview, every route still works (smoke: /dashboard, /orders, /enquiries, /pos, /masters/customers, /reports)
- Console: 0 errors
- Vercel runtime logs: 0 errors over 1 hour
- `useSWRList`, `AppContext`, `db/core`, `authGate` md5s match Phase 0 baseline
- No lag regression — verified by SPA-nav from /masters/products to /enquiries

**Risk:** Hidden coupling between Topbar.jsx and any module (e.g. notification badge). Mitigation: grep all imports of `Topbar.jsx` before rename; ensure `TopbarV2` exposes the same public surface (notification dropdown via `<NotificationsDropdown>` reused).

---

## Phase 5 — CommandPaletteV2 upgrade (1 day)

| File | Change |
|---|---|
| `src/components/shell/CommandPaletteV2.jsx` | NEW — domain-grouped results, verb commands, side-drawer mode |
| `src/components/CommandPalette.jsx` | RENAME to `CommandPalette.legacy.jsx` |
| `src/lib/db/search.js` | NEW — wraps `search_entities` RPC + result-grouping helper |
| `src/components/shell/SearchResultDrawer.jsx` | NEW — slide-over to view a record without leaving current page |

**Acceptance:**
- Cmd+K from any page opens palette in <100ms
- Typing "sharma" returns customers + their orders + invoices, all grouped, in <500ms p95
- `>add customer` opens AddCustomerModal directly
- `Cmd+Enter` on a result opens it in side-drawer; Escape dismisses; centre page state preserved
- Tab cycles domain filter (All → People → Records → Products → Navigate → All)
- Recent items show on empty palette (last 5 records touched)
- Mobile — full-screen sheet, sticky search bar, keyboard slides up

**Risk:** `search_entities` RPC may need additional indexes once we surface more domains. Mitigation: explain query plan in Phase 0; add indexes if p95 > 500ms.

---

## Phase 6 — NowWhatHome (1.5 days)

| File | Change |
|---|---|
| `src/pages/NowWhatHome.jsx` | NEW — replaces Dashboard at `/`. 3-2-1 column responsive grid of action cards. |
| `src/pages/Dashboard.jsx` | RENAME to `Dashboard.legacy.jsx` |
| `src/pages/now-what/cards/` | NEW dir — one file per card type (`OverduePaymentsCard.jsx`, `LowStockCard.jsx`, etc.) |
| `src/pages/now-what/cards/_template.js` | NEW — `<NowWhatCard>` shared shell component (color, icon, count, tap handler, error footer) |
| `src/pages/now-what/visibility.js` | NEW — `cardsForRole(role, perms)` predicate — cashier sees subset |
| `src/App.jsx` | EDIT — `/` route element changes from `<Dashboard />` to `<NowWhatHome />` |

**Acceptance:**
- All 8 cards render with real data on the deployed Vercel
- Each card uses its own `useSWRList` SWR key + realtime subscription
- One broken card never blanks the home; shows "Couldn't load · tap retry" footer
- Empty state: "✅ Nothing needs your attention right now" when zero pending items
- Quick-action row at bottom — `+ New Order`, `+ POS`, `🔍 Search`
- Cashier role sees only POS cards (held bills, today's sales)
- Mobile (320px) — single column, no horizontal scroll, swipeable

**Risk:** Slow advisor query for "overdue payments" with 3450 customers. Mitigation: pre-aggregate via Postgres view if p95 > 800ms.

---

## Phase 7 — Per-page swap to `<ShellShell>` (1 day) — **DEFERRED**

**Decision (2026-05-09):** skipped during the shell build. Reason: wrapping
all 30+ existing pages in `<ShellShell>` with no rails is a no-op visually.
The wrap only earns its keep when a page actually has navRail/context content
to render — which happens during per-module redesigns. Each per-module
sub-project (Orders Workspace, Production Board, Stock+Purchase, Dispatch,
Invoicing+Payments+Reports, Masters cleanup) introduces its own
`<ShellShell>` wrap when it adds rails. No bulk prep needed.

ShellShell remains shipped and ready (Phase 1, commit 4d1f2b6). Per-module
phases will adopt it organically.

---

(historical content — what Phase 7 would have done if we'd run it)


| Files | Change |
|---|---|
| All page components | EDIT — wrap top-level `<div className="fade-in...">` in `<ShellShell>{...}</ShellShell>`. No `navRail` / `context` yet — those come per-module. |

Pages affected (≈14):

```
OrdersPage, OrderForm, OrderDetail
EnquiriesPage, EnquiryForm
CalculatorPage              ← stays 2-card; just wrap in ShellShell with no rails
ProductionPage
StockPage
DispatchPage
InvoicesPage
PaymentsPage
PurchasePage, PurchaseReconcilePage
ReportsPage
JobworkPage, JobworkBalancePage
QualityPage
NotificationsPage
SettingsPage
ImportPage
All masters/* pages         ← just ShellShell wrap, no rails until Masters cleanup sub-project
```

**Acceptance:**
- Every existing page still renders identically at 1280px (visual regression baseline screenshots match)
- Mobile (320px) — no horizontal scroll on any page
- All 14 modules verified individually via the Cmd+K palette navigate domain
- Lag-critical 4 md5s unchanged

**Risk:** Some pages may have absolute-positioned children that break under ShellShell. Mitigation: visual regression diff per page; fix only the broken ones.

---

## Phase 8 — Status pills wired to real signals (½ day)

| File | Change |
|---|---|
| `src/hooks/useShellHealth.js` | EDIT — wire connection (online/offline events + supabase auth refresh) · realtime (channel state callbacks) · print bridge (only when path === /pos) · notifications (existing subscription) |
| `src/components/shell/StatusPills.jsx` | EDIT — color states based on real signals |

**Acceptance:**
- Toggle DevTools network "Offline" → connection pill flips to red within 2s
- Disconnect Wi-Fi → realtime pill amber, then red after 60s
- Run `tools/print-bridge` → green pill on /pos; kill it → red pill
- New notification arrives → bell icon shows unread count

**Risk:** Realtime channel doesn't expose state cleanly. Mitigation: subscribe to `system` channel events from Supabase JS client.

---

## Phase 9 — Mobile responsive polish (1 day)

| Action | Detail |
|---|---|
| Bottom-sheet for context cards | New `<BottomSheet>` primitive — swipe-to-dismiss, focus trap |
| Hamburger drawer behaviour | Existing transition + tap-outside dismiss verification |
| Touch targets ≥44px audit | Walk every page at 375px (iPhone), measure each tap target |
| No horizontal scroll audit | Each page at 320px must not produce horizontal scrollbar |
| Field-mode shortcut | If `pos/field` route, hide hamburger entirely (already full-screen) |

**Acceptance:**
- iPhone SE (375x667) — every page usable, every tap target reachable
- Pixel 4a (393x851) — same
- Tablet portrait (768x1024) — 2-column ShellShell with pull-tab context
- No regression on POS register layout

**Risk:** `<BottomSheet>` needs proper accessibility (focus trap, Escape to close). Mitigation: use `react-aria` if existing primitives don't cover.

---

## Phase 10 — Tests (1 day)

| File | Scope |
|---|---|
| `src/components/shell/__tests__/ShellShell.test.jsx` | Already from Phase 1 — extend with edge cases |
| `src/components/shell/__tests__/CommandPaletteV2.test.jsx` | NEW — keyboard nav, domain filter, verb commands |
| `src/hooks/__tests__/usePinnedNav.test.js` | NEW — pin/unpin, persistence, dedup |
| `src/hooks/__tests__/useRecentPages.test.js` | NEW — ring buffer of size 5, dedup, sessionStorage round-trip |
| `src/pages/now-what/__tests__/visibility.test.js` | NEW — role-based card filtering matrix |
| `e2e/shell-flow.spec.js` | NEW — login → NowWhat → Cmd+K → click result → ShellShell renders → resize to 320 → drawer + bottom-sheet work |
| `e2e/shell-mobile.spec.js` | NEW — same journey at iPhone SE viewport |

**Acceptance:** all green in CI · coverage report ≥ 80% on shell primitives + hooks · Playwright artifacts uploaded.

---

## Phase 11 — Documentation (½ day)

| File | Content |
|---|---|
| `docs/SHELL.md` | NEW — design system reference. ShellShell API, palette verbs, status pill states, breakpoints. With diagrams. |
| `docs/MIGRATING_TO_SHELL.md` | NEW — for per-module redesign sub-projects: how to wrap a page in ShellShell, where to put navRail/context, what NOT to do. |
| `CLAUDE.md` | EDIT — add a "Shell Architecture" section summarising the new primitives so future sessions know to use them. |

**Acceptance:** Both docs present, internally cross-linked, with file paths to all primitives.

---

## Phase 12 — Deploy + smoke + lag md5 verification on prod (½ day)

| Step | Detail |
|---|---|
| Push to `v2-rebuild` | Triggers Vercel auto-deploy |
| Wait for production deploy | List_deployments until state = READY |
| Smoke via Chrome MCP | Login → home loads → Cmd+K opens → /orders renders → /pos still works → resize to 320 |
| Vercel runtime logs over 1h | 0 errors expected |
| Lag md5 final check | 4 protected files unchanged from Phase 0 baseline; Topbar.legacy.jsx + App.jsx at Phase 4 baselines |

**Acceptance:**
- Vercel state READY
- Smoke clean: 0 console errors, 0 visual regressions
- Lag contract held

---

## Phase 13 — Buffer (½ day)

Reserved for issues found during prod smoke. Not allocated to specific work.

---

## Critical Path

`Phase 0 → 1 → 2 → 4 → 6 → 7 → 12`

Phases 3, 5, 8, 9, 10, 11 can fan out in parallel after Phase 4 lands (independent developers / sessions).

## Total Estimate

**~10 working days** end-to-end. **~6 days** if Phases 3, 5, 8, 9 are parallelised after Phase 4.

## Rollback

Each phase is its own commit on `v2-rebuild`. Bad phase → `git revert` of that phase's commits.

- Topbar.jsx → restore from `Topbar.legacy.jsx`
- Dashboard.jsx → restore from `Dashboard.legacy.jsx`
- CommandPalette.jsx → restore from `CommandPalette.legacy.jsx`
- App.jsx → revert single element swap
- Migration `add_profiles_preferences_jsonb` is additive — no rollback needed unless explicitly desired

## Per-module sub-projects (after this lands)

| Order | Sub-project | Days | Pre-req |
|---|---|---|---|
| 1 | Orders Workspace | 8-12 | Shell |
| 2 | Production Board | 8-12 | Shell |
| 3 | Stock + Purchase | 5-7 | Shell + Orders (reuses tile component) |
| 4 | Dispatch | 3-5 | Shell |
| 5 | Invoicing + Payments + Reports | 5-7 | Shell |
| 6 | Masters cleanup + bulk wizards | 3-5 | Shell |
