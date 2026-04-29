-- ============================================================================
-- POS Phase 13 — security hardening (post-launch advisor cleanup)
-- Spec: docs/specs/2026-04-28-pos-system-design.md §5.3, §6
--
-- 1. Revoke anon EXECUTE on the three SECURITY DEFINER POS functions.
--    The functions already raise on null auth.uid() so anon could never
--    do anything useful, but the advisor flag is correct — anon should
--    not even be able to call them. authenticated retains EXECUTE.
--
-- 2. Tighten product-images bucket SELECT policy to authenticated-only.
--    Public CDN URL fetches still work because bucket.public = TRUE
--    bypasses storage.objects RLS for the /storage/v1/object/public/...
--    path. Tightening prevents anon from listing all object names via
--    the storage API.
--
-- Applied to project kcnujpvzewtuttfcrtyz on 2026-04-29.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION pos_create_sale(JSONB, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION pos_recall_sale(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION pos_close_session(UUID, NUMERIC, TEXT) FROM anon;

DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_authed_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'product-images');
