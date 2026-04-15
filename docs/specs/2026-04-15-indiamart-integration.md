# IndiaMART Integration — Design Spec

**Date:** 2026-04-15
**Status:** Approved — ready for implementation (MVP + 10x tier)
**Target:** SARAS ERP v2
**Prerequisite:** One IndiaMART Lead Manager account with CRM API access (confirmed)

---

## 1. Problem

Leads that arrive via IndiaMART today live in IndiaMART's dashboard/email only. Manually re-typing each lead into the ERP's Enquiries module is slow, error-prone, and delays first response — which is the #1 ranking factor on IndiaMART. Lost responses = lost future leads.

## 2. Goals

- **Auto-pull** every IndiaMART lead into the ERP as an enquiry (no manual typing)
- **Match or create** a customer for every lead (no duplicate customers)
- **Measure** response time, conversion rate, ROI vs. IndiaMART subscription cost
- **Accelerate first response** — one-tap WhatsApp template send + response-time dashboard

## 3. Non-goals (this phase)

- Two-way sync (updates back to IndiaMART)
- JustDial / other marketplace ingestion (same pattern can extend later)
- AI lead qualification (Wave 3)
- Cross-firm routing (single account for now)

## 4. Architecture

```
                   ┌─────────────────────┐
                   │   IndiaMART API     │
                   │  mapi.indiamart.com │
                   └──────────┬──────────┘
                              │ poll every 5 min
                              ▼
         ┌────────────────────────────────────┐
         │  Supabase Edge Function            │
         │  indiamart-sync (Deno)             │
         │  - reads CRM key from app_settings │
         │  - fetches new leads since cursor  │
         │  - upserts into marketplace_leads  │
         │  - triggers enqueue handler        │
         └─────────────┬──────────────────────┘
                       ▼
              ┌────────────────────┐
              │ marketplace_leads  │ (raw + metadata + status)
              └─────────┬──────────┘
                        │ AFTER INSERT trigger
                        ▼
           ┌──────────────────────────────┐
           │ process_marketplace_lead()   │
           │ - match customer (phone/name)│
           │ - create customer if no match│
           │ - auto-create enquiry        │
           │ - log activity               │
           └──────────┬───────────────────┘
                      ▼
        ┌──────────────────────────────┐
        │  ENQUIRY (source=indiamart)  │
        │  + activity "Received …"     │
        └──────────────────────────────┘
```

**Manual fallback:** "Sync Now" button in the UI triggers the same Edge Function synchronously for immediate feedback.

**Scheduling:** `pg_cron` job every 5 minutes invokes the Edge Function via Supabase internal URL.

## 5. Database schema

### 5.1 `marketplace_leads` (new)
Stores every raw lead independently of whether it becomes an enquiry (preserves full audit trail, lets user mark spam without losing the record).

```sql
CREATE TABLE public.marketplace_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  provider text NOT NULL,                      -- 'indiamart' | 'justdial' | 'tradeindia' | …
  provider_lead_id text NOT NULL,              -- IndiaMART's UNIQUE_QUERY_ID
  received_at timestamptz NOT NULL,            -- QUERY_TIME from provider
  raw_payload jsonb NOT NULL,                  -- full provider response row
  sender_name text,
  sender_mobile text,
  sender_email text,
  sender_company text,
  sender_city text,
  sender_state text,
  sender_country text,
  product_name text,
  product_category text,
  subject text,
  message text,
  quality text DEFAULT 'unknown',              -- 'high' | 'medium' | 'low' | 'spam' | 'unknown'
  status text DEFAULT 'new',                   -- 'new' | 'processed' | 'ignored' | 'spam' | 'error'
  enquiry_id uuid REFERENCES public.enquiries(id) ON DELETE SET NULL,
  matched_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  error_message text,
  response_sent_at timestamptz,                -- first response logged
  response_channel text,                       -- 'whatsapp' | 'email' | 'call'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (provider, provider_lead_id)
);

CREATE INDEX idx_marketplace_leads_user ON public.marketplace_leads(user_id, received_at DESC);
CREATE INDEX idx_marketplace_leads_status ON public.marketplace_leads(status) WHERE status IN ('new','error');
CREATE INDEX idx_marketplace_leads_mobile ON public.marketplace_leads(sender_mobile);
```

### 5.2 `indiamart_config` (new — separate so we can add other providers later)
```sql
CREATE TABLE public.marketplace_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  provider text NOT NULL,
  crm_key text NOT NULL,                       -- encrypted in production via Supabase Vault
  firm text,                                   -- which firm handles leads: 'SU' | 'SC' | 'either'
  default_assignee uuid REFERENCES auth.users(id),
  is_active boolean DEFAULT true,
  last_synced_at timestamptz,
  last_successful_sync_at timestamptz,
  last_error_message text,
  last_error_at timestamptz,
  total_synced int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, provider)
);
```

### 5.3 Sync cursor + audit log
```sql
CREATE TABLE public.marketplace_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid REFERENCES public.marketplace_configs(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  leads_fetched int DEFAULT 0,
  leads_new int DEFAULT 0,
  leads_duplicate int DEFAULT 0,
  leads_errored int DEFAULT 0,
  error_message text,
  trigger_source text                          -- 'cron' | 'manual'
);
```

## 6. RPCs / Functions

### 6.1 `match_or_create_customer(phone, firm, email, city)`
```sql
-- Returns customer_id. Matches in priority order:
-- 1. Exact phone match (strip non-digits, match last 10)
-- 2. Fuzzy firm name match via trigram (similarity > 0.7)
-- 3. Create new customer with source_company from caller
```

### 6.2 `process_marketplace_lead(lead_id)`
Idempotent — safe to retry. Sequence:
1. If lead already `status=processed`, return.
2. Call `match_or_create_customer` with lead's sender_mobile/company/email/city.
3. Check spam rules (see §7). If spam → status=spam.
4. Create enquiry with:
   - customer_id = matched/created
   - source_channel = 'indiamart'
   - source_details = `IndiaMART · ${product_name}`
   - contact_person_name = sender_name
   - contact_phone = sender_mobile
   - notes = message
   - stage = 'new', outcome = 'open', probability = 10
   - assigned_to = config.default_assignee
5. Create enquiry_activity of type `system` with body "Received via IndiaMART at HH:MM".
6. Update lead: status=processed, enquiry_id, matched_customer_id.

### 6.3 Trigger: auto-process on insert
```sql
CREATE TRIGGER trg_marketplace_leads_autoprocess
  AFTER INSERT ON public.marketplace_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.process_marketplace_lead_trigger();
```

## 7. Spam detection (heuristic — no ML in MVP)

Mark as `quality='spam'`, `status='spam'` (skips enquiry creation) if ANY of:
- `sender_mobile` matches regex `^(0+|1+|9999999999|0000000000|1234567890)$`
- `message` length < 10 characters and `product_name` is null
- `sender_name` in `['test','demo','spam','xxx','abc','buyer']` (case-insensitive)
- `sender_mobile` is blacklisted (user-maintained `blocked_phones` list)

User can flip `status='spam'` → `status='new'` manually and re-process.

## 8. Edge Function (Deno)

File: `supabase/functions/indiamart-sync/index.ts`

```typescript
// Pulls leads for all active configs and inserts into marketplace_leads.
// Triggered by pg_cron every 5 min OR by client-side "Sync Now" button.
//
// For each active config:
//   1. window = last_synced_at → now() (capped at 90 days for first sync)
//   2. GET mapi.indiamart.com/wservce/crm/crmListing/v2/?glusr_crm_key=…&start_time=…&end_time=…
//   3. For each lead: upsert into marketplace_leads (ON CONFLICT provider+provider_lead_id DO NOTHING)
//   4. Update config.last_synced_at = now(), last_successful_sync_at, total_synced
//   5. Insert marketplace_sync_runs record
```

## 9. UI surfaces

### 9.1 Settings → Integrations → IndiaMART (new page)
- Paste CRM key (show/hide toggle)
- Choose default firm (SU / SC / Either)
- Choose default assignee
- "Test connection" button → calls `indiamart-sync` with test=true
- "Sync now" button
- Status card: last synced at, leads today/week/month, last error

### 9.2 Leads inbox (new page — /leads)
- Table of recent `marketplace_leads`
- Filters: status (all/new/spam/errored), quality, received (today/week/month), product category
- Click row → shows full message + sender info + linked enquiry
- Actions per row: Open enquiry, Mark as spam, Retry process (if errored), Send WhatsApp response

### 9.3 Enquiry integration (existing page upgrade)
- Filter chip "Source: IndiaMART" on Enquiries list
- Badge on enquiry cards if source_channel=indiamart
- On EnquiryDetail, the `source_details` shows "IndiaMART · Jute Twine 3mm" and clicking expands to show the raw lead message

### 9.4 One-tap WhatsApp response
On any lead or IndiaMART-sourced enquiry, a "Reply on WhatsApp" button:
- Opens WhatsApp deep-link `wa.me/<phone>?text=<encoded template>`
- Template from `app_settings.indiamart_response_template` (editable)
- Default: "Hello {{name}}, thank you for your enquiry via IndiaMART for {{product}}. We are SARAS UDYOG from Jaipur. Sharing rates + catalog shortly. May we know quantity + destination? – Team SARAS"
- After click, logs activity `whatsapp` on enquiry + sets `response_sent_at` on lead

### 9.5 Response-time widget (on leads inbox + dashboard)
- **Avg response time this week:** 14 min (target < 10 min)
- **Unresponded leads:** 3 · oldest 22 min (red pill)
- Per-staff leaderboard (responses + avg time)

### 9.6 Conversion analytics (on dashboard)
Monthly widget:
- IndiaMART leads received
- → Enquiries auto-created: N
- → Quoted rate: %
- → Won: count + ₹ revenue
- Cost input: configurable monthly subscription fee → auto-computes cost-per-won-lead
- Compare row: source_channel breakdown (indiamart / referral / walkin / etc.)

## 10. Rollout plan

| Wave | Scope | Output |
|---|---|---|
| **1 — Foundation + manual sync** | Schema, RPCs, Edge Function code, Settings page (paste key + Sync Now), Leads inbox | Ingestion works; sync runs on demand |
| **2 — Automation + fast response** | pg_cron schedule, WhatsApp template reply, response-time tracker, spam filter UI | Hands-off polling + fastest-response workflow |
| **3 — Analytics + polish** | Conversion dashboard, cost-per-lead, source comparison, auto-assignment rules, response templates library | ROI visibility + ops at scale |

## 11. Error handling

- **API rate-limited (429):** exponential backoff, log to sync_runs, retry next cron
- **Invalid/expired CRM key:** set config.is_active=false, surface big red banner + email admin
- **Network failure:** log to `marketplace_sync_runs.error_message`; don't overwrite `last_successful_sync_at`
- **Lead processing failure:** lead.status='error' + error_message; retry via "Retry process" button
- **Duplicate lead insert:** silently ignored (UNIQUE constraint on provider+provider_lead_id)

## 12. Security

- CRM key stored in `marketplace_configs.crm_key`. In prod, use Supabase Vault for at-rest encryption.
- Edge Function only accepts authenticated calls OR cron-trusted service role
- RLS on `marketplace_leads`, `marketplace_configs`, `marketplace_sync_runs`: owner-only (`user_id = auth.uid()`)
- No raw CRM key ever returned to client after initial save (display as `••••••••1234` with show/hide toggle)

## 13. Files expected to change / create

**New:**
- `supabase/migrations/{ts}_indiamart_integration.sql`
- `supabase/functions/indiamart-sync/index.ts`
- `src/modules/integrations/IndiaMartSettings.jsx`
- `src/modules/leads/LeadsInbox.jsx`
- `src/modules/leads/LeadDetail.jsx`
- `src/lib/db/marketplaceLeads.js`

**Modified:**
- `src/App.jsx` — add /leads and /settings/integrations/indiamart routes
- `src/components/Sidebar.jsx` — add "Leads" item (above Enquiries)
- `src/modules/enquiry/EnquiriesPage.jsx` — filter by source=indiamart
- `src/modules/enquiry/EnquiryDetail.jsx` — link to underlying lead if present
- `vercel.json` — add `/leads` and `/settings/integrations/*` to rewrites (already catch-all)

## 14. Manual setup the user must do

1. Generate CRM key in IndiaMART seller dashboard
2. In ERP: Settings → Integrations → IndiaMART → paste key, click Test, click Save
3. Deploy the Edge Function via Supabase dashboard (copy-paste the `index.ts` file)
4. (Wave 2) Configure pg_cron schedule (SQL one-liner provided)

---

**End of spec.**
