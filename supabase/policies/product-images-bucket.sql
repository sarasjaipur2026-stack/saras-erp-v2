-- ============================================================================
-- Storage bucket: product-images
-- Purpose: SKU images for POS product tiles + masters gallery (multi-image).
-- Public read (CDN-served thumbnails). Authenticated write only.
-- See: docs/specs/2026-04-28-pos-system-design.md §5.3
-- ============================================================================

-- 1. Create the bucket (idempotent — Supabase upsert)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  TRUE,
  524288,                                                   -- 512 KB hard cap; UI compresses to <=500 KB before upload
  ARRAY['image/jpeg', 'image/png', 'image/webp']            -- no SVG, no GIF, no HEIC for now
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. RLS policies on storage.objects scoped to this bucket
-- 2a. Public read — anyone (anon or authed) can SELECT objects in this bucket
DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- 2b. Authenticated write — only logged-in users can INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "product_images_authed_insert" ON storage.objects;
CREATE POLICY "product_images_authed_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_authed_update" ON storage.objects;
CREATE POLICY "product_images_authed_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'product-images')
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_authed_delete" ON storage.objects;
CREATE POLICY "product_images_authed_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images');

-- ----------------------------------------------------------------------------
-- Rollback (for emergency): comment in if the bucket needs to be torn down.
-- ----------------------------------------------------------------------------
-- DROP POLICY IF EXISTS "product_images_public_read"   ON storage.objects;
-- DROP POLICY IF EXISTS "product_images_authed_insert" ON storage.objects;
-- DROP POLICY IF EXISTS "product_images_authed_update" ON storage.objects;
-- DROP POLICY IF EXISTS "product_images_authed_delete" ON storage.objects;
-- DELETE FROM storage.objects WHERE bucket_id = 'product-images';
-- DELETE FROM storage.buckets WHERE id = 'product-images';
