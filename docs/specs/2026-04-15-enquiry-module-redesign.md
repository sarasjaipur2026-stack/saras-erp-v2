# Enquiry Module Redesign — Design Spec

**Date:** 2026-04-15
**Author:** RPK + Claude
**Status:** Approved — ready for implementation
**Target project:** SARAS ERP v2 (React 19 + Vite 8 + Supabase)

---

## 1. Problem

The current Enquiry module is a thin CRUD form with a tab-filtered list. Concretely it fails to support real sales pipeline work:

- **No line items.** `products_required` is one free-text field; every enquiry with more than one product loses structure and analytics.
- **Unstructured source.** `source` is free text. Cannot answer "which channel converts best."
- **One overwritten `notes` field.** Every new call / WhatsApp overwrites the last. No history for enquiries older than a week.
- **No owner assignment.** Multi-salesperson teams cannot split pipelines.
- **No per-enquiry contact person.** Only firm is tracked; people change jobs, one firm has many contacts.
- **No expected close date, no pipeline value, no probability.** No way to size or prioritise the pipeline.
- **No lost reason.** "Mark Lost" records nothing. No learning.
- **No stage separation from outcome.** Status enum conflates "where in pipeline" with "what happened" (`converted`, `lost`).
- **No activity log, no reminders, no Kanban view, no bulk import, no conversion analytics.**
- **Status dropdown lets users manually set `converted` / `lost`** — should only happen via actions.

## 2. Goals

Turn Enquiries from a log of free-text records into a **structured sales pipeline** that:

- Captures multiple products per enquiry with target rates
- Tracks who owns each enquiry
- Records every customer touchpoint (activity timeline)
- Maintains quote version history + samples sent + attachments
- Surfaces "what needs my attention today" through follow-up reminders
- Supports multi-view work: Table, Kanban board, My Pipeline, Dashboard analytics
- Imports marketplace leads in bulk
- Generates enquiries automatically from public QR form + forwarded emails

## 3. Non-goals

- Full CRM replacement (no deal stages with dozens of custom fields; this is a sales pipeline for a manufacturer, not a SaaS sales CRM)
- AI-powered lead scoring or next-best-action (may come later)
- Direct integration with IndiaMART / JustDial APIs (CSV import only for now)
- Replacing Orders (converted enquiries still flow into the existing Orders module)

## 4. Architecture overview

Three waves, each an independent ship. Each wave has DB migration + app UI changes. Rollback plan per wave.

| Wave | Theme | Value |
|---|---|---|
| **1** | Real pipeline — data model + core UI | Makes enquiries a useful pipeline, not just a log |
| **2** | Pipeline workflow — reminders, samples, quotes, attachments, Kanban | Makes daily sales work efficient |
| **3** | Scale & intelligence — bulk import, analytics, public form, email-to-enquiry | Reduces manual data entry, surfaces patterns |

## 5. Data model changes

### 5.1 Wave 1 migrations

**New columns on `enquiries`:**
```sql
ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS contact_person_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_role text,
  ADD COLUMN IF NOT EXISTS source_channel text,            -- 'whatsapp'|'call'|'referral'|'indiamart'|'justdial'|'walkin'|'tradeshow'|'website'|'email'|'cold'|'repeat'|'other'
  ADD COLUMN IF NOT EXISTS source_details text,            -- referrer name, trade show name
  ADD COLUMN IF NOT EXISTS stage text DEFAULT 'new',       -- 'new'|'contacted'|'quoted'|'negotiating'|'closing'
  ADD COLUMN IF NOT EXISTS outcome text DEFAULT 'open',    -- 'open'|'won'|'lost'
  ADD COLUMN IF NOT EXISTS probability int DEFAULT 10,     -- 0..100
  ADD COLUMN IF NOT EXISTS expected_value numeric,         -- sum of line items, auto-maintained
  ADD COLUMN IF NOT EXISTS expected_close_date date,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS lost_reason text,               -- 'price'|'competitor'|'timing'|'mismatch'|'vanished'|'policy'|'other'
  ADD COLUMN IF NOT EXISTS lost_reason_note text,
  ADD COLUMN IF NOT EXISTS competitor_info jsonb;          -- { competitor, rate, intel }
```

**Back-compat:** existing `status` column retained and kept in sync via a trigger that derives `(stage, outcome)` from legacy values:
- `new` → stage=new, outcome=open
- `follow_up` → stage=contacted, outcome=open
- `quoted` → stage=quoted, outcome=open
- `converted` → stage=closing, outcome=won
- `lost` → stage=(unchanged), outcome=lost

New writes set (stage, outcome); the `status` column is deprecated but maintained for any legacy code paths.

**New `enquiry_line_items` table:**
```sql
CREATE TABLE public.enquiry_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id uuid NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  product_name_override text,                -- when customer asks for something not in catalog
  quantity numeric NOT NULL,
  unit text,
  target_rate numeric,                       -- customer's asking price
  our_quoted_rate numeric,                   -- what we quoted
  line_value numeric GENERATED ALWAYS AS (quantity * COALESCE(our_quoted_rate, target_rate, 0)) STORED,
  notes text,
  position int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_enquiry_line_items_enquiry ON public.enquiry_line_items(enquiry_id);
```

**Trigger:** aggregate `line_value` into `enquiries.expected_value` on insert/update/delete of line items.

**New `enquiry_activities` table (timeline):**
```sql
CREATE TABLE public.enquiry_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id uuid NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  activity_type text NOT NULL,               -- 'call'|'whatsapp'|'email'|'visit'|'quote_sent'|'sample_sent'|'note'|'stage_change'|'system'
  direction text,                            -- 'inbound'|'outbound'
  body text,
  metadata jsonb,                            -- free-form: duration, attachment refs, from_stage/to_stage, etc.
  happened_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_enquiry_activities_enquiry_time ON public.enquiry_activities(enquiry_id, happened_at DESC);
```

### 5.2 Wave 2 migrations

**New `enquiry_samples` table:**
```sql
CREATE TABLE public.enquiry_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id uuid NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  quantity numeric,
  unit text,
  sent_on date,
  courier text,
  tracking_number text,
  status text DEFAULT 'pending',             -- 'pending'|'sent'|'received'|'feedback_pending'|'approved'|'rejected'
  feedback_notes text,
  received_on date,
  feedback_on date,
  created_at timestamptz DEFAULT now()
);
```

**New `enquiry_quotes` table (quote versions):**
```sql
CREATE TABLE public.enquiry_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id uuid NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  version int NOT NULL,                      -- 1, 2, 3...
  line_items jsonb NOT NULL,                 -- snapshot of line items at time of quote
  subtotal numeric,
  taxes numeric,
  grand_total numeric,
  validity_date date,
  terms text,
  sent_at timestamptz,
  sent_via text,                             -- 'whatsapp'|'email'|'print'
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_enquiry_quotes_version ON public.enquiry_quotes(enquiry_id, version);
```

**Reminder system:** use existing `notifications` table + a scheduled function (Supabase cron) that runs at 9am IST daily:
```sql
-- Every morning, push a notification for each enquiry with followup_date = today or overdue
-- into notifications for the assigned_to user.
```

### 5.3 Wave 3 migrations

**New `enquiry_import_logs` table (bulk import tracking):**
```sql
CREATE TABLE public.enquiry_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  filename text,
  total_rows int,
  imported_rows int,
  skipped_rows int,
  errors jsonb,
  created_at timestamptz DEFAULT now()
);
```

**Public enquiry form:** endpoint that does NOT require auth — uses a shared secret token.
```sql
-- public_enquiry_tokens: each org has a token they can rotate
CREATE TABLE public.public_enquiry_tokens (
  token text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),      -- owner who receives the enquiry
  label text,                                   -- 'trade-show-2026-04', 'qr-on-business-card'
  source_channel text NOT NULL,                 -- pre-populates source when form submitted
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```
Frontend route `/public/enquiry/:token` — 3-field form (name + phone + what they need) — posts to an Edge Function that creates the enquiry under the owner's user_id.

**Email-to-enquiry:** Supabase Edge Function + SendGrid Inbound Parse (or equivalent) routes `enquiries@yourdomain.in` emails → parses sender, subject, body, attachments → creates enquiry + activities + attachments.

## 6. UI changes

### 6.1 New Enquiry form (Wave 1)

Replaces current single-card form. Two-column layout on desktop, stacked on mobile.

**Left column (customer + contact):**
- Customer (existing CustomerSearch)
- Contact person name (auto-fill from customer's default contact if present)
- Contact phone (same)
- Contact role (GM / Purchase / Owner / Sales / Other)

**Right column (pipeline metadata):**
- Source channel (dropdown — 12 options listed in §5.1)
- Source details (text, e.g. "Referred by Mehta Ji")
- Assigned to (dropdown, defaults to creator)
- Stage (dropdown — New/Contacted/Quoted/Negotiating/Closing — drives probability default)
- Probability % (slider, pre-filled based on stage, user can override)
- Expected close date
- Priority (Normal / High / Urgent)

**Full-width below:**
- **Line items table** — add/remove rows (product from catalog, qty, unit, target rate, our quoted rate, notes)
- **Expected value** auto-computed and displayed bold
- **Notes** (free-form, first activity on creation)
- **Competitor info** (collapsible card — name, rate, intel)

### 6.2 Enquiry detail page (new — Wave 1)

Tabs: **Overview / Activity / Line Items / Samples / Quotes / Attachments**.

- **Overview**: summary card (customer, contact, stage, probability, assigned to, expected close, expected value) + action bar (Convert to Order / Mark Lost / Edit)
- **Activity**: timeline of every call, WhatsApp, email, visit, stage change, quote sent — each with icon, timestamp, author, one-line summary. "+ Log Activity" button. One-click quick actions: WhatsApp sent, Call made, Visit done.
- **Line Items**: same table as form, editable in place
- **Samples** (Wave 2): sample tracking list + status
- **Quotes** (Wave 2): version history + "Generate new quote" button → PDF
- **Attachments** (Wave 2): files + images uploaded via existing `attachments` table

### 6.3 Enquiries list page (Wave 1)

Replace current 4-tab filter with a proper filter bar (builds on the Wave 3 search foundation from the prior search redesign — reuses that pattern here):

- Search bar (calls `search_entities` scoped to enquiries)
- Chip filters: Stage × (multi), Outcome (Open / Won / Lost), Assigned to, Source channel, Expected close range, Value range, Priority
- Saved views: "My Pipeline", "Overdue Follow-ups", "Lost This Month", "High Value (₹1L+)"
- Column toggles: enquiry #, customer, contact, stage, prob, value, expected close, age (days since created), last activity

**View switcher:** Table (default) / Kanban (Wave 2) / Dashboard (Wave 3).

### 6.4 Kanban board (Wave 2)

Columns: **New → Contacted → Quoted → Negotiating → Closing** (open outcome) + a collapsed **Won** and **Lost** column on the right.

Each card: customer firm, enquiry #, expected value, probability, assigned to avatar, days-in-stage indicator (green <3d / amber 3–7d / red >7d).

Drag card to new column → backend updates stage + probability default + logs stage_change activity.

### 6.5 Mark Lost modal (Wave 1)

Replaces current one-click "Mark Lost". Opens a modal:
- Lost reason (dropdown): Price too high / Competitor won / Timing wrong / Product mismatch / Customer vanished / Internal policy / Other
- Note (optional)
- Optional: enter competitor name + their rate (populates `competitor_info`)
- "Confirm Lost" writes `outcome=lost`, `lost_reason`, `lost_reason_note`, logs activity.

### 6.6 Dashboard (Wave 3)

Analytics widgets:
- **Pipeline funnel**: bar chart of count + value per stage
- **Weighted pipeline value**: sum of `expected_value × probability/100` for all open enquiries
- **Conversion rate**: enquiries converted / total last 30/90/365 days
- **Source performance**: pie of converted value by source_channel
- **Lost reasons**: histogram of lost_reason, last 90 days
- **Assignee leaderboard**: conversions + open pipeline value per salesperson
- **Ageing**: open enquiries by days-since-created (0-7 / 8-30 / 31-90 / 90+)

### 6.7 Public form (Wave 3)

Route `/public/enquiry/:token` — **no auth**, mobile-first, 3 required fields + optional:

- Your name
- Your phone (used to match / create customer)
- What you need (free text OR picker if catalog is light)
- (optional) Firm name, email, quantity

On submit: creates a customer if new (matched by phone), creates enquiry assigned to the token's owner, shows a thank-you screen. Owner gets a push notification.

QR code generator for the token — paste on business cards, trade-show banners.

### 6.8 Bulk import (Wave 3)

Upload CSV → column-mapping UI → preview 5 rows → confirm → batch insert. Supported mappers out-of-the-box: **IndiaMART**, **JustDial**, **Generic CSV**. Saves column mappings per format.

### 6.9 Email-to-enquiry (Wave 3)

Configure `enquiries@yourdomain.in` → an Edge Function receives the email webhook → parses sender (matches customer by email), subject, body, attachments → creates enquiry with source=email, body as first activity, attachments stored.

## 7. UX fixes shipped with Wave 1

- **Remove `converted` / `lost` from manual status dropdown** — these only happen via actions
- **Add "Undo Mark Lost"** — within 1 hour, before any other edit
- **Table sorting** by value, expected close, age
- **Clickable row → detail page** (currently only actions button works)
- **Action-menu instead of icon row** (works better on narrow screens)
- **Bigger follow-up date** — surfaced in list + dashboard, not just on the detail

## 8. Error handling

- **Line item validation**: qty > 0, rate ≥ 0, at least one line item required on save
- **Stage change**: server-side check that user is `assigned_to` OR admin; otherwise reject
- **Mark Lost**: require `lost_reason`; reject if missing
- **Bulk import**: per-row validation with error report; partial success (valid rows imported, errors listed)
- **Public form**: rate-limited (5 submissions per IP per hour); honeypot field against bots
- **Email-to-enquiry**: if parsing fails, send bounce to sender with error + log to admin

## 9. Security

- All new tables have RLS policies: `user_id = auth.uid()` OR `assigned_to = auth.uid()` for read; `user_id = auth.uid()` for write
- Public form uses per-token write; token rotatable, one-off revocable
- Email-to-enquiry auth via shared webhook secret
- `competitor_info jsonb` sanitized before display (no HTML injection via competitor names)

## 10. Rollback plan

- **Wave 1 migration**: additive columns + new tables. Rollback = drop new columns + drop new tables. Existing code keeps working because legacy `status` column is preserved.
- **Wave 1 UI**: feature flag `app_settings.enquiry_v2_enabled` gates the new form + detail page. If disabled, old form continues to render.
- **Wave 2**: independent from Wave 1 backend; rollback of samples/quotes/kanban components has no data-loss risk.
- **Wave 3**: public form + email-to-enquiry + bulk import are standalone endpoints; rollback = disable the routes / edge functions. Data already created stays.

## 11. Performance targets

- Enquiry list page (after Wave 3 filter bar): < 200ms render on 5,000 enquiries with 3 filters applied
- Kanban drag-drop: optimistic update (instant visual), server write within 200ms
- Public form submission to enquiry created: < 1s end-to-end
- Bulk import: 1,000 rows in < 15 seconds

## 12. Testing strategy

- **Unit**: pipeline value calculation, stage-probability defaults, legacy-status migration trigger
- **Integration**: Playwright — create enquiry → add 3 line items → verify expected_value → change stage → verify activity log → mark lost with reason → verify outcome
- **Seed data** for dev: 50 synthetic enquiries across all stages, all sources, various values
- **Migration safety**: run on a branch copy first (Supabase branch databases)

## 13. Files expected to change

**New files:**
- `supabase/migrations/{ts}_enquiry_v1_core.sql` (Wave 1)
- `supabase/migrations/{ts}_enquiry_v2_workflow.sql` (Wave 2)
- `supabase/migrations/{ts}_enquiry_v3_scale.sql` (Wave 3)
- `src/modules/enquiry/EnquiryDetail.jsx` (Wave 1)
- `src/modules/enquiry/components/ActivityTimeline.jsx` (Wave 1)
- `src/modules/enquiry/components/LineItemsEditor.jsx` (Wave 1)
- `src/modules/enquiry/components/LostReasonModal.jsx` (Wave 1)
- `src/modules/enquiry/components/EnquiryKanban.jsx` (Wave 2)
- `src/modules/enquiry/components/SampleTracker.jsx` (Wave 2)
- `src/modules/enquiry/components/QuoteVersions.jsx` (Wave 2)
- `src/modules/enquiry/components/EnquiryDashboard.jsx` (Wave 3)
- `src/modules/enquiry/components/BulkImport.jsx` (Wave 3)
- `src/pages/PublicEnquiryForm.jsx` (Wave 3, /public/enquiry/:token)
- `supabase/functions/enquiry-email-parser/index.ts` (Wave 3)
- `src/lib/db/enquiryPipeline.js` (new RPCs + helpers)

**Modified:**
- `src/modules/enquiry/EnquiryForm.jsx` — complete rewrite
- `src/modules/enquiry/EnquiriesPage.jsx` — add filter bar + view switcher
- `src/lib/db/orders.js` — update enquiries.create/update for new schema
- `src/App.jsx` — add routes for /enquiries/:id (detail), /public/enquiry/:token
- `src/components/Sidebar.jsx` — update Enquiries badge (count of today's follow-ups)

## 14. Open questions

None at approval time. User signaled "do all" — Claude uses judgment for remaining details using these defaults:
- 12 source channels listed match common Indian B2B lead sources
- 5 pipeline stages match most manufacturer sales cycles (not a 10-stage enterprise SaaS funnel)
- Probability defaults: New=10, Contacted=20, Quoted=40, Negotiating=70, Closing=90
- Lost reasons fixed list; "Other" with note covers edge cases
- Kanban drag uses HTML5 drag-and-drop (no heavy library)
- Bulk import: IndiaMART + JustDial presets + Generic CSV; other sources = generic mapper
- Public form: 3 required fields (name, phone, need) to minimize abandonment; more fields optional

---

**End of spec.**
