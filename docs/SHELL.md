# SARAS ERP — Shell Reference

The shared chrome that wraps every non-POS route. Built in `docs/specs/2026-05-09-erp-shell-design.md`.

## Architecture

```
<ShellV2>                                src/components/shell/ShellV2.jsx
├── <Sidebar>                            src/components/Sidebar.jsx
│   └── <PinnedNav>                      src/components/shell/PinnedNav.jsx
│       ├── Pinned section               (per-user, profiles.preferences.pinned_nav)
│       └── Recent section               (ring buffer in sessionStorage, last 5)
├── <TopbarV2>                           src/components/shell/TopbarV2.jsx
│   ├── Left:  hamburger + brand
│   ├── Centre: Cmd+K hotbar
│   └── Right: offline queue · StatusPills · notifications · profile
├── <RouteShell><Outlet/></RouteShell>   per-page content lands here
└── <CommandPaletteV2>                   src/components/shell/CommandPaletteV2.jsx
    └── <SearchResultDrawer>             src/components/shell/SearchResultDrawer.jsx (peek mode)
```

POS routes are NOT inside `ShellV2` — they use `PosLayout` (full-screen, no chrome).

## Responsive breakpoints

| Width | Sidebar | Body |
|---|---|---|
| ≥1280px (xl) | always visible (lg:ml-64) | full-width |
| 1024–1279px (lg) | always visible | full-width |
| 768–1023px (md) | hamburger drawer | full-width |
| <768px (sm) | hamburger drawer | full-width |

## `<ShellShell>` API

The 3-panel scaffold per-module pages mount inside.

```jsx
<ShellShell
  navRail={<OrdersFilters/>}        // optional left rail (filters / sub-nav)
  context={<CustomerCard/>}         // optional right rail (related context)
  navRailWidth={200}                 // optional, default 200
  contextWidth={360}                 // optional, default 360
>
  <OrdersList/>                      // required centre
</ShellShell>
```

Pages without rails render children straight through — no wasted layout space (Calculator + Settings use this path).

### Responsive ladder

| Width | Behaviour |
|---|---|
| ≥1280px | navRail · centre · context (all visible) |
| 1024–1279px | navRail · centre · context-as-pull-tab |
| 768–1023px | centre only · nav + context behind top tabs |
| <768px | centre only · nav as SlideOver (left) · context as BottomSheet |

Only one slide-over may be open at a time — opening one closes the other.

## CommandPaletteV2

Primary nav surface. **Cmd+K** (Mac) / **Ctrl+K** (Win) / **`/`** opens it.

### Domains

| Domain | Source | Example match |
|---|---|---|
| 🧭 Navigate | nav items + recent pages | "ord" → "Go to Orders" |
| 👥 People | `customers` + (later) `suppliers` | "sharma" → "Sharma Textiles · 9XXX · GSTIN" |
| 📦 Records | `orders` + `invoices` + `enquiries` + `payments` + `deliveries` + `purchase_orders` | "0042" → "POS-20260509-0042" |
| 📐 Products | `products` + (later) `materials` | "round cord" → "VRT-005 · stock 84m · ₹12/m" |

### Verb commands (prefix `>`)

| Verb | Action |
|---|---|
| `>add customer` | open AddCustomerModal |
| `>new order` | navigate /orders/new |
| `>new enquiry` | navigate /enquiries/new |
| `>new invoice` | navigate /invoices?new=1 |
| `>new payment` | navigate /payments?new=1 |
| `>pos` | navigate /pos |
| `>pos field` | navigate /pos/field |
| `>photos` | navigate /pos/photo-wizard |

Each verb is perm-gated — users without the permission won't see the entry.

### Keyboard

| Keys | Action |
|---|---|
| ↑ / ↓ | nav |
| Enter | open |
| Cmd/Ctrl + Enter | peek in side drawer (record results only) |
| Tab | cycle domain filter (All → Navigate → People → Records → Products → All) |
| Esc | close |

### Recent items

On empty palette, last 5 records you touched appear. Stored in `sessionStorage` keyed per user (`saras_palette_recent:<uid>`).

## Status pills

Always-visible health indicators in the topbar's right zone. Hidden on phone (sm:hidden) to keep the topbar uncluttered.

| Pill | Green | Amber | Red |
|---|---|---|---|
| **Net** | online | reconnecting (TOKEN_REFRESHED for 2s) | offline / SIGNED_OUT |
| **Live** | realtime SUBSCRIBED | CHANNEL_ERROR / TIMED_OUT | CLOSED |
| **Print** (only on /pos) | bridge online | — | bridge offline |

Driven by `useShellHealth` (consolidates `navigator.online`, Supabase `onAuthStateChange`, channel `shell:health` callbacks) + `usePrintBridge`.

## NowWhatHome — `/` route

Action-prompted feed of pending work. Each card is its own `useSWRList` SWR key (independent caching + realtime).

| Card | Data source | Color |
|---|---|---|
| Overdue payments | `invoices.balance_due > 0` + `customers.overdue_days_allowed` exceeded | red |
| Orders pending approval | `orders.status in ('booking','draft')` | amber |
| Low stock | `stock.quantity < stock.min_stock_level` | red |
| Jobs ready for QC | `production_plans.status='qc_pending'` | amber |
| Dispatches today | `deliveries.delivery_date = today AND status != 'completed'` | green |
| Held POS bills | `invoices.held = true` | amber |
| Today's POS sales | `invoices.source='pos' AND held=false AND today` (always renders) | blue |
| New enquiries today | `enquiries.created_at >= today` | blue |

Cards self-hide when empty (`hideWhenEmpty=true` default; `TodaySalesCard` is the exception).

Role-aware visibility via `pages/now-what/visibility.js`:
- admin / manager: 8 cards
- staff: 7 (no overdue_payments)
- viewer: 4 read-only
- cashier: 2 POS-only

## Files at a glance

```
src/components/shell/
├── ShellV2.jsx              top-level wrapper
├── TopbarV2.jsx             three-zone topbar
├── StatusPills.jsx          health pills (sm:hidden)
├── PinnedNav.jsx            sidebar pinned + recent section
├── ShellShell.jsx           3-panel scaffold for module pages
├── BottomSheet.jsx          mobile slide-up sheet
├── CommandPaletteV2.jsx     primary nav surface
└── SearchResultDrawer.jsx   peek mode

src/hooks/
├── useShellHealth.js        connection + realtime pills state
├── usePinnedNav.js          pin/unpin + persistence
└── useRecentPages.js        ring buffer of last 5 routes

src/lib/
├── labelForPath.js          pure path → label helper (testable)
└── db/
    ├── profiles.js          getPreferences + mergePreferences
    └── search.js            searchAcrossDomains + formatResult

src/pages/
├── NowWhatHome.jsx          replaces Dashboard at /
├── Dashboard.legacy.jsx     preserved for rollback
└── now-what/
    ├── visibility.js        cardsForRole + isCardVisible
    ├── NowWhatCard.jsx      shared card shell
    └── cards.jsx            8 card components + CARD_REGISTRY

src/components/
├── Layout.legacy.jsx        preserved for rollback (was Layout.jsx)
├── Topbar.legacy.jsx        preserved for rollback (was Topbar.jsx)
└── CommandPalette.legacy.jsx preserved for rollback
```

## Lag-protection contract

```
useSWRList.js       MUST NOT CHANGE
AppContext.jsx      MUST NOT CHANGE
db/core.js          MUST NOT CHANGE
authGate.js         MUST NOT CHANGE
Topbar.legacy.jsx   preserved (4aa7f8…) — original content
App.jsx             re-baseline allowed (current: fa5532…)
```

Any future shell change MUST keep the first four byte-identical or this contract is being violated.
