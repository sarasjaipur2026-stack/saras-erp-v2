# Migrating a module to the shell pattern

How to redesign a module page to use `<ShellShell>` + the surrounding shell primitives. Used during per-module sub-projects (Orders Workspace, Production Board, Stock + Purchase, Dispatch, Invoicing + Payments + Reports, Masters cleanup).

See `docs/SHELL.md` for the reference of what's available.

## When to use ShellShell

Wrap your page in `<ShellShell>` ONLY when the page has at least one of:

- A natural left rail — filters, categories, sub-navigation, date strip
- A natural right context — selected-item summary, related metrics, action stack

Pages with neither (Calculator, Settings, the new Login page) don't need ShellShell. Wrapping them adds nothing visually. Skip the wrap.

## The shape

```jsx
import ShellShell from '../../components/shell/ShellShell'

export default function MyModulePage() {
  const filters = <FilterChips ... />
  const context = <SelectedItemCard ... />

  return (
    <ShellShell navRail={filters} context={context}>
      <MainList ... />
    </ShellShell>
  )
}
```

The three slots correspond to the three panels in `docs/SHELL.md` §Responsive ladder.

## Where to put what

| Slot | Belongs there | Doesn't belong there |
|---|---|---|
| **navRail** | filter chips · date strip · category list · saved searches · sub-nav | the page's primary content (use centre) |
| **centre** | the main list / detail view / canvas the user is working in | filters (use navRail) · action buttons that aren't tied to a single row (use context) |
| **context** | currently-selected row summary · cross-module info (customer credit, machine status, recent payments) · quick actions for the centre | navigation (use navRail or Sidebar) |

## Anti-patterns

### ❌ Don't wrap pages that have no rails

```jsx
// BAD — ShellShell with no rails is identical to <div>{children}</div>
<ShellShell>
  <CalculatorPage/>
</ShellShell>
```

Just render `<CalculatorPage/>` directly.

### ❌ Don't put the page title inside navRail

navRail is for filters and sub-nav. The page title goes ABOVE ShellShell (or in the topbar via PageTitle component if you add one).

### ❌ Don't open the context drawer programmatically on first render

It's a user-initiated panel. Auto-opening on render fights the user's mental model. Open it via:

- Click on a row in centre (sets selection state, context becomes visible)
- Click the pull-tab or "Details" button on tablet/phone

### ❌ Don't render expensive cross-module queries in context unconditionally

Context cards may not be visible (phone bottom-sheet closed). Use `useSWRList` so they don't actually fetch until rendered, OR pass a `selectionId` prop and only fetch when it's truthy.

## Patterns

### Selection state

Most "3-panel" modules need a "currently selected row" — the centre lists; clicking sets selection; right context shows the selected row's detail.

```jsx
const [selectedId, setSelectedId] = useState(null)
const selected = useMemo(() => list.find(r => r.id === selectedId), [list, selectedId])

return (
  <ShellShell
    navRail={<Filters value={filter} onChange={setFilter} />}
    context={selected && <DetailCard row={selected} onClose={() => setSelectedId(null)} />}
  >
    <List rows={filtered} onSelect={setSelectedId} selectedId={selectedId} />
  </ShellShell>
)
```

Note: when nothing is selected, pass `context={null}` (not `<div>nothing</div>`). ShellShell collapses the right column.

### Saved searches in navRail

Persist via a per-module top-level key on `profiles.preferences` (flat, mirrors `pinned_nav`). Convention: `<module>_saved_searches`.

| Module | Key | Shape |
|---|---|---|
| Orders | `orders_saved_searches` | `Array<{ name: string, params: Record<string,string> }>` |
| Production | `production_saved_searches` | same shape (future) |
| Stock | `stock_saved_searches` | same shape (future) |

Use `mergePreferences` from `src/lib/db/profiles.js` (read-modify-write, ≤2 KB total blob). Thin DAL wrappers (`getSavedSearches`, `saveSearch`, `removeSearch`) live in `profiles.js` and accept the module key so they stay generic.

Why flat keys not nested `saved_searches.orders`? Two reasons:
1. Mirrors `pinned_nav` which is already flat — consistency wins.
2. RMW on a flat key is one less destructure step + fewer "key missing → null deref" footguns.

Cap saved-search count at ~16 per module (each entry ~80 bytes serialised; well under the 2 KB ceiling).

### Linking back into the URL

Use `?selected=<id>` query param so a refresh or a deep-link preserves the right panel state. `useSearchParams` from react-router.

### Cross-module peek

Add the row to a `useSWRList` keyed by its id. When the user Cmd+Enters on it in the palette, `<SearchResultDrawer>` is the generic answer. For tighter integration (e.g. Orders module wants to peek at Customer detail), pass `<CustomerCard>` to ShellShell's `context` slot — same primitive, different content.

## Status pills, NowWhat cards

Adding a new NowWhat home card or a new status pill is a small change to two files each. See:

- New NowWhat card → `src/pages/now-what/cards.jsx` (add export) + `src/pages/now-what/cards.jsx` `CARD_REGISTRY` + `src/pages/now-what/visibility.js` (decide which roles see it)
- New status pill → `src/components/shell/StatusPills.jsx` (add a `<Pill>`) + plumb the signal into `src/hooks/useShellHealth.js`

## Lag-protection — non-negotiable

When you wrap a page in ShellShell, you're editing the page file. The page files are NOT in the lag-protection list — safe to edit freely. BUT:

- Don't edit `useSWRList.js`, `AppContext.jsx`, `db/core.js`, `authGate.js`
- Topbar.legacy.jsx + App.jsx are at locked baselines

Re-verify md5s after each commit:

```
md5sum src/hooks/useSWRList.js src/contexts/AppContext.jsx src/lib/db/core.js src/lib/authGate.js src/components/Topbar.legacy.jsx src/App.jsx
```

Expected (post-shell-build):
```
5f7095…  useSWRList.js          MUST MATCH
b97f41…  AppContext.jsx         MUST MATCH
8d1216…  db/core.js             MUST MATCH
8a49a0…  authGate.js            MUST MATCH
4aa7f8…  Topbar.legacy.jsx      MUST MATCH
fa5532…  App.jsx                may drift if you intentionally edit it; re-baseline + document
```

## Test discipline

Add unit tests for any pure helpers your module introduces (label generators, filter predicates, totals reducers). Run via `npm run test:shell` pattern — add a new `test:<module>` script and chain into the root `test` command.

React component tests via Vitest + RTL are still deferred. If you genuinely need them for your module, that's the moment to install Vitest. Otherwise rely on Playwright E2E for end-to-end coverage.
