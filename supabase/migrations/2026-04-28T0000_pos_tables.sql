-- ============================================================================
-- POS Phase 1 — schema migrations
-- Spec: docs/specs/2026-04-28-pos-system-design.md §5
-- Plan: docs/specs/2026-04-28-pos-system-plan.md §Phase 1
-- All changes additive. Existing order-driven invoice flow unaffected.
-- Applied to project kcnujpvzewtuttfcrtyz on 2026-04-28.
-- ============================================================================

-- pos_terminals --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('counter','field')),
  default_warehouse_id UUID REFERENCES warehouses(id),
  printer_config JSONB DEFAULT '{}'::jsonb,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);
ALTER TABLE pos_terminals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pos_terminals_owner_all" ON pos_terminals;
CREATE POLICY "pos_terminals_owner_all" ON pos_terminals FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- pos_sessions ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  terminal_id UUID NOT NULL REFERENCES pos_terminals(id),
  cashier_id UUID NOT NULL REFERENCES profiles(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_with NUMERIC(12,2) NOT NULL,
  closed_at TIMESTAMPTZ,
  closed_with NUMERIC(12,2),
  expected_cash NUMERIC(12,2),
  variance NUMERIC(12,2),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_open ON pos_sessions (user_id, terminal_id) WHERE closed_at IS NULL;
ALTER TABLE pos_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pos_sessions_owner_all" ON pos_sessions;
CREATE POLICY "pos_sessions_owner_all" ON pos_sessions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- invoice_lines (POS-only line items) ----------------------------------------
CREATE TABLE IF NOT EXISTS invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  description TEXT NOT NULL,
  qty NUMERIC(14,3) NOT NULL,
  unit TEXT NOT NULL,
  rate NUMERIC(12,2) NOT NULL,
  discount_pct NUMERIC(5,2) DEFAULT 0,
  discount_amt NUMERIC(12,2) DEFAULT 0,
  hsn_code TEXT,
  gst_rate NUMERIC(5,2) DEFAULT 0,
  taxable_amount NUMERIC(12,2) NOT NULL,
  cgst_amount NUMERIC(12,2) DEFAULT 0,
  sgst_amount NUMERIC(12,2) DEFAULT 0,
  igst_amount NUMERIC(12,2) DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines (invoice_id);
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoice_lines_owner_all" ON invoice_lines;
CREATE POLICY "invoice_lines_owner_all" ON invoice_lines FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- pos_tenders ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_tenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tender_type TEXT NOT NULL CHECK (tender_type IN ('cash','upi','card','account')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pos_tenders_invoice ON pos_tenders (invoice_id);
ALTER TABLE pos_tenders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pos_tenders_owner_all" ON pos_tenders;
CREATE POLICY "pos_tenders_owner_all" ON pos_tenders FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- pos_print_jobs -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  target TEXT NOT NULL CHECK (target IN ('thermal','a4','whatsapp','email')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  payload JSONB,
  attempts INT DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pos_print_jobs_pending ON pos_print_jobs (status, target) WHERE status = 'pending';
ALTER TABLE pos_print_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pos_print_jobs_owner_all" ON pos_print_jobs;
CREATE POLICY "pos_print_jobs_owner_all" ON pos_print_jobs FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- product_images -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  thumb_path TEXT,
  is_primary BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_one_primary ON product_images (product_id) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images (product_id);
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_images_owner_all" ON product_images;
CREATE POLICY "product_images_owner_all" ON product_images FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- additive columns: invoices -------------------------------------------------
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'order' CHECK (source IN ('order','pos'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'tax_invoice' CHECK (doc_type IN ('tax_invoice','bill_of_supply'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pos_session_id UUID REFERENCES pos_sessions(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS held BOOLEAN DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS hold_label TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS idempotency_key UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_idempotency ON invoices (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- additive columns: payments -------------------------------------------------
ALTER TABLE payments ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tender_type TEXT CHECK (tender_type IN ('cash','upi','card','account'));
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments (invoice_id);

-- realtime -------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE invoice_lines;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_tenders;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_print_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE product_images;

-- seed default terminal per user --------------------------------------------
INSERT INTO pos_terminals (user_id, name, mode, default_warehouse_id)
SELECT p.id, 'Counter 1', 'counter', (SELECT id FROM warehouses WHERE user_id = p.id ORDER BY created_at LIMIT 1)
FROM profiles p
WHERE NOT EXISTS (SELECT 1 FROM pos_terminals t WHERE t.user_id = p.id);
