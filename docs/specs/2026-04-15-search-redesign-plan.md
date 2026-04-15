# Search Redesign — Implementation Plan

**Linked spec:** [2026-04-15-search-redesign-design.md](./2026-04-15-search-redesign-design.md)
**Date:** 2026-04-15
**Status:** In progress — Wave 1 executing

---

## Wave 1 — DB Foundation (user-invisible)

**Goal:** Lay all the Postgres infrastructure so the existing app continues working unchanged while the new search primitives become available.

### Step 1.1 — Enable pg_trgm + create core helpers
Migration: `enable_pg_trgm_and_search_helpers`
- `CREATE EXTENSION IF NOT EXISTS pg_trgm`
- Helper function `public.search_text_normalize(text)` — lowercase + strip punctuation
- Helper function `public.short_number(text)` — `ORD/25-26/0412` → `ORD-0412`

### Step 1.2 — Add search_text columns + triggers (9 tables)
Migration: `add_search_text_columns`
- `customers`, `orders`, `enquiries`, `invoices`, `payments`, `deliveries`, `purchase_orders`, `stock_movements`, `products`
- Each gets: `search_text text`, a `BEFORE INSERT OR UPDATE` trigger that regenerates it
- Joined fields (firm_name from customers into orders.search_text) handled by a secondary trigger that refreshes children when parent changes
- GIN trigram index per table: `CREATE INDEX USING GIN (search_text gin_trgm_ops)`

### Step 1.3 — Global search_entities RPC
Migration: `create_search_entities_rpc`
- Input: `q text, types text[], max_per int, p_user_id uuid`
- Output: `entity_type, entity_id, primary_label, secondary, metadata jsonb, rank real`
- Ranking: exact-match boost → starts-with boost → trigram similarity → recency boost → per-type cap
- Smart keyword pre-processor (overdue, due today, pending payment, etc.)

### Step 1.4 — Per-module search_* RPCs (8 functions)
Migration: `create_per_module_search_rpcs`
- `search_orders`, `search_customers`, `search_enquiries`, `search_invoices`, `search_payments`, `search_deliveries`, `search_purchase_orders`, `search_stock`
- Structural filters as WHERE clauses on indexed columns
- Pagination + `total_count`

### Step 1.5 — saved_views table + RLS
Migration: `create_saved_views_table`
- Table with RLS policies scoped to `auth.uid()`
- Indexes on `(user_id, entity_type)`

### Step 1.6 — Backfill existing rows
One-shot `UPDATE` per table to populate `search_text` for rows that existed before the trigger.

### Step 1.7 — Verify
Live tests against real data:
- `search_entities('paper hous')` → includes A. L. Paper House
- `search_entities('8421')` → returns customer whose phone ends in 8421 (if any)
- `search_entities('07')` → returns Delhi customers
- `search_entities('jaipur')` → returns Jaipur customers + orders
- `search_entities('ORD/25-26/0001')` → exact match ranks 1.0
- `search_entities('overdue')` → translates to status + date filter
- Latency: `EXPLAIN ANALYZE` on each query must show GIN index usage, < 200ms

---

## Wave 2 — Cmd+K Palette (deferred until user review of Wave 1)

Files to create:
- `src/components/CommandPalette.jsx`
- `src/hooks/useCommandPalette.js`
- `src/hooks/useRecentSearches.js`
- `src/lib/db/search.js`

Files to modify:
- `src/App.jsx` — mount `<CommandPalette>` at root

Feature-flagged via `app_settings.search_palette_enabled`.

## Wave 3 — Per-Module Filter Bar (deferred until Wave 2 ships)

Files to create:
- `src/components/FilterBar.jsx`
- `src/components/SavedViewsDropdown.jsx`
- `src/hooks/useFilterState.js`

Files to modify (one commit each):
- `src/modules/orders/OrdersPage.jsx`
- `src/modules/orders/EnquiriesPage.jsx`
- `src/modules/masters/CustomersPage.jsx`
- `src/modules/invoicing/InvoicesPage.jsx`
- `src/modules/finance/PaymentsPage.jsx`
- `src/modules/dispatch/DispatchPage.jsx`
- `src/modules/purchase/PurchasePage.jsx`
- `src/modules/stock/StockPage.jsx`

---

## Checkpoints

- [x] Spec approved
- [ ] Wave 1.1 — pg_trgm enabled
- [ ] Wave 1.2 — search_text columns + triggers + GIN indexes
- [ ] Wave 1.3 — search_entities RPC
- [ ] Wave 1.4 — 8 per-module RPCs
- [ ] Wave 1.5 — saved_views table
- [ ] Wave 1.6 — backfill
- [ ] Wave 1.7 — live verification passes
- [ ] **Wave 1 complete — report to user, await go for Wave 2**
- [ ] Wave 2 approved → palette ships
- [ ] Wave 3 approved → filter bars ship (one page at a time)
