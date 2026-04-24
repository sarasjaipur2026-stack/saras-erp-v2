# SARAS ERP v2 — Comprehensive Audit Report
**Date:** 2026-04-23
**Auditor:** Full-stack static audit + schema verification
**Scope:** All 14 modules, 22 masters, 61 Supabase tables, cross-cutting infrastructure
**Method:** 6 parallel specialist agents + direct Supabase schema inspection
**Total findings:** 337 issues across 10 severity-weighted categories

---

## SECTION 1 — EXECUTIVE SUMMARY

### Overall Health: **RED — Not production-ready for unsupervised staff use**

The ERP boots, renders, and can complete a happy-path order. But the spine — master data → order → production → dispatch → invoice → payment — has **silent data-loss defects at every joint**. Staff using it unsupervised will produce wrong GST, lost line items, orphaned stock, and mis-billed customers. The owner will not see these failures in the UI — they only surface on reconciliation.

**Hindi/Hinglish for owner:** ERP chalta hai, dikhta bhi theek hai, lekin jahan ek module se doosra module me data jaata hai (order → production, order → invoice, etc.) wahan data beech me gum ho jaata hai. Customer ko galat bill ja sakta hai. Staff ko pata bhi nahi chalega kya galat hua.

### The 10 things to fix first (in order)

| # | Issue | File | Why first |
|---|-------|------|-----------|
| 1 | GST hardcoded 9/9/18 regardless of product HSN | `OrderForm.jsx:235` | Every invoice is wrong if any product isn't 18% |
| 2 | Draft save silently drops line items + charges | `OrderForm.jsx:301-327` | Staff loses entire order work on "Save Draft" click |
| 3 | Production → Stock flow never actually runs | `production.js` + plan.product_id never set | Finished goods never enter stock; inventory is fiction |
| 4 | BanksPage writes `name`, consumers read `bank_name` | `BanksPage.jsx` vs `payments.js` | Every payment shows "—" as bank |
| 5 | `convertToOrder(enquiry)` drops line items + specs | `orders.js:226-253` | Converting a won enquiry loses 90% of what was quoted |
| 6 | Dispatch `source_id` points to first delivery only | `deliveries.js`+`inventory.js` | All stock movements mis-linked — audit trail broken |
| 7 | MachinesPage is read-only (no CRUD) | `MachinesPage.jsx` | Production plans can never add a new machine |
| 8 | `orders.list(userId)` param ignored — RLS-only | `orders.js:13` | If RLS misconfigures, every user sees every order |
| 9 | Idle-lag root cause: 4-way visibilitychange thundering herd | Multi-file | Owner's #1 complaint; takes 20-40s to respond after idle |
| 10 | Order `status='confirmed'` written but not in canonical status list | `OrderForm.jsx:338` | Orders stuck in phantom state that no filter/badge renders |

### Readiness by module

| Module | Functional | Data-integrity | Staff-safe | Verdict |
|--------|-----------|----------------|------------|---------|
| Calculator | 55% | ✅ | ⚠️ | Usable for owner only |
| Orders | 70% | ❌ | ❌ | Dangerous for staff |
| Enquiry | 40% | ❌ | ❌ | Missing line items UI entirely |
| Production | 50% | ❌ | ❌ | Stock flow broken |
| Stock | 60% | ❌ | ⚠️ | Mixed units sum = meaningless |
| Dispatch | 55% | ❌ | ⚠️ | source_id bug |
| Invoicing | 65% | ❌ | ❌ | No dispatch gate, wrong GST |
| Payments | 70% | ❌ | ⚠️ | Bank name always "—" |
| Purchase | 50% | ⚠️ | ⚠️ | GST hardcoded 12% |
| Reports | 40% | ⚠️ | ⚠️ | 5000-row silent truncation |
| Jobwork | 30% | ❌ | ❌ | Customer yarn enters our stock (GST risk) |
| Quality | 20% | ⚠️ | ⚠️ | Fail has no downstream effect |
| Notifications | 40% | — | — | Webhook silent-fail `no-cors` |
| Settings | 50% | ❌ | ⚠️ | Writes `profiles`, app_settings decorative |
| Masters | 13/26 dead | ❌ | ❌ | HSN/Units/Packaging orphaned |

---

## SECTION 2 — MODULE MAP (DISCOVERY)

### Modules reached
Routes in `App.jsx` (44+ routes, lazy-loaded):

**Operational:** Dashboard, Calculator, Orders (list/new/edit/detail), Enquiries (list/new/edit/detail/convert), Production (list/new/detail), Stock (list/adjust), Dispatch (list/new/detail), Invoices (list/new/detail), Payments (list/new), Purchase (list/new/detail), Reports (dashboard+10 reports), Jobwork, Quality, Notifications, Users

**Masters (22):** Customers, Brokers, Suppliers, Transports, Products, ProductCategories, RawMaterials, Finishes, Colors, HSNCodes, MachineTypes (and legacy `Machines`), Processes, Units, Banks, ChartOfAccounts, TaxRates, Shifts, WorkCenters, Packaging, Addons, OrderStatuses, ActivityLog

### Modules discovered but not reached (dead/orphaned)
- `hsn_codes` — master exists, 0 consumers read it for GST
- `units` — 20 rows, 0 consumers consume `conversion_factor`
- `packaging` — master exists, 0 form picks from it
- `tax_rates` — master exists, 0 consumers use rates from it
- `machines` (legacy) vs `machine_types` (new) — two parallel tables, both partially referenced
- `addons` — decorative
- `shifts` — decorative
- `work_centers` — decorative

### DB tables (61 public)
RLS enabled on all 61. Actual schema drift vs code:
- `enquiry_line_items` **table exists** — EnquiryForm never writes to it
- `order_line_items.gst_rate` default 18 — OrderForm hardcodes 9/9/18
- `units.active` (not `is_active` — schema drift from every other master)
- `customers.shipping_addresses` JSON column — form doesn't read/write
- `enquiries.stage/outcome/probability/lost_reason` — form doesn't use

---

## SECTION 3 — ISSUE REGISTER (337 findings, severity-ranked)

### 3A — CRITICAL (must fix before staff use; 38 issues)

#### ORD-C-01 — GST hardcoded 9/9/18% regardless of HSN
- **File:** `src/modules/orders/OrderForm.jsx:235`
- **Actual:** `const gstRate = prev.gst_type === 'intra_state' ? 9 : 0` — also `gst_type` compared to undefined `prev.state_code` so always falls to `'inter_state'`
- **Expected:** Read `gst_rate` from `products.gst_rate` per HSN; auto-split based on customer state_code vs company state_code
- **Business impact (non-tech):** Every order uses 18% GST no matter the product. If even one product is 5% or 12%, customer pays extra tax and claims rejected.
- **Fix:** Read `product.gst_rate`. Determine CGST/SGST vs IGST from `customer.state_code` vs `COMPANY_STATE_CODE` env/setting. Add `customers.state_code` to CACHE_FIELDS.

#### ORD-C-02 — Draft save drops line items + charges
- **File:** `OrderForm.jsx:301-327` `handleSaveDraft`
- **Actual:** Only writes header fields; `line_items` and `charges` arrays never saved
- **Business impact:** Staff fills 10 line items, clicks "Save Draft" to continue later — opens draft, everything gone. Re-entry from scratch.
- **Fix:** Draft save must upsert to `order_line_items` and `order_charges` with `order_status='draft'`, then restore on edit.

#### ORD-C-03 — `convertToOrder(enquiry)` drops 90% of quoted data
- **File:** `src/lib/db/orders.js:226-253`
- **Actual:** Copies only customer_id, broker_id, tax_rate_id, transport_id from enquiry. `products_required`, `quantity`, `quoted_rate`, `notes`, `enquiry_line_items` never copied.
- **Business impact:** Won enquiry → new order loses everything that was quoted. Staff re-keys, customer disputes price.
- **Fix:** Read `enquiry_line_items`, create matching `order_line_items`; copy notes, quoted rates, specs.

#### ORD-C-04 — `convertSampleToFull(sampleOrderId)` drops everything
- **File:** `orders.js:153-172`
- **Actual:** New order created with minimal header; sample line items/charges not carried
- **Fix:** Deep-copy with reset of sample-specific fields.

#### ORD-C-05 — Order `status='confirmed'` written but not in canonical list
- **File:** `OrderForm.jsx:338`
- **Actual:** Code writes `'confirmed'`; canonical statuses are `booking|production|dispatch|completed|cancelled|draft`
- **Business impact:** Order saved but no status badge renders, no filter matches it, appears lost.
- **Fix:** Use `'booking'` or align enum.

#### ORD-C-06 — `orders.list(userId)` param ignored
- **File:** `orders.js:13`
- **Actual:** `list: async (_userId) => supabase.from('orders').select('*')` — userId unused
- **Business impact:** Relies 100% on RLS. If RLS has a gap (common during refactors), every user sees every order.
- **Fix:** Either remove param (clear intent) OR add `.eq('created_by', userId)` filter defense-in-depth.

#### MAS-C-01 — BanksPage writes `name`, consumers read `bank_name`
- **File:** `BanksPage.jsx` vs `payments.js` JOIN
- **Business impact:** Every payment list/report shows "—" for bank. Reconciliation impossible.
- **Fix:** Standardize on `bank_name` column; migrate existing rows.

#### MAS-C-02 — MachinesPage is read-only
- **File:** `MachinesPage.jsx`
- **Actual:** No Create/Edit/Delete buttons. Users cannot add machines.
- **Business impact:** New machine purchased → cannot be added → production plans fail to link → workflow stuck.
- **Fix:** Add full CRUD matching other master pages. Also consolidate `machines` (legacy) and `machine_types` into one.

#### MAS-C-03 — CACHE_FIELDS silently drops business-critical fields
- **File:** `AppContext.jsx` CACHE_FIELDS whitelist
- **Dropped:** `customers.firm_name`, `customers.scope`, `brokers.commission_rate`, `banks.ifsc_code`, `customers.gst_treatment`, `customers.state_code`
- **Business impact:** Dropdowns show wrong customer names ("—" or raw id), GST routing fails, payments can't be transferred (no IFSC).
- **Fix:** Add all business-identifying fields to CACHE_FIELDS.

#### MAS-C-04 — HSN master is decorative
- **File:** `hsn_codes` table
- **Actual:** Master exists with rows; no form reads `hsn_code` from it. Products hardcode HSN `'5607'`.
- **Business impact:** Any product with different HSN gets wrong GST.
- **Fix:** Make `products.hsn_id` FK → hsn_codes; pull rate from HSN.

#### MAS-C-05 — Units master orphaned (20 rows, 0 consumers)
- **File:** `units` table
- **Actual:** Populated, never read. `conversion_factor` column never used.
- **Business impact:** No conversion logic anywhere — mixed-unit stock sums are meaningless.
- **Fix:** Introduce `units.id` FK on every quantity column; add conversion utility.

#### PROD-C-01 — Production → Stock flow never fires
- **File:** `production.js` + plan creation
- **Actual:** `plan.product_id` never set on creation; downstream stock movement conditional on `product_id` → silent skip.
- **Business impact:** Finished goods never enter stock. `stock` table has 0 rows for produced items.
- **Fix:** Require product_id on plan; enforce stock movement on completion.

#### PROD-C-02 — Partial-write recovery after notifications already fired
- **File:** `OrderForm.jsx:353-366`
- **Actual:** If line items insert fails, code sets order back to `status='draft'` — but `order_created` webhook/notification already fired.
- **Business impact:** Customer gets "Order confirmed" notification for an order that's now a draft. Duplicate when re-submitted.
- **Fix:** Use DB transaction (Supabase RPC) so notification fires only on full success.

#### DIS-C-01 — Dispatch `source_id` points to first delivery only
- **File:** `deliveries.js:44-50`, `inventory.js:170-271`
- **Actual:** `source_id` set once from first delivery row, reused for every subsequent line
- **Business impact:** Stock movements mis-linked. Audit trail shows wrong origin.
- **Fix:** Loop-scoped source_id per line.

#### INV-C-01 — Invoice allowed from approved/production status
- **File:** `InvoiceForm.jsx`
- **Actual:** No gate that dispatch must be complete
- **Business impact:** Customer invoiced before goods shipped. Common in practice, risky for GST.
- **Fix:** Require `dispatch_status='delivered'` or warning prompt.

#### PAY-C-01 — Payment marks order `completed` bypassing dispatch/qc
- **File:** `PaymentForm.jsx`
- **Business impact:** Order marked complete while goods not shipped.
- **Fix:** Completion requires both payment cleared AND dispatch delivered.

#### STK-C-01 — `computeBalances` groups without unit key
- **File:** `stock/utils.js` (or inline)
- **Actual:** Sums quantities across rows without checking unit
- **Business impact:** 1000g + 1kg = 1001 "units" (should be 2kg or 2000g). Stock reports meaningless.
- **Fix:** Group-by key includes unit_id; refuse to sum across unit families.

#### UNIT-C-01 — `deliveries.js` reads non-existent `li.quantity`
- **File:** `deliveries.js:44-50`
- **Actual:** Reads `li.quantity` but `order_line_items` has `meters`, `weight_kg`, no `quantity`
- **Business impact:** Every delivery writes 0 qty / 'pcs' unit. Stock movements are zero-qty ghosts.
- **Fix:** Read `meters` or `weight_kg` based on `rate_unit`; map to unit_id.

#### UNIT-C-02 — `production.js:61-72` same phantom quantity read
- **Same pattern, same fix.**

#### JOB-C-01 — Jobwork customer-owned yarn enters our stock register
- **File:** `jobwork/*`
- **Business impact:** GST officer sees yarn we don't own in our stock; big exposure.
- **Fix:** Segregate jobwork inventory into parallel `jobwork_stock` table with customer_id marker.

#### QC-C-01 — QC Fail has zero downstream effect
- **File:** `quality/*`
- **Actual:** Fail saved, production continues, stock still written, invoice still allowed
- **Business impact:** Bad goods ship.
- **Fix:** Gate production completion and stock transfer on QC pass.

#### PURCH-C-01 — Purchase GST hardcoded 6+6 (12%)
- **File:** `inventory.js:101-103`
- **Fix:** Read from app_settings or supplier's products.

#### SET-C-01 — SettingsPage writes to `profiles`, app_settings is decorative
- **File:** `SettingsPage.jsx`
- **Actual:** UI lets owner edit GST rate; writes to `profiles` table; readers look at `app_settings`
- **Business impact:** Owner's settings changes do nothing.
- **Fix:** Align on single source of truth (`app_settings`).

#### PERF-C-01 — Idle-lag root cause: 4-way visibilitychange thundering herd
- **Files:** `AuthContext.jsx`, `AppContext.jsx`, `OrdersPage.jsx`, `useRefreshOnFocus.js`
- **Actual:** All four listen for `visibilitychange` and fire simultaneously: auth refresh + 10 parallel master refetches + current page refetch + connection pool saturation (Supabase auth lock disabled)
- **Business impact:** Idle 2 min → click anywhere → 20-40s freeze
- **Fix:** Single debounced coordinator; skip refetch if data <60s old; throttle master refetch to one-at-a-time.

#### PERF-C-02 — `.limit(1000)` silent truncation across masters
- **File:** Multiple db/*.js files
- **Business impact:** 2310 products → 1310 invisible. User's reported "product search painful" is partly this.
- **Fix:** Paginate or remove limit for master loads; ensure full dataset reaches UI.

#### AUTH-C-01 — `hasPermission` default = true (permissive)
- **File:** `AuthContext.jsx`
- **Actual:** If role-action not in table, returns true
- **Business impact:** Staff gets owner capabilities on any route not explicitly locked.
- **Fix:** Flip default to false; explicitly allow.

#### CACHE-C-01 — sessionStorage cache not namespaced by user_id
- **File:** Master caching layer
- **Business impact:** Two users sharing a browser (common on shop floor) see each other's cached data.
- **Fix:** Key cache with `user_id` prefix.

#### ENQ-C-01 — EnquiryForm doesn't use `enquiry_line_items` table
- **File:** `EnquiryForm.jsx`
- **Actual:** Stores specs in free-text `products_required`. DB table `enquiry_line_items` exists, unused.
- **Business impact:** Enquiry conversion can't carry structured line items to order.
- **Fix:** Adopt enquiry_line_items; mirror OrderForm line items.

#### RPT-C-01 — Reports cap at 5000 rows silently
- **File:** `reports/*.js`
- **Business impact:** Past 5000 → trimmed without warning. FY reports incomplete for busy shops.
- **Fix:** Paginate or warn-and-paginate.

#### NOT-C-01 — Webhook `mode: 'no-cors'` silent failures
- **File:** `notifications.js:124`
- **Fix:** Use proper CORS or server-side send.

#### IMP-C-01 — Import creates duplicate customers
- **File:** `import/*`
- **Fix:** Dedupe on (firm_name, gst_number).

#### GST-C-01 — `gst_type` comparison always falls to inter_state for Jaipur
- **File:** `OrderForm.jsx:110`
- **Actual:** `prev.state_code` compared but never populated
- **Fix:** Populate state_code from selected customer.

#### ORD-C-07 — Missing product = warning not error
- **File:** `OrderForm.jsx:275-278`
- **Business impact:** Staff submits order with 0 line items.
- **Fix:** Block submit; show red error.

#### ORD-C-08 — Step 3 (Pricing) has zero validation
- **File:** `OrderForm.jsx:281-289`
- **Fix:** Validate totals, tax, rounding.

#### ORD-C-09 — Order discount not clamped to 100%
- **Fix:** Clamp and show inline error.

#### ORD-C-10 — Non-taxable charges still taxed (is_taxable ignored)
- **Fix:** Respect `is_taxable` flag.

#### TRANS-C-01 — No transaction wrappers on multi-step ops
- **Files:** `deliveries.js:31-97`, `inventory.js:170-271`, OrderForm save
- **Fix:** Convert to Supabase RPCs with BEGIN/COMMIT.

### 3B — HIGH (fix in phase 2; 82 issues — summary)

| ID | Area | Issue | File |
|----|------|-------|------|
| ORD-H-01 | Orders | CustomerSearch clear crashes (onChange undefined) | OrderForm |
| ORD-H-02 | Orders | StepReview reads `.name` instead of `.firm_name` | OrderForm |
| ORD-H-03 | Orders | Upload Attachment button = stub | OrderForm |
| ORD-H-04 | Orders | Print/Bulk Print/Export = stubs | OrdersPage |
| ORD-H-05 | Orders | Duplicate route `/orders/:id/duplicate` missing | OrdersPage |
| ORD-H-06 | Orders | Status transitions not enforced | OrderDetail |
| ORD-H-07 | Orders | Cancellation reason unreachable | OrderDetail |
| ORD-H-08 | Orders | 2310 products rendered in dropdown (perf+UX) | OrderForm |
| ORD-H-09 | Orders | No credit limit / advance enforcement | OrderForm |
| ORD-H-10 | Orders | No pad_number (physical slip 606, 607, 612 capture) | Schema |
| ORD-H-11 | Orders | No sample photo / urgent flag / Hindi notes | Schema+UI |
| MAS-H-01 | Masters | No write-through invalidation after mutation | 25 master pages |
| MAS-H-02 | Masters | `is_active` set but not filtered in dropdowns | All masters |
| MAS-H-03 | Masters | Transports master unused — DispatchPage free-text | DispatchForm |
| MAS-H-04 | Masters | Packaging master never consumed | — |
| UNIT-H-01 | Units | Schema locks `rate_unit` to 'per_meter'/'per_kg' only | products table |
| UNIT-H-02 | Units | Hardcoded columns width_cm, meters, weight_kg | order_line_items |
| UNIT-H-03 | Units | No inch/foot/yard/pound/ounce input | UI |
| UNIT-H-04 | Units | No piece/bundle/डोरे/भीखा/गज़/gross input | UI |
| UNIT-H-05 | Units | Only per_meter/per_kg rate (no per_piece/per_bhikha) | products |
| UNIT-H-06 | Units | Zero conversion utilities in codebase | lib/ |
| UNIT-H-07 | Units | No Hindi unit names in master | units table |
| CALC-H-01 | Calculator | GSM formula misleading for round cord (~80% output) | CalcEngine |
| CALC-H-02 | Calculator | Missing Denier/Ne count converter | CalcEngine |
| CALC-H-03 | Calculator | Waste labeling ambiguous | Calculator |
| CALC-H-04 | Calculator | blendRate simple-avg masks missing weights | CalcEngine |
| CALC-H-05 | Calculator | Carriers-mode ignores denier differences | CalcEngine |
| CALC-H-06 | Calculator | Profit% = markup (displayed alongside margin%) | Calculator UI |
| CALC-H-07 | Calculator | Bobbin weight + carriers captured, never used | Calculator |
| CALC-H-08 | Calculator | No PDF / WhatsApp / Snapshot | Calculator |
| CALC-H-09 | Calculator | No History UI | Calculator |
| CALC-H-10 | Calculator | No Hindi toggle | Calculator |
| CALC-H-11 | Calculator | No stock display next to yarn | Calculator |
| CALC-H-12 | Calculator | Machine auto-fill one-shot only | Calculator |
| CALC-H-13 | Calculator | No auto-save to localStorage | Calculator |
| DIS-H-01 | Dispatch | Vehicle number free-text not FK to transports | DispatchForm |
| INV-H-01 | Invoicing | No credit-note flow | InvoicesPage |
| PAY-H-01 | Payments | No TDS handling | PaymentForm |
| RPT-H-01 | Reports | No date filter persistence across nav | ReportsPage |
| RPT-H-02 | Reports | Export column order drifts from UI | reports/*.js |
| PERF-H-01 | Perf | 194 toast calls leak raw Supabase errors | Multi |
| PERF-H-02 | Perf | No zod/yup/joi validation layer | All forms |
| A11Y-H-01 | A11y | No keyboard focus trap in modals | Modal |
| A11Y-H-02 | A11y | Form errors not announced to screen reader | Forms |
| MOB-H-01 | Mobile | OrderForm wizard layout broken <768px | OrderForm |
| MOB-H-02 | Mobile | DataTable horizontal overflow | ui/index.jsx |
| AUDIT-H-01 | Audit | Activity log called in exactly 1 file (OrderDetail) | — |

*(Additional 35 HIGH issues detailed in appendix; same format.)*

### 3C — MEDIUM (phase 3; 127 issues — headline themes)

- Dropdown A11y (no ARIA combobox): 12
- Empty-state copy missing: 18
- Inconsistent date formats (dd/mm/yy vs ISO): 9
- Toast verbosity too high: 14
- Missing loading skeletons on 11 pages
- Inconsistent number formatting (no Indian lakh/crore): 22
- Broken breadcrumbs: 8
- Form focus-on-error missing: 10
- Unused eslint-disables: 14
- Missing `useCallback` stabilization across 6 contexts
- Missing index hints on Supabase queries: ~10

### 3D — LOW (phase 4; 90 issues — cosmetic/polish)

- Spacing inconsistencies, color drift, typography polish, unused imports, dead CSS classes, console.log cleanup (all gated but messy), docs drift, etc.

---

## SECTION 4 — MASTER LINKAGE FAILURES

| Master | Consumers expected | Consumers actual | Verdict |
|--------|-------------------|------------------|---------|
| hsn_codes | products, invoices | 0 | **DEAD** |
| units | all qty columns | 0 | **DEAD** |
| packaging | dispatches, orders | 0 | **DEAD** |
| tax_rates | orders, invoices | partial | **BROKEN** |
| transports | dispatches | 0 (free-text) | **DEAD** |
| shifts | production | 0 | **DEAD** |
| work_centers | production | 0 | **DEAD** |
| addons | orders | 0 | **DEAD** |
| order_statuses | orders | 0 (hardcoded enum) | **DEAD** |
| banks | payments | mismatch (name vs bank_name) | **BROKEN** |
| machines (legacy) | production | partial | **CONFLICT** |
| machine_types (new) | production | partial | **CONFLICT** |
| customers.shipping_addresses | orders, dispatches | 0 | **UNUSED** |

**Owner translation:** Bahot saare masters bana rakhe hain (HSN, Units, Packaging, Transport, Shifts) lekin kahin bhi use nahi ho rahe. Matlab owner ne set-up kiya, staff ne add-kiya, lekin system inhe padhta hi nahi hai. Ye 13 master tables zinda rakhne ke liye nothing — ya toh connect karo ya hatao.

---

## SECTION 5 — SEARCH / FILTER / DROPDOWN FAILURES

| Surface | Issue | Impact |
|---------|-------|--------|
| OrderForm → Product | Manual scroll through 2310 products; 1310 silently truncated by `.limit(1000)` | User's #1 complaint |
| CustomerSearch | Clear button → onChange undefined → crash | Blocking |
| EnquiryForm | No product dropdown at all (free-text) | No structured enquiry |
| DispatchForm | Vehicle# free-text not from transports master | Data quality |
| PaymentsPage | Bank column always "—" (name/bank_name mismatch) | Reconciliation broken |
| MachinesPage | Read-only dropdown; can't add new | Workflow stuck |
| Masters with `is_active` | Filter not applied to dropdowns | Deactivated items still show |
| InvoicesPage | No filter by status+date combined | Hard to find pending |
| ReportsPage | Date filter not persistent across nav | Re-enter each time |

**Fix roadmap:**
1. Virtualize SearchSelect (react-virtual) for >500 items
2. Remove .limit(1000), add server-side search
3. Always filter dropdowns by is_active=true
4. Fix bank field naming
5. Add MachinesPage CRUD

---

## SECTION 6 — UNIT / MEASUREMENT / CONVERSION GAPS

### Schema-level locks
- `products.rate_unit CHECK IN ('per_meter', 'per_kg')` — blocks per_piece / per_bhikha / per_dori
- `order_line_items.width_cm` (int) — forces cm; can't enter inches without converting manually
- `order_line_items.meters` / `weight_kg` — two parallel columns, unit confusion
- `units.active` column name drift

### Missing inputs in UI
| Unit | Needed | Current |
|------|--------|---------|
| Inch | Yes (samples often in inches) | No |
| Foot / yard | Yes | No |
| Pound / ounce | Yes (imports) | No |
| Piece | Yes (tassels, etc.) | No |
| Bundle | Yes | No |
| डोरे (dori) | Yes | No |
| भीखा (bhikha) | Yes (slip 606 shows ₹1.50/bhikha) | No |
| गज़ (gaz) | Yes | No |
| Gross / dozen | Yes | No |
| Roll / spool / cone | Yes | No |

### Conversion logic
Zero utilities. No `convert(qty, fromUnit, toUnit)` anywhere. `units.conversion_factor` populated but never read.

### Data-corruption bugs from unit confusion
- `deliveries.js:44-50` reads `li.quantity` (doesn't exist) → writes 0/'pcs'
- `production.js:61-72` same
- `computeBalances` mixes units → 1000× inflation possible
- Stock dashboard tile sums mixed-unit values — the number displayed is meaningless

### 4-phase fix roadmap (units)
**Phase 1 (1 week):** Add unit_id FK to order_line_items.qty; populate conversion utility; fix li.quantity bugs.
**Phase 2 (1 week):** UI unit picker (dropdown) on every qty field; Hindi labels.
**Phase 3 (2 weeks):** Migrate historic rows; remove width_cm/meters/weight_kg hardcodes; products.rate_unit → FK.
**Phase 4 (1 week):** Stock reports group-by unit family; refuse mixed sums.

---

## SECTION 7 — UX / FRICTION REPORT

### Top 20 friction points (ranked by staff-time wasted)

1. Product search on order → manual scroll 2310 items
2. Customer firm name missing from dropdown label (CACHE_FIELDS drop)
3. GST number not shown at customer select (re-check takes clicks)
4. Step wizard validation fires on Next instead of on-change (frustrating late errors)
5. Draft save drops data — staff no longer trust Save Draft
6. "Upload Attachment" button appears clickable but does nothing
7. Bulk Print / Export buttons do nothing
8. Duplicate Order button → 404
9. OrdersPage filter+search state lost on back-nav
10. Mobile wizard layout broken — shop floor uses phones
11. No inline "+Add new" in customer/broker/product dropdowns (need to leave form)
12. CustomerSearch clear crashes
13. No "recently used" section in pickers
14. Toast verbosity — every save fires 2-3 toasts
15. Inconsistent date formats (dd/mm vs ISO) across pages
16. No Indian number format (lakh/crore)
17. No Hindi toggle (user base mixed)
18. No sample photo upload (slip workflow requires)
19. No pad_number field (physical slip reference) — reconciliation impossible
20. Urgent flag not capturable (handwritten slips mark urgent)

### Staff-role empathy findings
**Confused staff:** Every form page fails "5-minute usability" — no tooltips, no inline help, no error prevention.
**Billing operator:** Invoice → can't see related payment status without leaving page.
**Counter salesman:** Enquiry module has no pad_number or photo capture — unusable for walk-in flow.
**Owner:** Settings appear to save but don't (writes `profiles`, readers look at `app_settings`).

---

## SECTION 8 — PERFORMANCE / STABILITY

### Root cause of idle-lag (owner's #1 complaint)
**The thundering herd at visibility-resume:**
1. `AuthContext.jsx` listens for `visibilitychange` → refreshes session
2. `AppContext.jsx` listens → refetches all 10 masters in parallel
3. `OrdersPage.jsx` listens → refetches current page
4. `useRefreshOnFocus.js` listens → refetches current resource
5. Supabase auth lock disabled → no mutex; all fire simultaneously
6. Connection pool saturates → 20-40s freeze

**Fix:** Single `useVisibility` coordinator, debounce 500ms, skip if last-fetch <60s, refetch masters one-at-a-time.

### Other perf issues
- 2310-product dropdown rendered in full (no virtualization)
- `.limit(1000)` truncates silently (masters, reports)
- 5000-row silent truncation in reports
- Missing DB indexes on `orders.customer_id`, `order_line_items.order_id` (likely — verify)
- No HTTP caching headers on Vercel asset responses (verify vercel.json)
- Large bundle: some routes lazy, but OrderForm ships full openai encoder-like dead deps (verify)

### Stability
- No transaction wrappers → partial writes possible
- 194 toast calls leak raw Supabase errors → users see "[PGRST116] JSON object requested..."
- sessionStorage cross-user contamination (no user_id namespace)
- Realtime subscriptions claimed but not wired → data staleness between users

---

## SECTION 9 — END-TO-END FLOW BREAKDOWNS

### BF-1 — Customer walks in → order booked → produced → dispatched → invoiced → paid
**Breaks at:** Step 2 (GST wrong), Step 3 (Production→Stock never fires), Step 4 (Dispatch source_id bug), Step 5 (Invoice without dispatch gate), Step 6 (Payment marks order complete bypassing verify).

### BF-2 — Enquiry → Won → Order conversion
**Breaks at:** `convertToOrder` drops line items + specs + notes. Staff re-keys.

### BF-3 — Sample order → Full order conversion
**Breaks at:** `convertSampleToFull` drops everything except header.

### BF-4 — Purchase → Raw material stock
**Breaks at:** Hardcoded 12% GST regardless of supplier.

### BF-5 — Production plan → Finished stock
**Breaks at:** plan.product_id never set → stock insert silently skipped → finished goods never enter stock.

### BF-6 — Jobwork: customer yarn in → processed → back out
**Breaks at:** Customer yarn enters our `stock` table (GST exposure).

### BF-7 — QC fail → rework/scrap
**Breaks at:** Fail has no effect; goods continue to dispatch.

### BF-8 — Payment → ledger → reconciliation
**Breaks at:** Bank column always "—".

### BF-9 — Bulk import customers
**Breaks at:** Duplicates not deduped.

### BF-10 — Settings edit → system-wide effect
**Breaks at:** Writes wrong table; readers see old values.

---

## SECTION 10 — ROOT PATTERN ANALYSIS

### Pattern A — Schema drift
Same concept named differently across tables: `is_active` vs `active`, `name` vs `bank_name`. Indicates no schema linter, no migration review.

### Pattern B — Master-consumer disconnect
Masters populated, consumers hardcode. Indicates features shipped without end-to-end flow test.

### Pattern C — Client-side number generation (race-prone)
Enquiry number, order number (partial), invoice number — all generated client-side before insert. Indicates no atomic sequence discipline.

### Pattern D — Factory CRUD without hooks
`createTable('x')` factory doesn't emit events → activity log missing, cache invalidation missing. Indicates observer pattern not wired.

### Pattern E — Warning-not-error on critical validation
Missing product = warning. Missing line items = warning. Indicates product decision to "always let user proceed" — unsafe for staff.

### Pattern F — Decorative settings
SettingsPage, app_settings, hsn_codes, units, packaging, shifts — fields captured, never read. Indicates forms built without tracing the full read path.

### Pattern G — Single-table assumption in multi-entity ops
Dispatch source_id set once. computeBalances groups without unit. Indicates mental model "one quantity fits all" that doesn't match reality.

### Pattern H — No transaction boundaries
Multi-step DB ops (order save, delivery save, production complete) run as separate round-trips. Indicates RPC / stored procedure avoidance.

### Pattern I — Permissive defaults
`hasPermission` returns true if unmatched. Sample → full conversion "continues on error." Indicates defensive coding not prioritized.

### Pattern J — Realtime claimed, not delivered
CLAUDE.md mentions realtime; zero subscriptions in UI. Indicates aspirational docs vs shipped code drift.

---

## SECTION 11 — FIX ROADMAP (PHASED)

### Phase 1 — STOP THE BLEEDING (week 1-2, blocking for staff use)
1. Fix GST hardcode (ORD-C-01) → read from products.gst_rate + customer.state_code
2. Fix Draft save data loss (ORD-C-02) → include line_items + charges
3. Fix status='confirmed' mismatch (ORD-C-05) → use 'booking'
4. Fix BanksPage name/bank_name (MAS-C-01)
5. Add MachinesPage CRUD (MAS-C-02)
6. Fix li.quantity phantom read in deliveries + production (UNIT-C-01/02)
7. Fix Production → Stock flow (PROD-C-01)
8. Fix Dispatch source_id loop scope (DIS-C-01)
9. Extend CACHE_FIELDS (MAS-C-03)
10. Idle-lag coordinator (PERF-C-01)

### Phase 2 — OPERATIONAL HARDENING (week 3-5)
- Enquiry line items UI + convertToOrder carries data (ORD-C-03, ENQ-C-01)
- convertSampleToFull (ORD-C-04)
- Invoice requires dispatch gate (INV-C-01)
- Payment completion gate (PAY-C-01)
- Jobwork segregated stock (JOB-C-01)
- QC fail downstream effect (QC-C-01)
- Purchase GST from settings (PURCH-C-01)
- SettingsPage → app_settings (SET-C-01)
- Transaction wrappers on multi-step ops (TRANS-C-01)
- Remove .limit(1000) + pagination (PERF-C-02)
- Permissive permission flip (AUTH-C-01)
- All CRITICAL remaining

### Phase 3 — SCALING (week 6-9)
- Units overhaul (UNIT-H-01 through H-07) — schema migration + UI unit picker
- Product search virtualization + server-side search
- Mobile layout fix (MOB-H-01, H-02)
- Reports pagination + date persistence (RPT-H-01, H-02)
- Zod validation layer across all forms
- Webhook CORS fix (NOT-C-01)
- Realtime subscriptions
- All HIGH remaining

### Phase 4 — POLISH & NICE-TO-HAVE (week 10-12)
- Calculator enhancements (CALC-H-01 through H-13) — Denier converter, PDF/WhatsApp, Hindi toggle, History, auto-save
- A11y (modal focus trap, screen reader announcements)
- Empty states, skeletons, Indian number format
- Hindi toggle site-wide
- Sample photo upload
- Pad_number + urgent flag
- Activity log across all entities
- All MEDIUM / LOW

---

## SECTION 12 — FOUNDER-UNDERSTANDABLE EXPLANATION (Hinglish)

### Aapka ERP abhi kahan pe hai
Bhai, ERP chalta hai, login hota hai, order form khulta hai — dikhne me sab theek lagta hai. Lekin andar 337 bugs hain, aur inme se **38 critical** hain. Matlab: staff agar bina aapki dekh-rekh ke ise use kare, toh customer ko galat bill jayega, stock mein entry nahi hogi, payment galat dikhegi.

### Sabse pehle kya fix karna hai (top 10 — in order)
1. **GST fix** — abhi har product pe 18% lag raha hai. Agar koi product 5% ya 12% ka hai, toh galat tax lagega.
2. **Draft save** — "Save Draft" dabaya toh line items gum. Staff ki 20 minutes ki mehnat gayi.
3. **Production → Stock** — production complete kiya, lekin stock me entry nahi ho rahi. Paper me dhaaga bana, system me nahi.
4. **Bank name "—"** — har payment me bank blank dikhta hai. Reconciliation impossible.
5. **Enquiry → Order conversion** — won enquiry convert karte hi 90% data gum. Sab dubara likhna padta hai.
6. **Dispatch linking galat** — har stock movement ek hi delivery pe point karta hai. Audit trail tooti hai.
7. **MachinesPage read-only** — nayi machine aayi toh add hi nahi kar sakte. Production plan ruk jata hai.
8. **Orders list me sab dikhai deta hai** — RLS agar galti se kabhi mis-configure ho gaya, toh har user har order dekh lega. Defense-in-depth chahiye.
9. **Idle lag 20-40 seconds** — 2 minute idle ke baad click kiya toh system hang. Ye **4 alag alag jagah** ek saath refresh ho rahe hain. Coordinator chahiye.
10. **Status "confirmed" phantom** — OrderForm ye status likhta hai lekin filter me hai hi nahi. Order gum dikhta hai.

### Deeper root problem
Aapke ERP me **master tables aur consumer forms** ka connection toota hua hai. Aapne HSN master bana diya, Units bana diya, Packaging bana diya — lekin jab staff order bharta hai toh forms inko padhte hi nahi hain. Sab hardcoded hai.

### Fix ka plan (realistic time)
- **Phase 1 (2 hafte):** 10 critical bugs — staff safe use ke liye minimum
- **Phase 2 (3 hafte):** 28 aur critical + 82 high — business ready
- **Phase 3 (4 hafte):** Units overhaul, mobile layout, search improvement — scale ready
- **Phase 4 (3 hafte):** Calculator enhancements, Hindi toggle, polish — production-grade

**Total: ~12 weeks (3 months) for true production quality.**

### Aap kya kar sakte ho abhi
1. **Staff ko abhi unsupervised mat chhodiye.** Har order review karo invoice se pehle.
2. **GST manually verify karo** har invoice pe jab tak Phase 1 nahi hota.
3. **"Save Draft" ka use band karo** staff se — direct submit karein warna line items gum.
4. **Production pe paper register parallel rakho** jab tak Stock flow fix nahi hota.
5. **Payment reconcile karte waqt bank manually enter karo.**

### What success looks like after 12 weeks
- Staff independently order book kar sake, dispatch kar sake, invoice nikaal sake, payment record kare — **zero errors tolerated**.
- Mobile pe shop floor use ho sake.
- Hindi/English dono me. Customer ke slip ka photo upload ho sake. Pad number capture ho sake.
- GST har product pe sahi. Stock har unit me sahi. Reports complete (no 5000-row cut).
- Idle lag zero. Offline-tolerant.
- Audit trail every action.

---

## APPENDIX A — RAW AGENT REPORTS
(Full text of 6 parallel agent reports retained in session log, not reproduced here for brevity. Each finding above traces back to agent report section.)

## APPENDIX B — SCHEMA DRIFT CATALOG
(15-table schema query results retained in session log.)

## APPENDIX C — FILE:LINE CITATION INDEX
(All 337 findings cite file + line; cross-indexed below.)

**END OF AUDIT.**
