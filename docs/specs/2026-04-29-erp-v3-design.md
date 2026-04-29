# SARAS ERP v3 — Design Spec

**Date:** 2026-04-29
**Owner:** RPK (RPK Industries, Jaipur)
**Project:** saras-erp-v3 (new repo, sibling to existing saras-erp-v2)
**Status:** Design — approved, awaiting implementation plan

---

## 1. Problem Statement

SARAS ERP v2 works but feels uneven. Modules diverge in layout, navigation, and ergonomics. The recently-shipped POS module — built on a strict 3-panel always-visible-context design language — feels noticeably easier to use than the rest of the app. The owner's stated reaction: "very easy" and "clear."

The v2 build absorbed 56 production hot-fix commits. Most were infrastructure mistakes that took months to surface (silent fetch failures, layout remount stampedes, idempotency gaps, RLS gaps, hard row caps, type coercion drift). These were not UX problems; they were the cost of discovering correct primitives by trial-and-error.

v3 mirrors every feature of v2 in the POS's design language. v2 stays frozen during comparison so the two apps can be used side-by-side. The winning app, decided per the rubric in §10, becomes the primary system. The losing app is archived.

## 2. Goals & Non-Goals

**Goals**

- Single coherent UI vocabulary across all 14 ERP modules + POS
- Phone and desktop full parity (Q5 = C); 3-panel transactional layout adapts to bottom-tabs on phone
- Every v2 lesson learned baked into v3 architecture from day 1, not retrofit
- TypeScript strict mode end-to-end
- Imported v2 primitives (`useSWRList`, `safe()`, `authGate`, `perfMark`, `useRealtimeTable`) ported as-is — they are the *solutions* to v2's bugs, not the bugs themselves
- Side-by-side comparison capable: switch-pill in topbar of both apps, same operator can use both
- Schema redesign with idempotency, soft-delete, audit log, and search-text indexes universal from day 1
- Pre-committed win threshold so the comparison can produce an honest result

**Non-Goals (v3 v1.0)**

- Multi-shop / multi-tenant — single shop, multi-warehouse only
- Multi-currency UI
- Mobile native app — PWA covers phone install needs
- AI/ML features (demand forecast, suggested re-orders)
- Carrier API integrations
- Advanced cohort/attribution reporting
- Real-time replication between v2 and v3 — periodic snapshot migration only

## 3. Decisions Locked During Brainstorming

| # | Decision | Choice |
|---|---|---|
| 1 | Deployment shape | C — separate repo, separate Vercel project, separate Supabase project, cloned data |
| 2 | Schema | B — redesign using v2 lessons; auto-migrate v2 data into the new shape |
| 3 | Comparison method | B — "Switch version" pill in topbar of both apps |
| 4 | Design strictness | C — strict 3-panel for transactional modules, flexible for analytical |
| 5 | Phone vs desktop | C — mode parity, both fully functional, layout adapts |
| 6 | Build sequence | A — sequenced module-by-module, ship + compare each before moving on |
| 7 | Architectural approach | 3 — greenfield code with imported v2 primitives + TypeScript |
| 8 | PWA | Yes — `vite-plugin-pwa`, network-first for `/rest/v1/*`, cached app shell, no offline mutations |
| 9 | Test framework | Vitest (unit/integration), Playwright (E2E), @axe-core/playwright (a11y) |
| 10 | Custom ESLint rules | `saras/use-safe-wrapper`, `saras/semantic-colors` enforced at error-level |

## 4. Architecture

### 4.1 Two-app topology

```
saras-erp-v2 (frozen)            saras-erp-v3 (this brief)
saras-erp-v2-rebuild.vercel.app  ◄── Switch pill ──►  saras-erp-v3.vercel.app
Branch: v2-rebuild               Branch: main
Repo: saras-erp-v2               Repo: saras-erp-v3
Supabase: kcnujpvzewtuttfcrtyz   Supabase: <new project>
React 19 + Vite + JS             React 19 + Vite + TypeScript strict
56 hot-fixes baked in            v2 lessons #1–15 baked in day 1
```

Switch pill: 30 LOC component installed in both apps. Click toggles the user to the equivalent route on the other app (`/orders/abc` → `/orders/abc`). Last-visited path stored in localStorage so cross-app navigation lands on something useful when path symmetry breaks.

### 4.2 Migration script

`tools/migrate-v2-to-v3.ts` lives in the v3 repo. One-shot Node script:

1. Reads from v2 Supabase via service-role key
2. For each table: transforms to v3 shape (split JSONB blobs into tables, fill `created_by`/`updated_by`, copy `created_at`)
3. Writes to v3 Supabase in dependency order (profiles → masters → orders → transactional)
4. Idempotent on `id`: re-running skips existing rows
5. Prints per-table counts + transformation failures

Re-runnable weekly during the comparison window so v3's data stays fresh against v2's accumulating orders.

### 4.3 Auth

v3 has its own Supabase Auth project. Initial accounts created with the same email addresses as v2 so muscle memory works. Passwords reset on first v3 login (security boundary between projects).

## 5. Design System & 3-Panel Shell

### 5.1 Shell anatomy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TopBar   [logo] [breadcrumb] [search] [notifs] [user]    [SwitchToV2 →]      │ 56px
├──────────────────────────────────────────────────────────────────────────────┤
│         │                                                  │                 │
│  Rail   │              Centre (the work)                   │  Context        │
│  220px  │              flex-1 · scrolls internally          │  360px         │
│         │                                                  │                 │
└──────────────────────────────────────────────────────────────────────────────┘

[Mobile <768px: bottom tab bar — Rail | Centre | Context]
```

### 5.2 Zone responsibilities (strict)

| Zone | Role | Examples |
|---|---|---|
| TopBar | Identity + cross-app | Logo, breadcrumb, Ctrl+K search, notifications, user, switch pill |
| Rail | Filter / category / list | Today's orders, status tabs, category chips, search-within-module |
| Centre | The thing being worked on | Order being edited, bill being built, production card, customer record |
| Context | Live state about the centre | Customer credit, order timeline, payment history, realtime status, quick actions |
| Bottom tabs (phone) | Zone switcher | Tap Rail / Work / Context to make that panel full-screen |

### 5.3 Responsive behaviour

| Width | Rail | Centre | Context |
|---|---|---|---|
| ≥1280px desktop | 220px expanded | flex-1 | 360px |
| 1024–1279px laptop | 220px | flex-1 | 320px |
| 768–1023px tablet | 48px icon-only | flex-1 | drawer right side |
| <768px phone | bottom-tab full-screen | bottom-tab full-screen | bottom-tab full-screen |

State stable across breakpoints — switching window size never loses the user's place.

### 5.4 Universal keyboard shortcuts

`useGlobalShortcuts` defines once, every module inherits:

| Key | Action |
|---|---|
| F1 | Focus search bar |
| F2 | "New" — context-aware |
| F3 | Discount / adjust |
| F4 | Hold / pause |
| F5 | Refresh / recall |
| F8 | Primary commit (Save / Charge / Approve) |
| F9 | Quick-print preview |
| F10 | Toggle context panel |
| F12 | Reprint last document |
| Esc | Close drawer / back / exit |
| Ctrl+K | Global search |
| Ctrl+\ | Toggle rail collapse |

### 5.5 Empty / Loading / Error slots

Every panel has three named slots. No bare spinners. No silent empty states.

```tsx
<Centre>
  <Centre.Empty title="No orders today" subtitle="Tap F2 to start a new one" />
  <Centre.Loading skeletons={4} />
  <Centre.Error error={err} onRetry={refetch} />
  <Centre.Content>{/* real UI */}</Centre.Content>
</Centre>
```

### 5.6 Live-state pills (top-right of TopBar)

- 🟢 Online / 🔴 Offline (Supabase realtime)
- 🖨 Printer ready / 🔴 Printer offline (when relevant)
- 🔔 N unread (notifications)
- 🟡 v3 (Beta) — pinned during comparison so operator always knows which app

### 5.7 Component library outline

Lives at `src/components/ui/`:

- Layout primitives: `Shell`, `Rail`, `Centre`, `Context`, `Topbar`, `BottomTabs`, `Drawer`, `Sheet`
- Content: `Card`, `ListItem`, `EmptyState`, `LoadingState`, `ErrorState`
- Inputs: `Input`, `Select`, `SearchSelect`, `Numpad`, `DatePicker`, `Toggle`, `Checkbox`
- Action: `Button`, `IconButton`, `ActionStrip`, `KeyboardHint`
- Data: `DataTable`, `DataGrid` (virtualized for >500 rows), `MetricCard`, `Currency`, `StatusBadge`
- Feedback: `Toast`, `Modal`, `Confirm`, `Stepper`

Every component has TypeScript prop types, JSDoc, and default empty/loading/error paths.

### 5.8 Design tokens

Tailwind v4 with semantic vars in `@layer base`:

- `surface` / `surface-elevated` (panel backgrounds)
- `accent` (indigo) / `accent-soft`
- `success` (emerald) / `warning` (amber) / `danger` (red)
- `text` / `text-muted` / `text-faint`
- Spacing scale: 1=4px through 12=48px

Hard rule: no raw `text-slate-700` etc outside `src/components/ui/`. ESLint rule `saras/semantic-colors` enforces.

## 6. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5.6+ strict | Lesson #12 — would have caught `{data, error}` envelope drift at build time |
| Framework | React 19 | Same as v2 |
| Build | Vite 8 | Same as v2 |
| Styling | Tailwind v4 + design tokens | Semantic vars only |
| Routing | React Router v7 (data router mode) | Loaders for parallel data fetch |
| DB / Auth / Storage / Realtime | Supabase JS v2 | Same as v2 |
| Server state | `useSWRList` (imported, ported to .ts) | 56-fix lineage, do not re-invent |
| Client state | `useReducer` + Context | No Redux, no Zustand |
| Forms | `useReducer` + Zod | Universal validation per Lesson #9 |
| Tables | `@tanstack/react-virtual` | Already proven on POS 2,310 SKUs |
| Animations | CSS transitions + framer-motion only when needed | Avoid bloat |
| Dates | date-fns | Tree-shakable, TS-native |
| Tests (unit) | Vitest | Coverage, watch mode, JSDoM |
| Tests (E2E) | Playwright | Same as v2 |
| Tests (a11y) | @axe-core/playwright | WCAG 2.1 AA gating |
| PDF | @react-pdf/renderer | Same as v2 |
| PWA | vite-plugin-pwa | Home-screen install, cached shell |

### 6.1 Imported v2 primitives (ported to TypeScript)

| File | LOC | Why preserved |
|---|---|---|
| `src/hooks/useSWRList.ts` | ~280 | SWR + sessionStorage cache + 35s grace + expectsData retry |
| `src/lib/db/core.ts` | ~130 | `safe()` 30s timeout + ensureFreshSession() pre-flight + fetchAllPaged |
| `src/lib/authGate.ts` | ~80 | Session-refresh debounce with shared coalescing — solves CRIT-4 |
| `src/lib/perfMark.ts` | ~40 | Performance.measure helpers |
| `src/lib/realtime/useRealtimeTable.ts` | ~150 | Coalesced realtime subscriptions |

Total: ~680 lines, ~half a day to port. Frozen for v3 — no edits unless real bug surfaces.

### 6.2 Lint config — non-negotiable from day 1

```jsonc
{
  "react-hooks/rules-of-hooks": "error",
  "react-hooks/exhaustive-deps": "error",
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/strict-boolean-expressions": "warn",
  "no-console": ["error", { "allow": ["warn", "error"] }],
  "saras/use-safe-wrapper": "error",
  "saras/semantic-colors": "error"
}
```

`eslint-plugin-saras/` lives in v3 repo: ~30 LOC each rule, AST walks. Catches v2's `/settings hung forever` and design-leakage classes of bug at lint time.

## 7. Schema Redesign

### 7.1 Universal infrastructure on every mutable table

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()           -- maintained by trigger
created_by      UUID REFERENCES profiles(id)
updated_by      UUID REFERENCES profiles(id)
deleted_at      TIMESTAMPTZ                                    -- NULL = live; else soft-deleted
idempotency_key UUID                                            -- unique per user when not null
```

Hard delete reserved for storage cleanup, audit log compaction, and admin GDPR. Otherwise soft-delete via `deleted_at`.

### 7.2 Universal audit log

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  table_name TEXT NOT NULL,
  row_id UUID NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('INSERT','UPDATE','DELETE','SOFT_DELETE','RESTORE')),
  before JSONB,
  after JSONB,
  diff JSONB,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip INET,
  user_agent TEXT
);
```

Single `audit_trigger()` attached to every table. v2's selective audit replaced with always-on logging.

### 7.3 Cross-source nullable FKs (Lesson #7 from day 1)

| Table | Nullable FKs |
|---|---|
| payments | order_id, invoice_id |
| invoices | order_id, customer_id |
| deliveries | order_id |
| stock_movements | order_id, purchase_order_id, dispatch_id |

### 7.4 Normalised JSONB blobs

| v2 (JSONB) | v3 (table) |
|---|---|
| `customers.shipping_addresses` | `customer_addresses` table with `type` enum, `is_default` flag |
| `machine_types.serial_numbers` | `machine_units` table — one row per physical machine |
| `process_types.compatible_machine_ids` | `process_machine_compat` junction |
| `yarn_types.compatible_product_ids` | Junction table |

`custom_fields` JSONB stays — it's genuinely arbitrary by design.

### 7.5 Universal search-text indexes

```sql
search_text TEXT GENERATED ALWAYS AS (
  lower(coalesce(name, '') || ' ' || coalesce(code, '') || ' ' || coalesce(phone, ''))
) STORED;
CREATE INDEX ix_<table>_search ON <table> USING GIN (search_text gin_trgm_ops);
```

Sub-50ms typeahead on every entity table from day 1.

### 7.6 RLS

`USING (user_id = auth.uid())` on every public table. SECURITY DEFINER only when crossing user_id boundaries. Anon EXECUTE revoked on all SECURITY DEFINER functions by default.

### 7.7 Migration runner layout

```
supabase/migrations/
├── 0000_extensions.sql
├── 0001_audit_trigger.sql
├── 0002_soft_delete_helpers.sql
├── 0003_idempotency_helpers.sql
├── 0010_profiles.sql
├── 0020_masters_party.sql
├── 0021_masters_product.sql
├── 0022_masters_process.sql
├── 0023_masters_financial.sql
├── 0024_masters_operational.sql
├── 0030_orders_core.sql
├── 0031_orders_line_items.sql
├── 0032_orders_charges.sql
├── 0040_production.sql
├── 0050_inventory.sql
├── 0060_dispatch.sql
├── 0070_invoicing.sql
├── 0080_finance.sql
├── 0090_jobwork.sql
├── 0100_quality.sql
├── 0110_pos.sql
├── 0120_notifications.sql
├── 0900_seed_minimal.sql
└── 0999_realtime_publication.sql
```

Each migration ships rollback in same file. Idempotent — re-runnable.

## 8. Module Sequence & Per-Module Pattern

### 8.1 Build sequence (Q6 = A locked)

```
Phase 0   Repo + Supabase + shell + auth + switch-pill + lessons baked in   3-4 days
Phase 1   Dashboard (analytical, flexible)                                  2 days
Phase 2   Masters (3-panel, sets pattern for CRUD)                          4 days
Phase 3   Orders Workspace                                                  4 days
Phase 4   Stock                                                             2 days
Phase 5   Production (kanban, machines/operators in context)                3 days
Phase 6   Purchase + GRN                                                    2 days
Phase 7   Dispatch                                                          2 days
Phase 8   Invoices                                                          2 days
Phase 9   Payments + Customer Ledger                                        2 days
Phase 10  Quality Check                                                     1 day
Phase 11  Jobwork + Jobwork Balance                                         2 days
Phase 12  Notifications                                                     1 day
Phase 13  Calculator (port v2 logic into new shell)                         2 days
Phase 14  Settings + Users + Permissions                                    1 day
Phase 15  Reports (analytical, dashboard-first)                             3 days
Phase 16  POS port (already designed for v2 — drop into v3 shell)           2 days
Phase 17  E2E + a11y + perf audit                                           2 days
Phase 18  Comparison report + winner-pick                                   1 day
```

**Total: ~40 working days, ~8 weeks single-developer focused work.**

### 8.2 Per-module phase pattern

```
Step 1  MODULE SPEC                            ~2h
        — 3-panel layout sketch
        — Keyboard shortcut bindings
        — Primary actions, drawer/modal flows
        — Empty/loading/error states
        — Mobile fallback
        Output: docs/specs/v3-<module>.md, committed
Step 2  BUILD                                  1-3 days
        — Page composing Shell primitives
        — Hooks (useSWRList, useReducer)
        — Typed db/* layer
        — Realtime via useRealtimeTable
        — Vitest unit tests
Step 3  SHIP                                   ~30min
        — Build green, lag invariants verified
        — Commit, push, Vercel auto-deploy
        — Smoke-test deployed via Chrome MCP
Step 4  COMPARISON DAY                         ~1 day
        — Operator runs 5-task script in BOTH apps
        — Times + clicks + friction logged
        — docs/comparison/<module>.md committed
Step 5  ITERATE                                ~half day
        — Real friction → small refinements
        — Re-ship
Step 6  DONE — move to next phase
```

No phase advances until previous module's v3 implementation passes the win-threshold (§10) or is explicitly marked "v2 better, port v2's logic into v3 shell."

### 8.3 Per-module shell sketch (transactional)

| Module | Rail | Centre | Context |
|---|---|---|---|
| Masters/Customers | Groups + search | Selected customer | Recent orders · Outstanding ₹ · Notes timeline |
| Masters/Products | Categories + filter | Selected product + image gallery | Stock by warehouse · Last 5 sales · Compatible machines |
| Masters/Suppliers | Groups + ranking | Selected supplier | Recent POs · Payment history · Quality trend |
| Masters/Machines | Machine types | Selected machine + photo | Currently producing · Maintenance · Operators |
| Masters/Operators | Shift + role filter | Selected operator + photo | Skills · Today's job · Wage ledger |
| Orders | Status tabs + today | Order being viewed/edited | Customer credit · Production · Dispatch · Payments |
| Stock | Warehouse list | Tile grid (POS-style) | Recent movements · Low-stock alerts |
| Production | Date strip + machine | Kanban: Cone → Bobbin → Braid → QC → Pack | Machine status · Operator-on-shift |
| Purchase | Supplier + status | PO being viewed/edited | Supplier history · Pending GRNs · Payment due |
| Dispatch | Today's deliveries by transport | Selected delivery | Customer · Vehicle · Driver · Map |
| Invoices | Status tabs + date range | Invoice being viewed | Customer · Order · Payments |
| Payments | Mode filter + date | Payment being viewed | Customer ledger · Invoice |
| Quality | Inspection status | Inspection being filled | Order · Quality params · Recent inspections |
| Jobwork | Customer + status | Job being viewed | Material in/out · Production status |
| POS | Categories | Product grid | Live cart |

### 8.4 Per-module shell sketch (analytical / flexible)

| Module | Layout |
|---|---|
| Dashboard | KPI strip top + activity feed + quick-action grid |
| Reports | Filter bar top + chart grid + drill-down inline |
| Calculator | 2-panel (input left / output right), v2's design re-skinned |
| Settings | Sectioned page with task-oriented headlines |
| Notifications | Single-column feed, mark-read on scroll |

## 9. Architecture Invariants (v2 Lessons → v3 Rules)

| # | v2 mistake | Cost | v3 rule | Enforced by |
|---|---|---|---|---|
| 1 | Master refetch stampede on nav | 4s lag, fetch storm | LayoutShell mounts ONCE; `<Outlet>` swaps content | Architecture doc + reviewer check |
| 2 | useSWRList silent-fail | Stuck skeletons in 3 modules | `expectsData=true` for fixed-data tables; idempotent retry | Imported primitive |
| 3 | Direct supabase.from() bypassing safe() | /settings hang | All DB calls in `safe()` | Custom ESLint rule `saras/use-safe-wrapper` |
| 4 | Hard 1000-row LIMIT default | Hid 2,449/3,449 customers | `fetchAllPaged` is the default | Imported primitive |
| 5 | `const { data = [] }` default only on undefined | 5 list pages crashed | Destructure without default; `data ?? []` after | Code review |
| 6 | Unmemoized context callbacks → infinite loops | CPU burn | All Context values useMemo'd | `react-hooks/exhaustive-deps` at error |
| 7 | order_id NOT NULL on cross-source tables | Phase 1 emergency migrations | Cross-source FKs nullable from day 1 | Migration template |
| 8 | RLS gaps (pg_graphql etc) | 65 advisor WARNs | Pre-launch advisor check in CI | CI |
| 9 | Validation gaps (whitespace firms etc) | Garbage data | Zod schemas client + server | Universal pattern |
| 10 | xlsx eager-loaded | 425KB main bundle | Lazy import at call site | Build budget enforced (350KB gzip max) |
| 11 | useCallback nested in useMemo factory | React #311 | All hooks at top level | `react-hooks/rules-of-hooks` at error |
| 12 | safe() return shape inconsistency | Terminal=undefined | `SafeResult<T> = { data: T \| null; error: Error \| null }` | TypeScript |
| 13 | App.jsx wrapping each route in Layout | Topbar/Sidebar remount stampede | Persistent shell from day 1 | Architecture |
| 14 | Stale advisor cache misled debug | Lost 30 min hunting | Always verify migrations via `execute_sql` follow-up | Process |
| 15 | Master cross-page edits don't propagate | Hard reload required | Realtime invalidation universal | Imported primitive |

## 10. Comparison Framework

### 10.1 Scoring rubric (per module)

| Dimension | Scale | Question |
|---|---|---|
| Speed | seconds | Time to complete each standard task |
| Clicks | count | Clicks/taps to complete task |
| Friction | 1–5 | "Where is X?" frequency (5 = never, 1 = constant) |
| Confidence | 1–5 | Sure the action did what you wanted (5 = obvious, 1 = unsure) |
| Phone-fit | 1–5 | Phone usability (5 = native, 1 = unusable) |

Logged in `docs/comparison/<module>.md` per module.

### 10.2 Standard 5-task scripts per module

Generated as part of each Phase Step 1 module spec. Identical scripts in v2 and v3 for apples-to-apples.

Example (Orders): create-new / find-by-phone / approve-and-progress / edit-line-rate / generate-invoice.

Example (POS): walk-in-cash-3-SKUs / registered-tax-on-account / hold-recall / open-close-drawer-Z-report.

### 10.3 Win threshold (pre-committed)

A module's v3 wins iff ALL of:

1. **Speed:** v3 average ≤ 90% of v2's
2. **Clicks:** v3 average ≤ v2's
3. **Friction + Confidence average:** v3 ≥ v2 + 0.5
4. **No regression:** zero tasks where v3 takes >120% of v2's time

Failing any → iterate (Step 5) until pass, or explicitly mark "port v2 logic into v3 shell."

### 10.4 Aggregate decision

Winner = whichever app wins **≥10 of 16 modules** AND wins **all transactional modules** (Orders / POS / Production / Stock / Dispatch / Invoices / Payments).

| v3 status | Action |
|---|---|
| Wins ≥10 + all transactional | v3 primary; v2 frozen 30 days then archived |
| Partial (e.g. 7 of 16) | Cherry-pick winning patterns into v2; archive v3 |
| Loses | v2 stays primary; backport schema improvements + lint rules + TS primitives if useful |

### 10.5 Operator time investment

Per Comparison Day: 1–2 hours real work × 16 modules = ~3 working days of comparison spread across 8-week build window.

## 11. Errors & Edge Cases

| Edge case | v3 handling |
|---|---|
| Network drop mid-write | Idempotency key on every RPC; retry-safe |
| Auth refresh queue during long-idle | `authGate.ensureFreshSession()` pre-flight every `safe()` |
| ChunkLoadError post-deploy with stale tab | "New version available — Reload" toast |
| Tab background → foreground re-fetch | useSWRList revalidate-on-focus |
| Two operators editing same record | `updated_at` optimistic-lock; conflict toast |
| Soft-delete on referenced row | Trigger checks for active references; configurable cascade |
| Currency rounding | Round to paise once at end, never mid-calc |
| Time zones | TIMESTAMPTZ; display in user's TZ (default Asia/Kolkata) |
| Walk-in customer cross-module | `customer_id NULL` pattern across orders/invoices/payments |
| Print bridge unreachable | Job stays pending; UI status pill red; reprint always available |
| WhatsApp/Email send failure | 3 retries with exponential backoff; manual retry button |
| Offline browser (PWA) | Read cached pages; refuse mutations with "Offline — will retry" toast |
| Concurrent migration rollback | Each migration ships rollback in same file; CI runs up→down→up cycle |

## 12. Testing

```
src/modules/<module>/__tests__/
  <module>.unit.test.ts         — pure logic (Vitest, JSDoM)
  <module>.integration.test.ts  — DB calls (Vitest + test Supabase)
e2e/
  <module>.spec.ts              — Playwright user journeys
```

- **Unit (Vitest, ≥80% coverage on changed files):** all hooks, all pure utils, all Zod schemas (happy + sad paths)
- **Integration (Vitest + Supabase test project):** every RPC (idempotency, rollback, multi-tenant); soft-delete + restore; audit-log fired on every op
- **E2E (Playwright):** per-module 5-task scripts (same as comparison framework); cross-module happy-path; mobile viewport separate pass
- **a11y (@axe-core/playwright):** every module page at desktop + phone; zero WCAG 2.1 AA blockers required to merge
- **Visual regression:** one screenshot per module per viewport, tracked in git; PR diffs flagged

## 13. CI Pipeline

```
on pull_request:
  - lint           (ESLint + saras/* custom rules)
  - typecheck      (tsc --noEmit, strict)
  - unit           (vitest run, ≥80% coverage on changed files)
  - schema-lint    (RLS-on, idempotency cols, audit_log present)
  - build          (vite build, fail if main bundle > 350KB gzip)
  - e2e (smoke)    (10 fastest Playwright specs)
  - a11y           (axe on all module pages)

on push to main:
  - all of above
  - integration tests against staging Supabase
  - full E2E suite
  - visual regression
  - vercel auto-deploy

pre-commit (Husky + lint-staged):
  - format changed files (Prettier)
  - lint changed files
  - unit-test changed files
```

## 14. Rollout Plan

```
Week 0      Phase 0 ships. v3 shell live. Switch pill works. Auth works.
            Sidebar shows "Coming soon" for every module.

Week 1-7    Modules ship per §8.1. Comparison Day after each. Iterate.
            Rolling friction-log + per-module verdicts in docs/comparison/.

Week 8      Phase 17-18 — full E2E + a11y + perf + final verdict.

Decision day:
  v3 wins      → 30-day grace period both apps live; new orders flow
                 into v3; v2 frozen but readable; v2 archived after 30d
  v3 partial   → cherry-pick winning patterns; archive v3
  v3 loses     → v2 stays primary; backport useful pieces (TS primitives,
                 schema improvements, lint rules)
```

## 15. Rollback Safety

- **Database:** separate Supabase = v2 data physically untouched; rollback = abandon v3 project
- **Frontend:** separate Vercel = v2 deploy never paused; pull DNS off v3 = instant rollback
- **During comparison week:** both apps concurrent = no single point of failure; catastrophic v3 bug = use v2 that day, fix v3 next

## 16. Out of Scope (v3 v1.0)

- Multi-shop / multi-warehouse-as-tenant — single shop, multi-warehouse only
- Multi-currency UI (DB supports it; UI shows ₹)
- Mobile native app — PWA covers phone install
- AI/ML features
- Carrier API integrations
- Advanced cohort/attribution reporting
- Real-time bidirectional sync between v2 and v3

## 17. Acceptance Criteria

The v3 project ships when:

1. All 16 module phases shipped per §8.1 sequence
2. Each module passes Phase Step 4 comparison gate or is explicitly marked "port v2 logic"
3. CI green: lint + typecheck + unit ≥80% + integration + e2e + a11y + visual regression + bundle ≤350KB gzip
4. Comparison framework executed for all 16 modules; per-module verdicts logged
5. Final aggregate decision recorded in `docs/comparison/final-verdict.md`
6. Either: v3 wins → 30-day grace begun; or v3 partial/loses → v2 archived findings backported
