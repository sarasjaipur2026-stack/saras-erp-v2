# SARAS ERP v2 — Deployment Checklist

## Prerequisites

- Supabase project created at https://supabase.com
- Vercel account with GitHub repo connected
- Node.js 18+ locally for testing builds

---

## 1. Supabase Setup

### Database
1. Run `src/db/schema.sql` in the Supabase SQL Editor to create all tables, enums, and RLS policies
2. Verify all tables are created: profiles, customers, products, materials, machines, colors, suppliers, brokers, orders, order_line_items, order_charges, enquiries, deliveries, invoices, payments, stock_movements, purchase_orders, purchase_order_items, goods_receipts, goods_receipt_items, production_plans, jobwork_jobs, jobwork_items, quality_inspections, quality_inspection_results, notifications, activity_log, app_settings, attachments, import_log, custom_field_definitions, calculator_profiles, stock (+ all master tables)
3. Verify RLS is enabled on all tables that contain user data

### RPC Functions
These must exist (created by schema.sql):
- `generate_order_number(p_user_id uuid, p_prefix text)`
- `next_invoice_number()`
- `next_challan_number()`
- `next_po_number()`
- `next_grn_number()`
- `next_qi_number()`
- `next_jobwork_number()`

### Auth
1. Enable Email/Password auth provider in Authentication > Providers
2. Disable email confirmation for initial setup (or configure SMTP)
3. Create the first admin user via Authentication > Users > Add User
4. Insert a matching `profiles` row: `INSERT INTO profiles (id, full_name, role) VALUES ('<user-uuid>', 'Admin Name', 'admin')`

### Storage Buckets
1. Create bucket: `company-logos` (public)
2. Create bucket: `order-attachments` (public or authenticated)
3. Create bucket: `quality-photos` (public or authenticated)
4. Set file size limit: 5MB per file
5. Allowed MIME types: image/jpeg, image/png, image/webp, image/gif, application/pdf

---

## 2. Vercel Setup

### Environment Variables
Add these in Vercel Dashboard > Project > Settings > Environment Variables:

| Variable | Value | Environments |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://kcnujpvzewtuttfcrtyz.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | Your anon key from Supabase | Production, Preview, Development |

### Build Settings
- **Framework Preset:** Vite
- **Build Command:** `npm run build` (or `vite build`)
- **Output Directory:** `dist`
- **Install Command:** `npm install`

### Deployment
1. Push to the connected Git branch
2. Vercel auto-builds and deploys
3. Verify the deployment URL loads correctly

---

## 3. Post-Deploy Verification

### Auth
- [ ] Login page loads at `/login`
- [ ] Sign in with admin credentials works
- [ ] Session persists after page refresh
- [ ] Sign out clears session and redirects to login
- [ ] Protected routes redirect to `/login` when unauthenticated

### Dashboard
- [ ] Dashboard loads with correct stats
- [ ] Stat cards show order count, enquiries, customers
- [ ] Quick action buttons navigate correctly

### Orders
- [ ] Orders list loads with data
- [ ] Create new order flow works (all steps)
- [ ] Order detail page loads
- [ ] Status change works
- [ ] Delete order works

### Enquiries
- [ ] Enquiries list loads
- [ ] Create new enquiry works
- [ ] Convert to order works

### Masters
- [ ] At least 3 master pages load correctly (Customers, Products, Materials)
- [ ] CRUD operations work on masters

### Other Modules
- [ ] Production page loads
- [ ] Dispatch page loads
- [ ] Invoicing page loads
- [ ] Payments page loads
- [ ] Reports page loads
- [ ] Calculator page loads

### Performance
- [ ] First load < 3s on decent connection
- [ ] Subsequent loads < 1s (cached)
- [ ] No console errors in browser DevTools

---

## 4. Ongoing

- Monitor Supabase usage dashboard for quota
- Check Vercel deployment logs for build failures
- Review error logs periodically
