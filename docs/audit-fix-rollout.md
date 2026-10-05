# Audit fixes rollout

1. Restore Supabase V2 after the organization billing block is resolved.
2. Apply versioned migration `20261005092516_audit_workflow_fixes.sql` before deploying this frontend. Verify the new conversion RPC and grants exist.
3. Deploy the frontend and verify authenticated enquiry conversion, retries, draft order saves and payment recording.

The new conversion RPC checks enquiry edit and order create permissions, locks the enquiry, creates at most one linked draft order, and marks its outcome won in the same transaction. Existing linked conversions with an open outcome are reconciled. It retains the existing behavior of creating a draft header without copying enquiry items.

New order save requests retain a SHA-256 payload fingerprint and the original result for durable retry protection. Historical payloads and business audit history are preserved. Future audit growth is reduced by combining monetary recalculations and ignoring unchanged row updates.

This does not reclaim existing storage or impose a retention window: removing request IDs can permit duplicate creates on late retries, and deleting business audit history needs a separate retention decision. Once database access is restored, measure both history tables and design an archive policy based on their actual size.

Auth waits now have bounded deadlines. Timed-out underlying auth requests are not cancelled; late completions are left to the Supabase client. Ambiguous writes are still never automatically retried.

The migration also fixes the invoice status cast for both text and enum schemas, including legacy line-ending differences. No live migration or production deployment has been performed as part of preparing this change.
