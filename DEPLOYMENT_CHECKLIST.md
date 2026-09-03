# SARAS ERP v2 — Deployment Checklist

## Prerequisites

- Supabase project created at https://supabase.com
- Vercel account with GitHub repo connected
- Node.js 20+ locally for testing builds

---

## 1. Supabase Setup

### Database
1. Take a Supabase database backup before upgrading an existing installation.
2. Apply every file in `supabase/migrations` in filename order. Prefer `supabase db push`; if using the SQL Editor, run one complete file at a time and stop on the first error.
3. Never deploy `src/db/schema.sql`; it is retained only as a legacy reference.
4. Run `npm test` locally. The migration tests execute both a clean install and an upgrade from the original v2 schema in PostgreSQL.
5. Verify RLS is enabled and the `saras_*` policies exist on business tables.

### RPC Functions
These must exist after the migrations:
- `generate_order_number(p_user_id uuid, p_prefix text)`
- `next_invoice_number()`
- `next_challan_number()`
- `next_po_number()`
- `next_grn_number()`
- `next_qi_number()`
- `next_jobwork_number()`
- Transactional RPCs ending in `_transactional`, plus `stock_balances()` and the three `report_*` functions

### Auth
1. Enable Email/Password auth provider in Authentication > Providers
2. Disable email confirmation for initial setup (or configure SMTP)
3. Create the first admin user via Authentication > Users > Add User
4. New Auth users receive a profile automatically. Promote only the first trusted operator from the SQL Editor: `UPDATE public.profiles SET role = 'admin' WHERE id = '<user-uuid>';`

### Storage Buckets
1. Create bucket: `company-logos` (public)
2. Create bucket: `order-attachments` (**private**)
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
1. Apply and verify the database migrations **before** deploying the matching frontend.
2. Run `npm run check` and require a green result.
3. Push to the connected Git branch; merge to `main` only after CI passes.
4. Vercel auto-builds and deploys.
5. Verify the canonical production URL: https://saras-erp-v2-rebuild.vercel.app
6. Confirm the seven-character build SHA shown in the sidebar footer matches the deployed Git commit.

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
