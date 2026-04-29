# SARAS POS — Launch Report

**Date:** 2026-04-29
**Branch:** v2-rebuild
**Production:** https://saras-erp-v2-rebuild.vercel.app
**Latest deploy:** dpl_HG1o5Rf5sZsyEx4ZwithtE8wZYto · commit `22a5dcb` · state READY

## Phases shipped

| Phase | Commit | What |
|---|---|---|
| 0 | `2c804ad` | Deps + product-images bucket + permission catalog |
| 1 | `d533761` | DB schema — 5 new tables + invoice_lines + additive cols |
| 2 | `745e737` | RPCs — pos_create_sale / pos_recall_sale / pos_close_session |
| 3 | `56d8f0e` | Multi-image gallery in ProductsPage |
| 4 | `34d7f5a` | PosLayout + 4 routes + sidebar (App.jsx baseline `bb817ca`) |
| 5 | `886f2f2` | usePosCart + gstSplit + tenderRules |
| 6 | `fad9833` | PosRegisterPage 3-panel composition |
| 7 | `abc958a` | CheckoutDrawer + createSale wiring |
| 8 | `20e694c` | Hold/Recall + Numpad + keyboard shortcuts |
| 9 | `38881d0` | Session lifecycle UI + Z-report |
| 10 | `dd47b81` | Print bridge + thermal receipt builder |
| 11 | `6339017` | Quick Invoice (Mode C) on OrderDetail |
| 12 | `22a5dcb` | 23 unit tests (gstSplit + tenderRules) |
| 13 | (this) | Security hardening — anon revokes + bucket policy tighten |

## Lag-protection contract

| File | Baseline (Phase 0) | Final |
|---|---|---|
| `src/hooks/useSWRList.js` | `5f7095…` | `5f7095…` ✓ |
| `src/contexts/AppContext.jsx` | `b97f41…` | `b97f41…` ✓ |
| `src/lib/db/core.js` | `8d1216…` | `8d1216…` ✓ |
| `src/lib/authGate.js` | `8a49a0…` | `8a49a0…` ✓ |
| `src/components/Topbar.jsx` | `4aa7f8…` | `4aa7f8…` ✓ |
| `src/App.jsx` | `ecfcb2…` | `bb817c…` (planned re-baseline at Phase 4) |

## Backend state

- 6 new tables, all RLS-on, all in `supabase_realtime` publication
- 3 SECURITY DEFINER PL/pgSQL functions, anon-revoked
- `product-images` storage bucket (512KB cap, jpeg/png/webp), authenticated SELECT
- 1 default `pos_terminals` row seeded per existing user

## Tests

- 23/23 unit tests passing (`npm run test:pos`, 124ms total)
- Build: green at every phase, ~1.3s typical
- ESLint: not run dedicated for POS modules (pre-existing repo lint config covers them)

## Known follow-ups (v2 backlog)

- Card terminal SDK integration (placeholder reference field today)
- Refund / void-after-payment flow
- Offline-first PWA (only if reliability becomes a problem — current shop has good wifi)
- WhatsApp + Email Edge Functions (frontend builds the receipt; bridge handles thermal; A4 uses browser print today; WA/email not yet wired to a sender)
- Customer side display
- Voice / barcode-scanner input

## How to use

1. **Counter cashier flow**: log in → click POS in sidebar → /pos/session opens drawer with cash count → /pos register loads → walk-in stays default; F2 picks registered customer; tap or search-Enter adds tile to cart; F8 opens Checkout → tender + outputs → Confirm → thermal receipt prints + cart resets.
2. **Field tablet flow**: navigate to /pos/field instead of /pos. Same flow, larger tiles, 3-col grid.
3. **Quick Invoice**: open any order → click "⚡ Quick Invoice" → pre-filled drawer → Confirm. Skips production/dispatch wizard.
4. **Print bridge**: install `tools/print-bridge/` on the counter PC per its README. Topbar shows green/red printer pill.
