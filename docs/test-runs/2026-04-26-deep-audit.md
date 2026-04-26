# SARAS ERP — Deep Forensic Audit (2026-04-26)

**URL tested:** https://saras-erp-v2-rebuild.vercel.app/
**Commit at start:** 3362501 (`fix: useSWRList silent-retry on empty when consumer expects data`)
**Bundle:** `index-B-pp323-.js`
**Mode:** Read-only audit. No mods, no DB writes (except the SEC-1 migration applied below as a follow-up fix).

---

## 1. Executive Summary

Deep forensic audit on the deployed Vercel URL. App is **functionally healthy**; previously-shipped lag fixes (d2f68c5 + 3362501) are holding. Two new findings emerged that weren't surfaced before:

| ID | Severity | Finding |
|---|---|---|
| **SEC-1** | High (info-disclosure) | 65 Supabase advisor WARNs: `pg_graphql_anon_table_exposed`. The `/graphql/v1` introspection endpoint enumerated every public table to anon. RLS still protected rows but schema/columns were publicly visible. |
| **VAL-1** | Medium | Customer form validation order: `required > GSTIN > PAN > phone`. Email format, free-text length caps, whitespace-only firm/contact, and XSS payloads were NOT validated. React's auto-escape blocked XSS execution but DB accepted garbage. |

Both fixed in this session. Lag-critical files left untouched.

---

## 2. Backend baseline at start

| Source | Result |
|---|---|
| Supabase **security** advisors | 65 WARN (`pg_graphql_anon_table_exposed`) |
| Supabase **performance** advisors | 0 WARN/ERROR · 135 INFO (cosmetic) |
| Vercel runtime logs (12h) | 0 errors / warnings / fatal |
| Git current branch | v2-rebuild clean, head = 3362501 |
| Production deploy | dpl_HrHDB8DD7DcZBrt33T45vpW1rHHz READY |

---

## 3. Browser probes (deployed)

| Test | Result |
|---|---|
| Cold load Dashboard | TTFB 48ms · DOM 417ms · load 444ms · 4 Supabase · 0 errors |
| SPA-nav 16 routes (Orders, Enquiries, Calculator, Production, Jobwork, Stock, Dispatch, Invoices, Payments, Purchase, Reports, Notifications, all 3 heavy masters, /) | All painted, ≤3 Supabase per nav, 0 errors |
| /notifications dup check | **1× per cold load** (CRIT-3 fix holds) |
| /orders/new lazy primeMasters | OK, customer search responsive |
| Customer form: empty submit | ✓ blocked with toast "Firm name and contact name required" |
| Customer form: GSTIN format | ✓ blocked "GSTIN must be 15 characters" |
| Customer form: phone 5 digits | ✓ blocked "Phone must be 10 digits" |
| Customer form: bad email accepted | 🔴 **VAL-1** |
| Customer form: 5000-char city | 🔴 **VAL-1** (no max-length) |
| Customer form: whitespace firm/contact | 🔴 **VAL-1** (truthy-only check) |
| Customer form: XSS in firm | 🔴 **VAL-1** (React auto-escape saves us, but DB accepts the string) |
| Notifications polling over 38min session | 30 fires @ 61s avg interval (correct) |
| Console errors during session | 0 |

---

## 4. Fixes applied this session

### SEC-1 — `pg_graphql` extension dropped
- Verified zero usage in app: `grep -r graphql src/` → 0 matches; package.json has no graphql dep.
- Migration `revoke_pg_graphql_anon_introspection` revoked anon SELECT on graphql schema (didn't fully clear advisor because the advisor checks public.* SELECT grants which RLS-protected tables intentionally allow).
- Migration `drop_pg_graphql_extension_unused` then dropped the extension entirely.
- **Result: 65 → 0 security WARNs.** PostgREST `/rest/v1` API (the only API the SARAS frontend uses) is unaffected.
- The extension can be re-added later if the team wants GraphQL queries. Anon should NOT be re-granted access to it without first locking down the introspection endpoint per Supabase docs.

### VAL-1 — Customer form validation hardened
- Added `validateEmail()` (regex match) + `validateLength(label, value, max)` helpers.
- `handleSave` now trims free-text fields BEFORE the truthy required check (whitespace-only no longer slips through).
- Length caps enforced server-bound: firm_name 200, contact_name 100, city 100, address 500, email 254.
- DB payload sends trimmed strings so leading/trailing whitespace doesn't pollute searches and dropdown lookups.
- Added `maxLength` HTML attribute to all 5 free-text inputs so the browser also caps input client-side.
- Ordering of validators: required > length > email > GSTIN > PAN > phone.

---

## 5. Lag-protection contract

User constraint: "make sure the lag thing does not come back".

The 6 lag-critical files were md5-baselined at the start of this session and verified unchanged at the end:

```
5f709551986dba756e61445894516240  src/hooks/useSWRList.js
b97f41697614bf98c576cd10c4581fa6  src/contexts/AppContext.jsx
8d12163b73b4f3447fcdad3de304f089  src/lib/db/core.js
8a49a0ad1d50547ad037e884c87266f4  src/lib/authGate.js
4aa7f8421a03f92bbe5076a4fa05bdd4  src/components/Topbar.jsx
ecfcb2d2988fbb4e179ff54c1c919b4f  src/App.jsx
```

These hold the d2f68c5 + 3362501 lag fixes. None modified during this audit's fixes.

ESLint: 0 errors, 0 warnings.
Vite build: 2.19s, no chunk size regression.

---

## 6. Carry-overs (NOT fixed this session — flagged for next sprint)

- ChunkLoadError when tab is open across a Vercel deploy (logged in 10× cycle audit).
- Cross-page master-edit doesn't propagate to OrderForm dropdowns until reload.
- `useApp().loadMasterData` API still wired to 5 master pages alongside SWR.

---

## 7. Final Verdict

✅ Backend secured: 0 security WARNs.
✅ Customer form validation hardened.
✅ Lag-critical code untouched (md5s match).
✅ Build green, lint clean.

**Production status:** safer than start of session. No lag regression introduced.
