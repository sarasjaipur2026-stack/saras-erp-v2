-- ============================================================================
-- POS Phase 2 — atomic RPCs
-- pos_create_sale  : single-transaction sale creation with split tenders
-- pos_recall_sale  : load held bill back into cart
-- pos_close_session: reconcile cash + close session, return Z-report
-- Spec: docs/specs/2026-04-28-pos-system-design.md §6
-- Applied to project kcnujpvzewtuttfcrtyz on 2026-04-28.
-- (See live function definitions via supabase MCP get_function — duplicated here
--  as documentation, not as a re-runnable script. CREATE OR REPLACE is safe.)
-- ============================================================================

-- pos_create_sale ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pos_create_sale (
  p_payload JSONB,
  p_idempotency_key UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing_id UUID;
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_seq_num INT;
  v_today TEXT;
  v_held BOOLEAN := COALESCE((p_payload->>'held')::boolean, false);
  v_customer_id UUID := NULLIF(p_payload->>'customer_id','')::uuid;
  v_session_id UUID := NULLIF(p_payload->>'session_id','')::uuid;
  v_warehouse_id UUID := NULLIF(p_payload->>'warehouse_id','')::uuid;
  v_grand_total NUMERIC(12,2) := COALESCE((p_payload->>'grand_total')::numeric, 0);
  v_amount_paid NUMERIC(12,2) := 0;
  v_tender JSONB;
  v_line JSONB;
  v_target TEXT;
  v_account_amount NUMERIC(12,2) := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'pos_create_sale: not authenticated'; END IF;

  -- 1. Idempotency
  SELECT id INTO v_existing_id FROM invoices
   WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key;
  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

  -- 2. Open-session guard
  IF v_session_id IS NOT NULL THEN
    PERFORM 1 FROM pos_sessions WHERE id = v_session_id AND user_id = v_user_id AND closed_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'pos_create_sale: session % closed/not-found', v_session_id; END IF;
  END IF;

  -- 3. Invoice number — POS-YYYYMMDD-NNNN per user per day
  v_today := to_char(now(), 'YYYYMMDD');
  SELECT COALESCE(MAX(SUBSTRING(invoice_number FROM '\d+$')::int), 0) + 1 INTO v_seq_num
    FROM invoices
   WHERE user_id = v_user_id AND source = 'pos' AND invoice_number LIKE 'POS-' || v_today || '-%';
  v_invoice_number := 'POS-' || v_today || '-' || lpad(v_seq_num::text, 4, '0');

  -- 4. Sum tenders
  IF NOT v_held THEN
    FOR v_tender IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'tenders','[]'::jsonb)) LOOP
      v_amount_paid := v_amount_paid + (v_tender->>'amount')::numeric;
      IF v_tender->>'tender_type' = 'account' THEN
        v_account_amount := v_account_amount + (v_tender->>'amount')::numeric;
      END IF;
    END LOOP;
  END IF;

  -- 5. Insert invoice
  INSERT INTO invoices (
    user_id, customer_id, invoice_number, invoice_date,
    subtotal, cgst_amount, sgst_amount, igst_amount, total_tax, grand_total,
    amount_paid, balance_due,
    status, source, doc_type, pos_session_id, held, hold_label, idempotency_key, notes
  ) VALUES (
    v_user_id, v_customer_id, v_invoice_number, CURRENT_DATE,
    COALESCE((p_payload->>'subtotal')::numeric, 0),
    COALESCE((p_payload->>'cgst_amount')::numeric, 0),
    COALESCE((p_payload->>'sgst_amount')::numeric, 0),
    COALESCE((p_payload->>'igst_amount')::numeric, 0),
    COALESCE((p_payload->>'total_tax')::numeric, 0),
    v_grand_total, v_amount_paid, v_grand_total - v_amount_paid,
    CASE WHEN v_held THEN 'draft'::invoice_status
         WHEN v_amount_paid >= v_grand_total THEN 'paid'::invoice_status
         WHEN v_amount_paid > 0 THEN 'partially_paid'::invoice_status
         ELSE 'issued'::invoice_status END,
    'pos', COALESCE(p_payload->>'doc_type','tax_invoice'),
    v_session_id, v_held, p_payload->>'hold_label', p_idempotency_key, p_payload->>'notes'
  ) RETURNING id INTO v_invoice_id;

  -- 6. Lines + stock
  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'lines','[]'::jsonb)) LOOP
    INSERT INTO invoice_lines (
      user_id, invoice_id, product_id, description, qty, unit, rate,
      discount_pct, discount_amt, hsn_code, gst_rate,
      taxable_amount, cgst_amount, sgst_amount, igst_amount, line_total, sort_order
    ) VALUES (
      v_user_id, v_invoice_id, NULLIF(v_line->>'product_id','')::uuid,
      v_line->>'description', (v_line->>'qty')::numeric, v_line->>'unit', (v_line->>'rate')::numeric,
      COALESCE((v_line->>'discount_pct')::numeric, 0),
      COALESCE((v_line->>'discount_amt')::numeric, 0),
      v_line->>'hsn_code',
      COALESCE((v_line->>'gst_rate')::numeric, 0),
      (v_line->>'taxable_amount')::numeric,
      COALESCE((v_line->>'cgst_amount')::numeric, 0),
      COALESCE((v_line->>'sgst_amount')::numeric, 0),
      COALESCE((v_line->>'igst_amount')::numeric, 0),
      (v_line->>'line_total')::numeric,
      COALESCE((v_line->>'sort_order')::int, 0)
    );

    IF v_warehouse_id IS NOT NULL AND NOT v_held AND NULLIF(v_line->>'product_id','') IS NOT NULL THEN
      INSERT INTO stock (user_id, product_id, warehouse_id, quantity, unit)
      VALUES (v_user_id, (v_line->>'product_id')::uuid, v_warehouse_id, -(v_line->>'qty')::numeric, v_line->>'unit')
      ON CONFLICT (user_id, product_id, warehouse_id) DO UPDATE
        SET quantity = stock.quantity - EXCLUDED.quantity * -1, updated_at = now();
    END IF;
  END LOOP;

  -- 7. Tenders + payments
  IF NOT v_held THEN
    FOR v_tender IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'tenders','[]'::jsonb)) LOOP
      INSERT INTO pos_tenders (user_id, invoice_id, tender_type, amount, reference)
      VALUES (v_user_id, v_invoice_id, v_tender->>'tender_type', (v_tender->>'amount')::numeric, v_tender->>'reference');

      INSERT INTO payments (user_id, invoice_id, amount, payment_date, payment_mode, reference_number, tender_type, received_by)
      VALUES (v_user_id, v_invoice_id, (v_tender->>'amount')::numeric, CURRENT_DATE,
              v_tender->>'tender_type', v_tender->>'reference', v_tender->>'tender_type', v_user_id);
    END LOOP;

    IF v_account_amount > 0 AND v_customer_id IS NOT NULL THEN
      INSERT INTO customer_ledger (user_id, customer_id, txn_date, txn_type, debit, credit, invoice_id, notes)
      VALUES (v_user_id, v_customer_id, CURRENT_DATE, 'invoice', v_account_amount, 0, v_invoice_id, 'POS on-account sale');
    END IF;

    -- 8. Print jobs
    FOR v_target IN SELECT jsonb_array_elements_text(COALESCE(p_payload->'outputs','[]'::jsonb)) LOOP
      INSERT INTO pos_print_jobs (user_id, invoice_id, target, payload)
      VALUES (v_user_id, v_invoice_id, v_target, p_payload->'print_payload');
    END LOOP;
  END IF;

  RETURN v_invoice_id;
END;
$$;
GRANT EXECUTE ON FUNCTION pos_create_sale(JSONB, UUID) TO authenticated;

-- pos_recall_sale ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pos_recall_sale (p_invoice_id UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID := auth.uid(); v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT jsonb_build_object(
    'invoice', to_jsonb(i.*),
    'lines', (SELECT jsonb_agg(to_jsonb(l.*) ORDER BY l.sort_order) FROM invoice_lines l WHERE l.invoice_id = i.id)
  ) INTO v_result FROM invoices i
   WHERE i.id = p_invoice_id AND i.user_id = v_user_id AND i.held = true;
  RETURN v_result;
END; $$;
GRANT EXECUTE ON FUNCTION pos_recall_sale(UUID) TO authenticated;

-- pos_close_session ----------------------------------------------------------
CREATE OR REPLACE FUNCTION pos_close_session (p_session_id UUID, p_counted_cash NUMERIC, p_notes TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID := auth.uid(); v_session pos_sessions%ROWTYPE; v_cash_in NUMERIC := 0; v_expected NUMERIC; v_variance NUMERIC; v_report JSONB;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO v_session FROM pos_sessions WHERE id = p_session_id AND user_id = v_user_id AND closed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not open or not found'; END IF;
  SELECT COALESCE(SUM(t.amount), 0) INTO v_cash_in FROM pos_tenders t JOIN invoices i ON i.id = t.invoice_id
   WHERE i.pos_session_id = p_session_id AND t.tender_type = 'cash';
  v_expected := v_session.opened_with + v_cash_in;
  v_variance := p_counted_cash - v_expected;
  UPDATE pos_sessions SET closed_at = now(), closed_with = p_counted_cash, expected_cash = v_expected, variance = v_variance, notes = COALESCE(p_notes, notes) WHERE id = p_session_id;
  SELECT jsonb_build_object(
    'session_id', p_session_id, 'opened_with', v_session.opened_with, 'cash_in', v_cash_in,
    'expected_cash', v_expected, 'counted_cash', p_counted_cash, 'variance', v_variance,
    'invoice_count', (SELECT COUNT(*) FROM invoices WHERE pos_session_id = p_session_id AND held = false),
    'gross_sales', (SELECT COALESCE(SUM(grand_total), 0) FROM invoices WHERE pos_session_id = p_session_id AND held = false)
  ) INTO v_report;
  RETURN v_report;
END; $$;
GRANT EXECUTE ON FUNCTION pos_close_session(UUID, NUMERIC, TEXT) TO authenticated;
