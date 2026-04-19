# ERP polish — 3 waves

**Date:** 2026-04-18
**Status:** Approved — waves executing in order

Full audit produced 35 concrete polish items across 7 categories (visual,
interaction, workflow, data UX, mobile, accessibility, error handling).
Shipped as 3 waves so user can validate between them.

---

## WAVE 1 — zero-risk quick wins (ship first)

Items 1-8, 15, 17, 19, 20, 29, 30, 32, 33 from the audit list.

| # | Item | Files touched |
|---|---|---|
| 1 | Better empty states on every list page | `components/ui/DataTable`, list pages |
| 2 | Skeleton rows instead of spinner | `components/ui/DataTable` |
| 3 | Toast auto-dismiss: 5 s success / 8 s error | `contexts/ToastContext` |
| 4 | Consistent `loading` prop on every form submit button | form pages |
| 6 | First-visit tip for Cmd+K | `components/Topbar` |
| 7 | Recent Activity card on Dashboard | `pages/Dashboard` |
| 8 | Keyboard cheatsheet modal (Cmd+/) | new `components/ShortcutsModal` |
| 15 | Colorblind-safe status badges | `components/ui/StatusBadge` |
| 17 | Unsaved-changes warning on form pages | new `hooks/useUnsavedChangesPrompt` |
| 19 | Intercept Ctrl+F → focus filter | `components/Topbar` |
| 20 | Short-code aliases in Cmd+K (`ord 412` → ORD-0412) | `lib/db/search` |
| 29 | Replace `window.confirm` with `<ConfirmModal>` | new component + find-replace |
| 30 | Better spinner design | `components/ui/Spinner` |
| 32 | Friendlier error copy | toast call-sites |
| 33 | Success toasts with Undo action (delete, mark-lost) | relevant handlers |

## WAVE 2 — structural polish

Items 5, 9, 11, 13, 16, 21-28, 31, 34, 35 from the audit.

| # | Item | Notes |
|---|---|---|
| 5 | URL-persisted filter state | new `hooks/useQueryState` |
| 9 | Sidebar reorg — 24 masters → Settings → Catalogs | Single biggest UX win |
| 11 | Bulk actions on Orders/Enquiries/Customers | Multi-select + BulkBar |
| 13 | Column chooser + saved views | DataTable extension |
| 16 | Inline form validation (red outline + helper) | Input/Select components |
| 21 | Animated stat-card numbers | Dashboard |
| 22 | Row-hover action buttons | DataTable |
| 23 | Smart date pickers (relative ranges) | DatePicker |
| 24 | Header icon color per module | Layout |
| 25 | `<kbd>` styling for shortcut hints | CSS tokens |
| 26 | Thin top progress bar for in-flight RPC | new GlobalLoadingBar |
| 27 | Favicon unread-notification count | Topbar |
| 28 | Smooth modal open animation | Modal |
| 31 | Saved-view chips on list pages | list pages |
| 34 | Sidebar "What's new" pip | Sidebar |
| 35 | Sidebar badges (e.g., new enquiries today) | Sidebar + Dashboard stats |

## WAVE 3 — bigger features

Items 10, 12, 14, 18 from the audit.

| # | Item | Notes |
|---|---|---|
| 10 | Inline-edit on customer/product rows | DataTable cell editor |
| 12 | Smart defaults on OrderForm from customer's last order | `orders.getLastForCustomer` RPC |
| 14 | Mobile responsive rework of OrderForm + EnquiryForm | form layouts |
| 18 | Print layouts — Invoice, Challan, Order, Quotation PDFs | jsPDF + print CSS |

---

## Rollout

Each wave is a single commit batch, tested locally, deployed to production
via `npx vercel --prod --yes`. Watch commits:
- Wave 1: feat(polish-w1): ...
- Wave 2: feat(polish-w2): ...
- Wave 3: feat(polish-w3): ...

No breaking changes. All additive.
