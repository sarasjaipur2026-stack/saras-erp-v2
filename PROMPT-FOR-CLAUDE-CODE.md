# Prompt for Claude Code

Copy-paste this into Claude Code when you open the project:

---

Read CLAUDE.md thoroughly — it has the complete project spec, all architecture decisions, master data design, calculator module design, and data interlinking rules.

This is SARAS ERP v2 — a cordage/narrow textile manufacturing ERP for RPK Industries, Jaipur. React 19 + Vite 8 + Tailwind v4 + Supabase backend. Supabase project ID: kcnujpvzewtuttfcrtyz.

The project already has existing code (App.jsx, routes, UI components, contexts, db.js with factory CRUD, master pages, order pages, settings, import). Some Supabase tables exist but need review and new columns.

## What to build NOW (in this order):

### Phase 1: Master Data Foundation
Build/update ALL 22 master tables in Supabase. The existing database has 31+ tables from 7 migrations but many need new columns per the CLAUDE.md spec. For each master:
1. Check if table exists in Supabase, if yes — ALTER to add missing columns. If no — CREATE.
2. Add RLS policies (authenticated users can CRUD)
3. Add to db.js using the factory pattern: `createTable('table_name')`
4. Add to AppContext.jsx so master data loads on app init
5. Build/update the frontend CRUD page

Master groups to build:
- Party Masters: customers (update), suppliers (new full page)
- Product Masters: machine_types, product_types, chaal_types, yarn_types, yarn_supplier_rates — ONE page with 4 tabs
- Process Masters: process_types, operators
- Financial Masters: hsn_codes, units (new), charge_types (exists), payment_terms (exists), banks (exists), brokers (exists)
- Operational Masters: warehouses (exists), order_types (exists), colors (new), packaging_types (new), transports (new), quality_parameters (new)
- System: custom_field_definitions (new)

Every master table must have: active flag, created_at, updated_at, and custom_fields (jsonb) column.

### Phase 2: Calculator / Production Planning Module
Build the calculator page at src/modules/calculator/CalculatorPage.jsx following the design in docs/prototypes/calculator-v2.html.

Desktop layout: 2 cards side by side, ZERO page scrolling. Left = INPUT card, Right = OUTPUT card. Each card scrolls internally. Height = calc(100vh - header).
Mobile layout: Single column scroll.

LEFT card sections:
- 0: Order Link (searchable dropdown of booked orders, booking photo upload, actual sell price with comparison chip)
- 1: Sample Naap-Tol (length, total wt, cov wt, fil wt, width — auto-calc GSM)
- 2: Customer Order (meters, kgs auto-convert, waste %)
- 3: Product & Material (machine/product/chaal from masters, covering yarns with multi-blend, filler yarns with multi-blend, stock display from inventory)
- 4: Process & Operators (cone winding -> bobbin winding -> braiding -> tipping/cutting, each with operator + machine + time)
- 5: Pricing (labor, overhead, profit %)
- 6: Production Plan (speed, machines, efficiency, bobbin wt, carriers)

RIGHT card sections:
- Profit Comparison (calculated vs actual sell price, margin comparison)
- Cost Breakdown (material + process costs)
- Material Requirement (covering + filler yarn needs)
- Conversions (m<>kg, GSM, denier)
- Production Estimate (hours, days to complete)
- Actions (snapshot, download, save, share)

Features: profiles, history (stored in Supabase), Hindi toggle, reset, denier converter, multi-yarn blending.

### Phase 3: Remaining Modules (after masters + calculator)
Orders (already partially built — review and fix), Production, Inventory/Stock, Purchase/Inward, Dispatch, Invoicing, Finance/Payments, Jobwork, Quality Check, Reports, Notifications.

## Architecture rules (MUST follow):
- db.js: factory pattern, camelCase JS refs, snake_case DB columns, {data, error} returns
- React: lazy + Suspense (from 'react' not 'react-router-dom'), contexts for auth/app/toast
- UI: barrel import from ../../components/ui, Button has NO icon prop, icons as children
- All dropdowns fetch from masters — NO hardcoded options anywhere
- Custom fields support on every master table

## Key files to read first:
1. CLAUDE.md (full spec)
2. src/lib/db.js (understand the CRUD pattern)
3. src/components/ui/index.jsx (available UI components)
4. src/contexts/AppContext.jsx (master data loading)
5. src/App.jsx (existing routes)
6. docs/prototypes/calculator-v2.html (calculator design reference)

Start with Phase 1 — check existing Supabase tables, identify gaps, and begin building/updating master tables one group at a time. Ask me before making any destructive database changes.
