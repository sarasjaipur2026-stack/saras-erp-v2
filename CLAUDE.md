# SARAS ERP v2 — Project Brief for Claude Code

## What Is This?
A complete ERP system for **RPK Industries** — a cordage and narrow textile manufacturing business in Jaipur, India. They make braided cords, twisted ropes, elastics, drawstrings, shoelaces, macramé cords, sewing threads using braiding/twisting/knitting/winding machines from cotton, polyester, PP, and nylon yarns. Business model: manufacturing + trading + jobwork hybrid.

## Tech Stack
- **Frontend**: React 19 + Vite 8 + Tailwind CSS v4
- **Backend**: Supabase (auth, database, storage, real-time, Edge Functions, RPC)
- **Deploy**: Vercel (frontend) + Supabase (backend)
- **Supabase Project ID**: `kcnujpvzewtuttfcrtyz`

## Architecture Patterns (MUST FOLLOW)

### Database (db.js)
- Factory pattern CRUD via `createTable('table_name')` returns `{ list, get, create, update, remove }`
- All return `{ data, error }` — never throws
- Snake_case for all database columns (Supabase convention)
- CamelCase for JS table references: `db.chargeTypes` (not `db.charge_types`)
- Custom objects for complex tables (orders, deliveries, payments, etc.)
- RLS enabled on ALL tables
- Realtime on key tables

### React Patterns
- `React.lazy` + `Suspense` for code splitting (Suspense from 'react', NOT 'react-router-dom')
- React Context: `AuthContext`, `AppContext`, `ToastContext`
- `useAuth()` from `../../contexts/AuthContext`
- `useApp()` from `../../contexts/AppContext` — loads all master data
- `useToast()` from `../../contexts/ToastContext` — `toast.success()`, `toast.error()`
- All UI from barrel import: `import { Button, Input, Modal, ... } from '../../components/ui'`

### UI Component Rules
- `Button` has NO `icon` prop — icons go as children: `<Button><PlusIcon /> Add</Button>`
- `Modal` supports both `isOpen` and `open` props
- `StatusBadge` for order statuses
- `SearchSelect` for searchable dropdowns
- `DataTable` for list views
- `StatCard` for dashboard metrics
- `Currency` for formatted amounts

### Order System
- Order number via PL/pgSQL: `generate_order_number(type_prefix, financial_year)`
- Status flow: draft → booking → approved → production → qc → dispatch → completed
- GST auto-split: CGST+SGST (same state) vs IGST (different state) based on state codes
- 4-step wizard form: Customer → Line Items → Pricing → Review
- Customer Spec Cards: saved per-customer per-product specifications

---

## MASTER DATA ARCHITECTURE (Foundation — Build First!)

### Principle: "Pehle registers banao, phir kaam shuru"
Every dropdown, every reference field across ALL modules pulls from standardized master tables. NO hardcoding anywhere. Custom fields supported on every master.

### Master Tables (22 total, 6 groups)

#### GROUP 1: Party Masters
1. **customers** — firm_name, contact_person, phone, whatsapp, email, billing_address, shipping_addresses (jsonb, multiple), gstin, state_code, pan, credit_limit, overdue_days_allowed, advance_required_pct, payment_term_id (→ payment_terms), broker_id (→ brokers), customer_group, opening_balance, notes, custom_fields (jsonb), active, created_at, updated_at

2. **suppliers** — firm_name, contact_person, phone, whatsapp, email, address, gstin, state_code, pan, payment_term_id (→ payment_terms), quality_rating (1-5), reliability_notes, blacklisted, bank_name, bank_account_number, bank_ifsc, upi_id, opening_balance, custom_fields (jsonb), active, created_at, updated_at

#### GROUP 2: Product Masters (ONE page with 4 tabs in UI)
3. **machine_types** — name, custom_number, spindle_count, machine_type (enum: round/flat/choti/rope), default_carriers, default_speed_m_per_min, motor_power_hp, machine_width_mm, rpm_min, rpm_max, hourly_cost, compatible_product_ids (jsonb array), last_serviced_date, next_service_date, maintenance_cost, machine_count, serial_numbers (jsonb array), photo_url, custom_fields (jsonb), active, created_at, updated_at

4. **product_types** — name, code, category (enum: hollow_cord/round_cord/flat_elastic/round_elastic/braided_tape/choti/drawcord/rope/khajuri/paracord/shoelace/custom), requires_filler, compatible_machine_ids (jsonb array), default_chaal_id (→ chaal_types), default_waste_pct, hsn_code_id (→ hsn_codes), default_unit_id (→ units), photo_url, description, custom_fields (jsonb), active, created_at, updated_at

5. **chaal_types** — name, hindi_name, description, speed_factor (decimal, multiplier vs seedhi), compatible_product_ids (jsonb array), custom_fields (jsonb), active, created_at, updated_at

6. **yarn_types** — name, yarn_category (enum: cotton/polycotton/polyester_dty/spun_polyester/spun_viscose/shoddy/filler/elastic/custom), count_or_denier, default_rate_per_kg, usage_type (enum: covering/filler/both), hsn_code_id (→ hsn_codes), min_order_qty, color_id (→ colors), custom_fields (jsonb), active, created_at, updated_at

7. **yarn_supplier_rates** — yarn_type_id (→ yarn_types), supplier_id (→ suppliers), rate_per_kg, last_purchase_date, notes (junction table for yarn↔supplier mapping with rates)

#### GROUP 3: Process Masters
8. **process_types** — name, hindi_name, sequence_order, requires_machine, default_machine_type_id (→ machine_types), default_duration_per_kg_mins, is_optional, description, custom_fields (jsonb), active, created_at, updated_at
   - Default processes: Cone Winding (seq 1), Bobbin Winding (seq 2), Braiding (seq 3), Tipping/Cutting (seq 4, optional — only for tipping orders)

9. **operators** — name, phone, role (enum: operator/helper/supervisor), daily_wage, shift (enum: day/night/both), skill_process_ids (jsonb array → process_types), assigned_machine_ids (jsonb array → machine_types), photo_url, joining_date, id_proof_url, custom_fields (jsonb), active, created_at, updated_at

#### GROUP 4: Financial Masters
10. **hsn_codes** — code, description, cgst_pct, sgst_pct, igst_pct, cess_pct, category, active

11. **units** — name, symbol (m/kg/g/mm/pcs/dz/gross), unit_type (enum: length/weight/quantity), conversion_factor, is_base_unit, active

12. **charge_types** — name, charge_mode (enum: fixed/percentage), default_value, applies_to (enum: order/invoice/both), is_taxable, hsn_code_id (→ hsn_codes), active (EXISTS)

13. **payment_terms** — name, days, description, active (EXISTS)

14. **banks** — bank_name, branch, account_number, ifsc, upi_id, is_default, active (EXISTS)

15. **brokers** — name, phone, commission_pct, commission_type (enum: on_order_value/on_collection), active (EXISTS)

#### GROUP 5: Operational Masters
16. **warehouses** — name, address, warehouse_type (enum: raw_material/finished_goods/both), capacity, contact_person, active (EXISTS)

17. **order_types** — name, prefix, order_mode (enum: manufacturing/trading/jobwork/sample), default_workflow_steps (jsonb), active (EXISTS)

18. **colors** — name, hex_code, hindi_name, category (enum: solid/melange/dyed), active

19. **packaging_types** — name, weight_grams, cost_per_unit, dimensions, active

20. **transports** — vehicle_number, vehicle_type (enum: tempo/truck/courier/self), driver_name, driver_phone, transporter_name, active

21. **quality_parameters** — name, unit, min_value, max_value, test_method, applicable_product_ids (jsonb array), is_mandatory, active

#### GROUP 6: System
22. **custom_field_definitions** — table_name, field_name, field_type (enum: text/number/date/dropdown/boolean/file), dropdown_options (jsonb), is_required, show_in_list, show_in_print, active

---

## MODULES (14 total)

### Build Order (masters first, then modules):
1. Masters (all 22 tables + CRUD pages)
2. Calculator / Production Planning
3. Orders
4. Production
5. Inventory / Stock
6. Purchase / Inward
7. Dispatch
8. Invoicing
9. Finance / Payments
10. Jobwork
11. Quality Check
12. Reports
13. Notifications
14. Settings + Import

---

## CALCULATOR / PRODUCTION PLANNING MODULE (Detailed Design)

### Layout
- **Desktop (>1024px)**: 2 cards side by side, ZERO page scrolling. Left = INPUT, Right = OUTPUT. Each card scrolls internally. Height = calc(100vh - header).
- **Mobile (<1024px)**: Single column scroll (same as v1 at saras-erp-ten.vercel.app)

### Prototype file: `docs/prototypes/calculator-v2.html`

### LEFT CARD — INPUT (6+1 sections)

**⓪ Order Link** (TOP of card)
- Searchable dropdown to select finalized/booked orders: "ORD-2425-0047 | Sharma Textiles | 5000m Round Cord"
- Shows order info strip: customer, qty, status, date
- "New (without order)" button for standalone use
- Booking reference photo upload (camera icon, dashed upload zone)
- Actual Selling Price ₹/kg input — with comparison chip showing "↑ ₹XX above calc" (green) or "↓ ₹XX below calc" (red) vs calculated price

**① Sample Naap-Tol**
- Length (m), Total Wt (g), Cov Wt (g), Fil Wt (g), Width (mm)
- Auto-calculates: GSM, third weight from other two
- 2-column compact grid

**② Customer Order**
- Meters, Kgs (auto-converts from sample ratio), Waste % (default 5%)
- 3 fields in a row

**③ Product & Material** (ALL from masters)
- Machine dropdown ← Machine Masters (auto-filled from order if linked, with lock icon + "Override" button)
- Product dropdown ← Product Masters (same auto-fill behavior)
- Chaal dropdown ← Chaal Masters
- Covering Yarns: material dropdown ← Yarn Masters, ₹/kg rate, Carriers/Weight% toggle, "+ Yarn" for multi-blend. Shows "Stock: XXkg" from inventory.
- Filler Yarns: same structure

**④ Process & Operators**
- Table rows: Cone Winding → Bobbin Winding → Braiding → Tipping/Cutting
- Each row: process name, operator dropdown (← Operator master), machine dropdown (← Machine master), time estimate
- Tipping row grayed out with "Only for tipping orders" note
- "+ Add Step" button

**⑤ Pricing**
- Labor ₹/kg, Overhead ₹/kg, Profit %
- 3 fields in a row

**⑥ Production Plan**
- Speed (m/min), Machines count, Efficiency %, Bobbin Wt (g), Carriers (auto-filled from machine)

### RIGHT CARD — OUTPUT

**Profit Comparison** (TOP — most prominent)
- Calculated Cost ₹/kg
- Calculated Sell ₹/kg (from profit %)
- Actual Sell ₹/kg (from Order Link section — BIG number)
- Actual Margin ₹/kg and % vs Calculated Margin
- Visual comparison bars

**Cost Breakdown**
- Material cost: covering yarn + filler yarn = total ₹/kg
- Process cost: labor + overhead = ₹/kg
- Total cost ₹/kg → with profit → sell ₹/kg

**Material Requirement**
- Covering yarn: X.XXX kg (with/without waste, per meter)
- Filler yarn: X.XXX kg (with/without waste, per meter)
- Total yarn needed

**Conversions**
- 1 meter weighs X.XX g | 1 kg = XXXX m | GSM | Denier/Count

**Production Estimate**
- Output per hour, per day (8hr shift), days to complete order

**Actions**: Snapshot, Download PDF, Save, Share WhatsApp

### Features Carried from v1
- Profiles (save/load calculation templates)
- History (timestamped entries with order size, cost, sell — stored in Supabase not localStorage)
- Hindi toggle (bilingual labels)
- Reset button
- Denier ↔ Ne ↔ Weight converter
- Multi-yarn blending (covering + filler, multiple yarns each)
- GSM auto-calculation
- Meters ↔ Kgs bi-directional conversion

---

## DATA INTERLINKING RULES

1. **Credit Control**: Combined — credit limit (₹) + overdue days + advance required (%) all checked before order approval
2. **Order → Production**: Button to auto-generate production job from approved order
3. **Production Complete → Stock**: Auto stock-in finished goods on production completion
4. **Dispatch → Stock**: Auto deduct stock on dispatch confirmation
5. **Invoicing**: Separate flow from orders — generate invoice from dispatched orders
6. **Broker Commission**: Fully manual calculation and entry
7. **Order Detail**: Timeline view + linked module cards (production, dispatch, invoice, payments)
8. **Payments**: Update order status + customer ledger on payment recording
9. **Jobwork**: Full stock tracking — customer sends yarn → we process → return finished goods
10. **Calculator ↔ Orders**: Optional link — can attach calculation to order or use standalone
11. **Google Sheets**: Bidirectional sync (future feature)
12. **Cancel Order**: Only with warnings about linked production/dispatch/invoices
13. **User Roles**: User-based checklist customization (per-user permission for each feature)
14. **Audit Trail**: Key milestones only (status changes, payments, dispatch) — not every field edit

---

## FILE STRUCTURE
```
saras-erp-v2/
├── CLAUDE.md                    ← THIS FILE
├── DEPLOY-GUIDE.md             ← Supabase + Vercel deployment steps
├── docs/
│   └── prototypes/
│       ├── calculator-v2.html   ← Calculator layout prototype (2-card desktop)
│       ├── saras-masters-simple.html  ← Master architecture (simple Hinglish)
│       ├── saras-master-architecture.html ← Master architecture (detailed)
│       └── saras-erp-structure.html   ← Full ERP page structure prototype
├── src/
│   ├── App.jsx                 ← Routes (React Router, lazy loaded)
│   ├── main.jsx                ← Entry point
│   ├── index.css               ← Tailwind + global styles
│   ├── components/
│   │   ├── Layout.jsx          ← Sidebar + Topbar wrapper
│   │   ├── Sidebar.jsx
│   │   ├── Topbar.jsx
│   │   └── ui/
│   │       └── index.jsx       ← ALL reusable UI components (barrel export)
│   ├── contexts/
│   │   ├── AuthContext.jsx      ← Supabase auth
│   │   ├── AppContext.jsx       ← Master data loader
│   │   └── ToastContext.jsx     ← Toast notifications
│   ├── lib/
│   │   ├── supabase.js          ← Supabase client init
│   │   └── db.js                ← Factory CRUD + custom queries
│   ├── modules/
│   │   ├── calculator/          ← Production Planning Calculator
│   │   ├── orders/              ← Order management
│   │   ├── enquiry/             ← Enquiry management
│   │   └── masters/             ← All master CRUD pages
│   └── pages/
│       ├── Dashboard.jsx
│       ├── LoginPage.jsx
│       ├── SettingsPage.jsx
│       └── ImportPage.jsx
├── package.json
├── vite.config.js
├── vercel.json                  ← SPA rewrite for React Router
└── eslint.config.js
```

---

## SUPABASE DATABASE STATE
- Project: `kcnujpvzewtuttfcrtyz`
- 7 migrations already applied
- 31+ tables created (but need review — many need new master table columns added)
- 11 enums defined
- `generate_order_number()` PL/pgSQL function exists
- Auto activity log + notification triggers exist
- RLS enabled on all tables
- Realtime on: orders, line_items, deliveries, notifications, activity_log, stock, payments

---

## V1 REFERENCE
- Live at: https://saras-erp-ten.vercel.app/
- Login: rpk@saras.com (staff role)
- Calculator module is the most complete feature in v1
- V2 should keep all v1 calculator features + add: order linking, booking photo, actual sell price, process/operators, master-linked dropdowns, profit comparison

---

## OWNER
- Name: RPK
- Email: rachitrpk@gmail.com
- Business: RPK Industries, Jaipur, India
- Industry: Cordage & Narrow Textile Manufacturing
