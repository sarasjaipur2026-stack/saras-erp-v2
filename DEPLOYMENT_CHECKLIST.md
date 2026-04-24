# SARAS ERP v2 — Deployment Checklist

Production deployment to Vercel (frontend) + Supabase (backend). Run through this every release.

---

## 0. Pre-Deployment

- [ ] Build green: `npx vite build`
- [ ] Lint clean: `npx eslint .` (0 errors)
- [ ] No `localhost` in `src/`: `grep -r "localhost" src/`
- [ ] No unguarded `console.log`: `grep -rn "console\.log" src/` (only `console.warn` / `console.error` allowed, must be gated by `import.meta.env.DEV`)
- [ ] No hardcoded Supabase service_role key anywhere
- [ ] All TODO/FIXME triaged or linked to issues

---

## 1. Supabase (Backend)

### Project Config
- [ ] Project: `kcnujpvzewtuttfcrtyz` (ensure this is the target)
- [ ] Region correct (closest to users — ap-south-1 for India)
- [ ] Plan adequate for current user load (free tier = 500MB DB, upgrade before growth)

### Database
- [ ] All migrations applied (`supabase migration list` or check migration ledger in dashboard)
- [ ] All tables have RLS enabled: `SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;` should be empty
- [ ] RLS policies correct for every role (staff/admin)
- [ ] Indexes on high-traffic FKs: `orders.customer_id`, `order_line_items.order_id`, `deliveries.order_id`, `payments.order_id`, `stock_movements.product_id`, `stock_movements.material_id`
- [ ] `generate_order_number(type_prefix, financial_year)` function exists and has been tested for race conditions
- [ ] Triggers: auto activity-log + auto-notification triggers verified firing on status changes

### Realtime
- [ ] Realtime enabled on: `orders`, `line_items`, `deliveries`, `notifications`, `activity_log`, `stock`, `payments`
- [ ] Replica identity set correctly on realtime tables (FULL or USING INDEX)

### Auth
- [ ] Email provider enabled
- [ ] Email confirmation ON for production
- [ ] JWT expiry reasonable (default 3600s is fine)
- [ ] Password policy: min 8 chars
- [ ] Redirect URL allowlist includes production Vercel URL

### Backups
- [ ] Daily automated backups on
- [ ] Manual snapshot taken before this release
- [ ] Restore procedure tested at least once (non-prod)

---

## 2. Vercel (Frontend)

### Project Config
- [ ] Project linked to correct Git repo/branch
- [ ] Framework preset: Vite
- [ ] Build command: `npm run build` (or `vite build`)
- [ ] Output directory: `dist`
- [ ] Node version: 20.x (LTS)
- [ ] `vercel.json` in place (SPA rewrite `/* → /index.html`)

### Environment Variables (Vercel Dashboard → Settings → Environment Variables)
- [ ] `VITE_SUPABASE_URL` set (production scope)
- [ ] `VITE_SUPABASE_ANON_KEY` set (production scope)
- [ ] `VITE_NOTIFICATION_WEBHOOK_URL` set if WhatsApp/Slack webhook active
- [ ] NO `SUPABASE_SERVICE_ROLE_KEY` in Vercel — never deploy service role key to frontend
- [ ] Preview scope has non-prod Supabase keys (optional — isolate preview data)

### Security Headers (vercel.json)
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- [ ] `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` (if custom domain)
- [ ] CSP configured (if adding — test carefully, it will block inline scripts)

### Domain
- [ ] Custom domain attached (if applicable)
- [ ] DNS propagated (dig/nslookup verify)
- [ ] SSL cert issued (Vercel auto)
- [ ] www → apex redirect (or vice versa) configured

---

## 3. Post-Deployment Smoke Test

Open production URL and verify:
- [ ] Login works with real user
- [ ] Dashboard loads, shows real stats (no 401, no empty data)
- [ ] Create new order — full 4-step wizard completes without errors
- [ ] Order list loads under 2 seconds
- [ ] Stock page loads under 2 seconds
- [ ] Dispatch creation works
- [ ] Invoice generation works
- [ ] Payment recording works
- [ ] Customer master CRUD works
- [ ] Browser console: zero red errors
- [ ] Network tab: no 4xx / 5xx on normal flows
- [ ] Tab-switch test: close tab for 5 min → re-open → data still loads correctly
- [ ] Mobile viewport (375px): all pages usable

---

## 4. Monitoring & Alerts

- [ ] Vercel Analytics enabled
- [ ] Supabase logs checked for errors in first 30 minutes
- [ ] Error tracking (Sentry/Logtail) configured — optional but recommended
- [ ] Uptime monitor (Better Uptime / UptimeRobot) pointing at production URL

---

## 5. Rollback Plan

If production is broken:
1. Vercel Dashboard → Deployments → find last known good deployment → `Promote to Production`
2. If DB schema change broke things: `supabase migration repair --status reverted <version>` and restore DB snapshot taken pre-deployment
3. Alert users via existing notification channel
4. Document the incident in `ISSUES_LOG.md`

---

## 6. Communication

- [ ] Users notified of deployment window (if disruptive)
- [ ] Release notes written (what's new, what's fixed)
- [ ] Admin briefed on any new workflows

---

**Last updated:** 2026-04-24
