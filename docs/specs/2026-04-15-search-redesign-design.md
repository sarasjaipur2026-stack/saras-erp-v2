# Search Redesign — Design Spec

**Date:** 2026-04-15
**Author:** RPK + Claude
**Status:** Approved — ready for implementation planning
**Target project:** SARAS ERP v2 (React 19 + Vite 8 + Supabase)

---

## 1. Problem

Search across SARAS ERP v2 is weak. Users can't find records they know exist because:

1. **Per-page search boxes only match the main name field.** Typing a GSTIN, phone number, city, or contact person's name into the Customers search returns nothing even when the customer exists.
2. **No global search.** To find an invoice for "A. L. Paper House" the user must navigate to Invoices first, then search. There is no one-bar-find-anything.
3. **No typo tolerance.** Hindi-transliterated firm names have dozens of spelling variants ("Aggarwal"/"Agarwal", "Sharmaa"/"Sharma", "Paper House"/"Paper Hous"). Today's exact-substring matching misses all of these.
4. **No filter composition.** Users can't ask "orders in production status, in Jaipur, due this week". They can apply one filter at a time.
5. **No shareable filter state.** A filter configuration can't be bookmarked or sent to a colleague.

## 2. Goals

- **Find anything by any field.** Firm name, contact name, GSTIN (full or prefix), phone (last 4 digits), city, order/invoice/challan number, product name, amount, date range, status — all find the record.
- **Typo-tolerant.** Hindi spelling variants and common typos still match.
- **Show customer-first results.** Regardless of which field matched, the row displays the firm name (primary) + short identifier (secondary). The match field is hidden from display.
- **Global Cmd+K palette.** One keyboard shortcut from anywhere opens a search bar that spans all 9 core entity types.
- **Per-module filter bar.** Every list page gets combinable filter chips, URL-persisted state, and saved views.
- **Sub-100ms response time** at 10,000+ records per table.
- **Mobile-ready.** Works one-handed from the factory floor.

## 3. Non-goals

- Custom query language (no SQL-like syntax in the search box)
- Full-text search across attachments, comments, images
- Semantic / AI search (may come later; not in this spec)
- Replacing any current list-page functionality (filter bar is additive)

## 4. Architecture

### 4.1 Three layers

| Layer | What | Where it appears |
|---|---|---|
| **1. Global Cmd+K palette** | One keyboard shortcut → modal search across all entities | Available from every route. `Ctrl+K` on desktop; 🔍 icon in header on mobile |
| **2. Per-module filter bar** | Combinable filter chips + search box scoped to one entity type | Every list page (Orders, Customers, Invoices, Enquiries, Payments, Deliveries, Purchase Orders, Stock) |
| **3. Server-side fuzzy match** | Postgres trigram + tsvector + RPC that powers both layers above | Invisible to the user; the substrate for layers 1 & 2 |

### 4.2 Search infrastructure (Postgres)

**Extension:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**Indexed tables:** 9 core tables get a `search_text` column + GIN trigram index + trigger that auto-maintains the column on insert/update.

| Table | Fields concatenated into `search_text` |
|---|---|
| `customers` | firm_name, contact_name, gstin, phone, email, city, state, industry_sector, priority_tier |
| `orders` | order_number, notes + joined customer firm_name + city |
| `enquiries` | enquiry_number, source, notes + joined customer firm_name |
| `invoices` | invoice_number + joined customer firm_name + gstin |
| `payments` | reference_number, notes, payment_mode + joined customer firm_name |
| `deliveries` | challan_number, vehicle_number, driver_name + joined customer firm_name |
| `purchase_orders` | po_number, notes + joined supplier name |
| `stock_movements` | notes + joined product name |
| `products` | name, hindi_name, sku, hsn_code |

All text stored lowercase; trigger normalises on write.

**Index pattern (per table):**
```sql
CREATE INDEX idx_{table}_search ON {table} USING GIN (search_text gin_trgm_ops);
```

### 4.3 The `search_entities` RPC

Single function that powers the global Cmd+K palette.

```sql
search_entities(
  q         text,
  types     text[] DEFAULT NULL,  -- NULL = all entity types
  max_per   int    DEFAULT 5,
  p_user_id uuid   DEFAULT auth.uid()
) RETURNS TABLE (
  entity_type   text,
  entity_id     uuid,
  primary_label text,  -- firm name (what displays in bold)
  secondary     text,  -- "ORD-0412" or NULL for customers
  metadata      jsonb, -- status, amount, date, etc. for the right-side columns
  rank          real   -- 0..1
)
```

**Ranking logic (applied in order):**
1. **Exact-match boost** — identifiers (`ORD-0412`, full GSTIN, full phone) rank 1.0
2. **Starts-with boost** — prefix match adds 0.3 to similarity
3. **Trigram similarity** — `pg_trgm` similarity() score (0..1)
4. **Recency boost** — +0.1 if the row was updated in the last 7 days
5. **Per-type cap** — after ranking, keep top `max_per` per `entity_type` so one type never drowns others

**Smart keyword mapping** (pre-processing on the `q` string before the SQL query):

| Keyword typed | Rewritten to |
|---|---|
| `overdue` | status IN ('production','qc','dispatch') AND delivery_date_1 < today |
| `pending payment` | balance_due > 0 AND status != 'cancelled' |
| `due today` / `due tomorrow` / `due this week` | delivery_date_1 filter |
| `unpaid` | balance_due = grand_total |
| `today`, `yesterday`, `last week` | created_at filter |

If the query doesn't match any smart keyword, it falls through to trigram match as normal.

### 4.4 Per-module `search_*` RPCs

Each list page gets its own scoped RPC (e.g. `search_orders`, `search_customers`) with structural filters:

```sql
search_orders(
  q           text DEFAULT '',
  status      text[] DEFAULT NULL,
  city        text[] DEFAULT NULL,
  date_from   date DEFAULT NULL,
  date_to     date DEFAULT NULL,
  amount_min  numeric DEFAULT NULL,
  amount_max  numeric DEFAULT NULL,
  priority    text[] DEFAULT NULL,
  sort_by     text DEFAULT 'created_at',
  sort_dir    text DEFAULT 'desc',
  page_size   int DEFAULT 50,
  page_offset int DEFAULT 0
) RETURNS TABLE (
  ..., total_count int
)
```

- Structural filters are real SQL WHERE clauses against indexed columns (not post-filtering of JS arrays)
- `total_count` in every row supports the "Showing 42 of 287 matches" footer
- Page size capped at 200 server-side

### 4.5 URL state format

All filter state lives in the URL so it is bookmarkable and shareable.

**Format:** `/orders?q=paper&status=production,qc&city=Jaipur&due=this_week&sort=created_at:desc&page=1`

Parse/encode lives in one hook: `useFilterState(entityType)`. All list pages use it; no page rolls its own URL handling.

### 4.6 Saved views

A `saved_views` table stores named filter configurations:
```sql
CREATE TABLE saved_views (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  entity_type text NOT NULL,  -- 'orders' | 'customers' | ...
  name text NOT NULL,         -- "My overdue orders"
  filter_state jsonb NOT NULL,
  shared boolean DEFAULT false,  -- false = private, true = shared with all staff
  created_at timestamptz DEFAULT now()
);
```

Users save the current filter state with a name, see their views in a dropdown on each list page, and optionally share a view with all staff in the org.

## 5. User experience

### 5.1 Result display rule (applies to all layers)

**Customer rows:** firm name only.
**Non-customer rows:** firm name + short identifier.

| Entity | Display |
|---|---|
| Customer | `A. L. Paper House` |
| Order | `A. L. Paper House · ORD-0412` |
| Invoice | `A. L. Paper House · INV-0203` |
| Payment | `Atlas Paper · PAY-0067` |
| Delivery | `Ashok Paper · CHN-0089` |
| Enquiry | `New Prospect Ltd · ENQ-0034` |
| Purchase Order | `Surya Yarn Traders · PO-0145` |
| Stock movement | `Product: 3mm Jute Twine · +500 units` |
| Product | `Jute Twine 3mm · SKU-JT03` |

Short identifier is derived from the full number — `ORD/25-26/0412` displays as `ORD-0412`. Full number shown on hover / on the detail page.

Right-side columns show contextual metadata pulled from `metadata jsonb`:
- Orders: amount + status + due date
- Invoices: amount + paid status
- Payments: amount + date + mode
- Deliveries: challan date + vehicle

### 5.2 Global Cmd+K palette

**Trigger:** `Ctrl+K` (Windows/Linux) / `Cmd+K` (Mac) from any route. On mobile, 🔍 icon in the top header.

**Empty state (no query typed):**
```
RECENT
  A. L. Paper House                  opened 5 min ago
  ORD-0412                           opened 1 hour ago

JUMP TO
  🆕 New Order                       Ctrl+N
  🆕 New Enquiry                     Ctrl+Shift+N
  📋 Today's dispatches              Ctrl+D
  💰 Overdue payments                Ctrl+O
```

**Active state (query typed):**
```
CUSTOMERS
  A. L. PAPER HOUSE LLP
  Ashok Paper House
  Atlas Paper Mills

ORDERS
  A. L. Paper House · ORD-0412    ₹1,24,500   production
  Ashok Paper House · ORD-0387    ₹47,200     dispatch

INVOICES
  A. L. Paper House · INV-0203    ₹1,24,500   partially_paid

PAYMENTS
  Atlas Paper · PAY-0067          ₹50,000     UPI · 2026-04-12

  💡 Tab to filter by type · ↑↓ navigate · ⏎ open
```

**Interaction:**
- Typing triggers debounced (150ms) RPC call
- ↑↓ navigates results; ⏎ opens; `Esc` closes
- Tab cycles through entity type filters: "All → Customers only → Orders only → ..."
- Recent searches kept in `localStorage` per user (last 20)
- Two-firm tagging: results tagged `SU` or `SC` chip when the record is firm-specific

**Mobile:** tap 🔍 icon → full-screen takeover. Voice input via mic icon (browser Web Speech API). Large touch targets. Otherwise identical behavior.

### 5.3 Per-module filter bar

Every list page gets this strip above the table:

```
┌───────────────────────────────────────────────────────────────────┐
│ 🔍 Search firm, GSTIN, phone, city...                             │
├───────────────────────────────────────────────────────────────────┤
│ [Status: production ×] [City: Jaipur ×] [Due: this week ×] [+ Add]│
├───────────────────────────────────────────────────────────────────┤
│ Showing 42 of 287 matches  ·  💾 Save as view  ·  ⬇ Export        │
└───────────────────────────────────────────────────────────────────┘
```

**Available filter types per page:**

| Page | Filter types |
|---|---|
| Orders | Status, City, Due date, Amount range, Priority, Order type, Broker |
| Customers | Priority tier, Industry sector, Industry sub, Source company (SU/SC/BOTH), GSTIN state, Frequency tier, Recency tier |
| Invoices | Status (issued/partially_paid/paid), Invoice date range, Amount range |
| Enquiries | Status, Source, Priority, Expected value range, Follow-up date |
| Payments | Payment mode, Bank, Date range, Amount range |
| Deliveries | Delivery date range, Vehicle, Driver |
| Purchase Orders | Status, Supplier, Date range, Amount range |
| Stock | Product, Warehouse, Movement type (in/out), Date range |

**Saved view UX:**
1. User configures filters + search query
2. Clicks "💾 Save as view"
3. Modal: "Name this view" + "Share with team?" checkbox
4. View appears in a dropdown at the top of the page — click to re-apply

### 5.4 Context-aware ranking

When the palette is opened from a customer detail page (`/customers/:id`), results for orders/invoices/payments belonging to that customer rank +0.2 higher than equivalent matches from other customers. The bar in the palette shows a subtle "Scoped to: A. L. Paper House" chip that the user can dismiss to get global results.

### 5.5 Hindi spelling tolerance

Trigram similarity at 0.3 threshold already handles most Hindi transliteration variants ("Aggarwal"/"Agarwal", "Sharma"/"Sharmaa"). No separate logic needed — this is a side effect of choosing `pg_trgm`.

## 6. Performance targets

| Metric | Target | Notes |
|---|---|---|
| `search_entities` RPC P50 | < 80ms | With 10k rows per table, warm index |
| `search_entities` RPC P99 | < 200ms | Cold cache, worst-case |
| Per-module `search_*` RPC P50 | < 50ms | Single table with structural filters |
| Cmd+K palette open time | < 50ms | No server call on open; empty state renders from localStorage |
| Typing debounce | 150ms | Balance between responsiveness and RPC spam |
| Browser memory ceiling | No full-table caches | All pagination + filtering happens server-side |

## 7. Error handling

- **RPC failure** → palette shows "Couldn't search right now. Retry?" with a retry button. Recent searches still render from localStorage.
- **Network offline** → palette shows recent searches + a "You are offline" banner. No live search.
- **Empty result set** → "No results. Try fewer words or check spelling." (Not "No matches found." — too curt.)
- **Too many results** (> `max_per * 9 = 45` top-level) → show the 45 + "See all matches in [Entity name] →" link that navigates to the filtered list page.
- **RLS violation** (user searches for a record they don't own) → row is silently excluded. No error surfaced.

## 8. Security

- All RPCs are `SECURITY DEFINER` functions that honor RLS via `auth.uid()`
- No raw SQL from the client; only parameterized RPC calls
- `q` string is sanitized to remove SQL wildcards before trigram match (`%` and `_` escaped)
- `saved_views.shared = true` still only shares with users in the same tenant (enforced by RLS on the saved_views table itself)

## 9. Rollback plan

Each wave is an independent commit with its own migration. If Wave 2 or 3 causes issues:

- Wave 1 (infrastructure) is additive — never needs rollback. Unused indexes cost negligible disk.
- Wave 2 (palette) — feature flag via `app_settings.search_palette_enabled`. Disable by setting flag to false; no code revert needed.
- Wave 3 (filter bars) — retrofitted page-by-page; revert any individual page by reverting its specific PR.

## 10. Testing

- **Unit**: `search_entities` RPC with fixture data — every entity type, smart keyword mapping, exact-match boost, per-type cap
- **Integration**: Playwright test — press Ctrl+K from 3 different routes, type "paper", verify result groups
- **Performance regression**: EXPLAIN ANALYZE assertion in CI — `search_entities('paper')` against a 10k-row seed must complete in <200ms
- **A11y**: palette is keyboard-navigable; focus trap; ARIA `role="combobox"` + `aria-activedescendant`

## 11. Rollout plan

### Wave 1 — Foundation (1 commit, DB-only, user-invisible)
- Enable `pg_trgm`
- Add `search_text` columns + triggers + GIN indexes on 9 tables
- Create `search_entities` RPC
- Create 8 per-module `search_*` RPCs
- Create `saved_views` table + RLS policies
- Backfill `search_text` for existing rows

**Risk**: zero user-visible change. Safe to deploy anytime.

### Wave 2 — Cmd+K palette (1 commit)
- `<CommandPalette>` React component (new)
- `useCommandPalette` hook with Ctrl+K listener (new)
- Wire into `<App>` root
- `localStorage`-backed recent-searches hook
- Mobile full-screen variant
- Feature flag in `app_settings`

**Risk**: low. Additive — zero existing screens change. Flag-gated.

### Wave 3 — Per-module filter bar (1 commit per page, 8 commits total)
- `<FilterBar>` component (new)
- `useFilterState` URL-sync hook (new)
- `<SavedViews>` dropdown component (new)
- Retrofit onto Orders, Customers, Invoices, Enquiries, Payments, Deliveries, Purchase Orders, Stock — one page per commit, all wired to the new `search_*` RPCs

**Risk**: medium per page — replaces the current search box + filter controls. Mitigated by page-by-page rollout and keeping the old code path behind a flag for one release.

## 12. Open questions

None at time of approval. The user has signaled "use your judgment" on remaining details; the defaults above (smart keyword list, ranking weights, rollout order, feature flags) reflect Claude's judgment informed by:
- Indian GST workflows (GSTIN state prefix search, partial phone match)
- SARAS two-firm structure (SU/SC tagging)
- Mobile usage from factory floor (voice input, large touch targets, no heavy client caches)
- Existing codebase patterns (RPCs via `supabase.rpc`, RLS with `auth.uid()`, URL-state)

## 13. Files expected to change

New files:
- `supabase/migrations/{ts}_search_infrastructure.sql`
- `src/components/CommandPalette.jsx`
- `src/components/FilterBar.jsx`
- `src/components/SavedViewsDropdown.jsx`
- `src/hooks/useCommandPalette.js`
- `src/hooks/useFilterState.js`
- `src/hooks/useRecentSearches.js`
- `src/lib/db/search.js`

Modified files (Wave 3):
- `src/modules/orders/OrdersPage.jsx`
- `src/modules/orders/EnquiriesPage.jsx`
- `src/modules/masters/CustomersPage.jsx`
- `src/modules/invoicing/InvoicesPage.jsx`
- `src/modules/finance/PaymentsPage.jsx`
- `src/modules/dispatch/DispatchPage.jsx`
- `src/modules/purchase/PurchasePage.jsx`
- `src/modules/stock/StockPage.jsx`
- `src/App.jsx` (mount `<CommandPalette>` at root)

---

**End of spec.**
