# Audit fixes rollout

1. Restore Supabase V2 after the organization billing block is resolved.
2. Back up the database and compare installed migration history. Apply every missing migration in filename order, including `20261005092516_audit_workflow_fixes.sql` and `20261005095632_deep_audit_integrity.sql`, before deploying this frontend. Do not apply the final migration alone to an older schema.
3. Run the read-only checks in `docs/integrity-reconciliation.sql`. New safeguards do not repair historical overpayments, negative balances, missing production postings or invalid invoices. Review anomalies before making corrections.
4. Verify `erp_schema_version()` returns `20261005095632`. Its public anonymous access intentionally exposes only a constant compatibility version; business RPCs remain authenticated and permission checked.
5. Set the server-only Vercel environment variable `SUPABASE_SERVICE_ROLE_KEY` for the notification forwarding endpoint. It must never have a `VITE_` prefix. The existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` supply its project configuration. The webhook uses the existing admin-managed app settings, HTTPS public destinations, pinned DNS, permission-checked notification IDs and durable delivery claims. Missing server configuration returns an explicit failure. Disabled forwarding does not affect business writes.
6. Deploy the frontend and server function together, then verify enquiry conversion/retries, draft duplication, calculator linking, role changes, payment recording, product/material delivery, production output/notes, attachment access and invoice reports with representative staff accounts. GitHub and native Vercel builds run a database-version gate; missing/unavailable migrations block deployment.

The migration revokes direct client writes to orders/items/charges, payments, invoices, deliveries, production plans, jobwork items and stock movements. Existing UI actions use checked RPCs. Profile edits retain only name/firm column grants, and administrative role changes use the guarded RPC. A last-admin trigger also protects deletion/cascades. Roll back frontend and database permissions together during a maintenance window: the older frontend relies on writes that the new migration blocks. Do not restore broad mutation grants as an automatic rollback.

All stock insert paths share a transaction-level inventory lock and check the exact identity/unit/warehouse bucket before an outward movement. Dispatch allocates matching stock across warehouses, preferring a line's product SKU when it also specifies its input material. Jobwork outward currently uses the unassigned-warehouse bucket; staff must have stock there until warehouse selection is added to that workflow. Manual adjustment now exposes product SKUs/materials as well as jobwork yarn/product types. Existing corrupt balances are preserved for reconciliation.

Sales/GST reports now represent non-draft, non-cancelled issued invoices by invoice date. Customer outstanding remains an operational active-order report, including unbilled booked orders. Cancelled purchase orders are excluded from the purchase register. Taxable zero values are preserved, CSV formula strings are neutralized, and ranges use Indian business dates with an exclusive next-day boundary. These reports do not implement credit-note accounting or replace the accounting ledger.

Production completion requires positive output and posts stock atomically. The detail form submits its current output/notes with completion; table completion uses previously saved output. Completed plans remain immutable. Notes persist for open plans, and unknown patch fields are rejected. Existing booking-to-production and explicit QC override behavior are preserved.

Financial notifications require their entity permissions plus payment-view permission. Broadcast read state is now per user. Attachment/storage access follows the owning module; new uploads include the uploader ID in their path so an edit-only user can clean up a failed upload. Legacy paths remain readable under their owning entity permissions.

Verification includes authenticated direct-write denial and positive RPC tests in the isolated migrated PostgreSQL harness, legacy-schema upgrades and server webhook mocks. Real PostgreSQL simultaneous transactions and live browser acceptance remain required after database restoration; PGlite tests do not prove production concurrency or deployment behavior.

The new conversion RPC checks enquiry edit and order create permissions, locks the enquiry, creates at most one linked draft order, and marks its outcome won in the same transaction. Existing linked conversions with an open outcome are reconciled. It retains the existing behavior of creating a draft header without copying enquiry items.

New order save requests retain a SHA-256 payload fingerprint and the original result for durable retry protection. Historical payloads and business audit history are preserved. Future audit growth is reduced by combining monetary recalculations and ignoring unchanged row updates.

This does not reclaim existing storage or impose a retention window: removing request IDs can permit duplicate creates on late retries, and deleting business audit history needs a separate retention decision. Once database access is restored, measure both history tables and design an archive policy based on their actual size.

Auth waits now have bounded deadlines. Timed-out underlying auth requests are not cancelled; late completions are left to the Supabase client. Ambiguous writes are still never automatically retried.

The migration also fixes the invoice status cast for both text and enum schemas, including legacy line-ending differences. No live migration or production deployment has been performed as part of preparing this change.
