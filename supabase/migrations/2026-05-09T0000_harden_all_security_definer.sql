-- ============================================================================
-- 2026-05-09 — SECURITY DEFINER hardening across the entire public schema
--
-- Earlier audit fixed pos_create_sale / pos_recall_sale / pos_close_session
-- by revoking PUBLIC. Subsequent advisor sweep found 10 pre-existing functions
-- still callable by anon — but they had EXPLICIT anon grants (different from
-- the POS case where it came via PUBLIC).
--
-- Categories:
--  1. Trigger-only (audit_trigger, handle_new_user, log_invoice_to_ledger,
--     log_payment_to_ledger) — never need REST exposure. Triggers fire as
--     postgres owner regardless.
--  2. RLS helpers + JS-callable (can_manage, can_operate, current_user_role,
--     is_admin, generate_enquiry_number, search_entities) — authenticated
--     needs EXECUTE so policies/UI work; anon does not.
--
-- Both categories: revoke from anon explicitly. PUBLIC also revoked for
-- defense in depth.
-- ============================================================================

-- Trigger-only
REVOKE EXECUTE ON FUNCTION audit_trigger() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION log_invoice_to_ledger() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION log_payment_to_ledger() FROM PUBLIC, anon;

-- RLS helpers + JS-callable: ensure authenticated keeps it, anon loses it
REVOKE EXECUTE ON FUNCTION can_manage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_manage() TO authenticated;
REVOKE EXECUTE ON FUNCTION can_operate() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_operate() TO authenticated;
REVOKE EXECUTE ON FUNCTION current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION current_user_role() TO authenticated;
REVOKE EXECUTE ON FUNCTION is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
REVOKE EXECUTE ON FUNCTION generate_enquiry_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_enquiry_number(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION search_entities(text, text[], integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION search_entities(text, text[], integer, uuid) TO authenticated;
