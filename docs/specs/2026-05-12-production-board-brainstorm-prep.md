# Production Board — brainstorm prep

Sub-project #2 in the per-module redesign queue (after Orders Workspace).
Not yet started — this doc captures **what's known** so the brainstorm
session can move fast when the user is ready.

## Context

The Orders Workspace ships dispatch + payments + invoice tabs that link
into production via `?order_id=…` URLs but stop there. The user values
the POS-style UI and asked for "make all modules work like POS." The
Production module is the next obvious place to apply that pattern — it's
the second-most-clicked module after Orders.

## What exists today

Module path: `src/modules/production/`

DAL: `src/lib/db/production.js` — `productionPlans` table factory + helpers:
- `list()` — all plans with order/machine/material joins (capped 1000)
- `listByOrder(orderId)` — by-order subset (used by Orders V2 detail)
- `create(plans[])` — bulk insert
- `update(id, patch)` — header update

Schema highlights (`production_plans` table):
- `order_id` · `machine_id` · `material_id`
- `planned_qty` · `completed_qty`
- `planned_start` · `planned_end`
- `status` — planned / in_progress / completed / paused / cancelled
- `operator_id` (from production module's operator master)

Status flow:
```
planned → in_progress → completed
            ↓
          paused / cancelled
```

The Orders V2 ProductionTab already shows per-plan cards with progress
bars + status badges (commit `a7c4123`). That's the data shape the kanban
must work with.

## Open design questions (for the brainstorm)

### Q1 — Layout / scope
- Pure kanban (5 columns by status) OR mixed (kanban + machine timeline)?
- Phone-first responsiveness? On phone, kanban columns get long — do
  we stack as accordion or horizontal-scroll-snap?

### Q2 — Drag-drop
- Drag a card between status columns → call `update(id, {status})`?
  Optimistic with rollback on error?
- Or just a status dropdown menu inside the card (no drag, cheaper to
  build, fewer bugs)?

### Q3 — Card density
- Compact (machine · order # · % progress) OR rich (+ planned start/end,
  operator photo, material, customer)?
- Phone uses compact, desktop uses rich? Or one shape for both?

### Q4 — Filters
- Filter by machine (which is busy now?) — most-asked production question
- Filter by customer — pull all open production for "Sharma Tex"
- Filter by date window — what's due this week?
- Multi-filter behaviour same as Orders V2 navRail (URL-linked, saved
  searches)?

### Q5 — Quick actions per card
- "Mark in_progress" / "Mark completed" buttons inline on the card?
- "Update completed_qty" inline numpad?
- "Open order" → /orders/:id/...

### Q6 — Wizard for new plans
- POS-style tile picker like the order wizard? Pick machine → pick
  material → set qty → save?
- Or stay form-based?
- New plans usually come FROM an approved order — so the wizard should
  also accept `?order_id=…` and pre-fill from `orders.order_line_items`.

### Q7 — Operator view
- Should the kanban have a "my machines only" filter for operators?
- Different default columns per role? (operator: in_progress only;
  manager: all 5)

## Learnings to carry over from Orders V2

From `docs/MIGRATING_TO_SHELL.md#learnings-from-orders-v2`:

1. **Plan App.jsx re-baselines up front** — production list, detail (if
   any), and wizard each need their own commit + md5 re-baseline.
2. **Co-locate JSX-free constants** in sibling `.js` files so Node
   `--test` can import them.
3. **Avoid `icon: Icon` aliased-prop** — inline buttons instead.
4. **Pure helpers extract well** — pull math + validation + transforms
   into JSX-free modules for cheap test coverage.
5. **Conservative scope** — keep the legacy production page on a fallback
   route until the kanban catches up.
6. **Lag contract** — verify md5sum after every commit.

## Estimated phasing

13-phase shape, mirroring Orders V2:

| Phase | Deliverable | Days |
|---|---|---|
| 0 | Scaffold `modules/production-v2/` + saved-search key | ½ |
| 1 | `useProductionList` hook + URL filters + saved searches | 1 |
| 2 | `ProductionV2Page` skeleton with kanban layout (no drag yet) | 1 |
| 3 | navRail filters (status · machine · customer · date) | 1 |
| 4 | **Route swap** `/production` → V2 (App.jsx re-baseline) | ½ |
| 5 | Card design + status-gated quick-action menu | 1 |
| 6 | Drag-and-drop between columns (optional — based on Q2) | 1 |
| 7 | `usePlanDetail` hook + plan-detail panel (right rail or modal) | 1 |
| 8 | Inline qty editor (POS numpad pattern) for completed_qty | 1 |
| 9 | `ProductionWizardV2` — new plan creator (POS-style tile picker) | 1.5 |
| 10 | Pre-fill from `?order_id=…` + auto-compute planned_qty | 1 |
| 11 | Unit tests (status transitions · filter URL serde · qty math) | 1 |
| 12 | Docs (`docs/PRODUCTION_V2.md`) | ½ |
| 13 | Deploy + smoke + launch report | ½ |

Total: ~13 working days, same as Orders V2.

## Pre-brainstorm checklist for the user

When ready to start, the user should:
1. Look at the current production page (https://saras-erp-v2-rebuild.vercel.app/production)
2. Note what works / what's frustrating
3. Decide on Q1 (layout) and Q2 (drag-drop) — those drive the next 4 phases
4. Reply: `/brainstorming production board` with the answers to Q1+Q2

The skill will then walk through Q3-Q7 and generate the spec.

## Backlog (parking lot — don't start until brainstorm finishes)

- Operator mobile-first view at `/production/operator`
- Machine downtime tracking
- Material consumption tracking integrated with stock
- QC checkpoint between in_progress and completed
- Print operator card / job sheet
- WhatsApp notification when a plan moves to in_progress
