-- ============================================================================
-- ERP Shell Phase 0 — profiles.preferences JSONB
--
-- Stores per-user UI state for the new shell:
--   { "pinned_nav": [{ "path": "/pos", "label": "POS" }, ...] }
-- Future flags (theme, default_doc_type, etc.) extend this same blob.
--
-- Spec: docs/specs/2026-05-09-erp-shell-design.md §6.2
-- Plan: docs/specs/2026-05-09-erp-shell-plan.md §Phase 0
-- Applied to project kcnujpvzewtuttfcrtyz on 2026-05-09.
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb NOT NULL;
