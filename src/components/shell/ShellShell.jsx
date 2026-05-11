/**
 * <ShellShell> — the 3-panel responsive scaffold every module mounts inside.
 *
 * The big idea: every module page declares up to three pieces of content
 * (left nav rail, centre work, right context cards). ShellShell handles the
 * responsive collapse — same code adapts to 320px phone, 768px tablet,
 * 1024px small desktop, 1280px+ full desktop.
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §5.1
 * Plan: docs/specs/2026-05-09-erp-shell-plan.md §Phase 1
 *
 * Usage:
 *   <ShellShell
 *     navRail={<OrdersFilters/>}
 *     context={<CustomerCard/>}
 *   >
 *     <OrdersList/>
 *   </ShellShell>
 *
 *   // Page with no rails (e.g. Calculator) — just children:
 *   <ShellShell>
 *     <CalculatorPage/>
 *   </ShellShell>
 *
 * Responsive ladder (driven by viewport, not container queries — works with
 * Tailwind 4 defaults already in use across the codebase):
 *
 *   ≥1280px (xl)  navRail · centre · context  — all three columns visible
 *   1024-1279px   navRail · centre — context becomes pull-tab on right edge
 *   768-1023px    centre only — both rails behind top-of-centre tab buttons
 *   <768px        centre only — navRail in modal, context in bottom-sheet
 *
 * Slide-overs / drawers use React state and Tailwind transitions. No external
 * dep needed. Focus trap + Escape-to-close handled inline.
 */

import { useState, useEffect, useCallback } from 'react'
import { X, SlidersHorizontal, ClipboardList } from 'lucide-react'
import BottomSheet from './BottomSheet'

const DEFAULT_NAV_WIDTH = 200
const DEFAULT_CTX_WIDTH = 360

export default function ShellShell({
  navRail = null,
  context = null,
  navRailWidth = DEFAULT_NAV_WIDTH,
  contextWidth = DEFAULT_CTX_WIDTH,
  children,
}) {
  const hasNav = navRail !== null
  const hasCtx = context !== null

  // ----- Drawer / sheet state for sub-xl viewports -----
  // Only one slide-over may be open at a time. Opening either closes the other.
  const [openPanel, setOpenPanel] = useState(null) // null | 'nav' | 'ctx'
  const openNav = useCallback(() => setOpenPanel('nav'), [])
  const openCtx = useCallback(() => setOpenPanel('ctx'), [])
  const closeAny = useCallback(() => setOpenPanel(null), [])

  // Esc closes any open slide-over
  useEffect(() => {
    if (!openPanel) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeAny()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPanel, closeAny])

  // No rails → just render children straight through. Page gets full width.
  if (!hasNav && !hasCtx) {
    return <div className="w-full">{children}</div>
  }

  // Build the desktop grid template based on which rails are declared.
  // We use inline grid-template-columns rather than Tailwind classes because
  // navRailWidth / contextWidth are runtime props.
  const gridCols = [
    hasNav ? `${navRailWidth}px` : null,
    '1fr',
    hasCtx ? `${contextWidth}px` : null,
  ].filter(Boolean).join(' ')

  return (
    <>
      {/* ===== xl (≥1280px): full 3-panel grid ===== */}
      <div
        className="hidden xl:grid h-full w-full"
        style={{ gridTemplateColumns: gridCols }}
      >
        {hasNav && (
          <aside className="border-r border-slate-200 bg-white overflow-y-auto">
            {navRail}
          </aside>
        )}
        <main className="overflow-y-auto">{children}</main>
        {hasCtx && (
          <aside className="border-l border-slate-200 bg-white overflow-y-auto">
            {context}
          </aside>
        )}
      </div>

      {/* ===== lg (1024-1279px): navRail visible inline, context as pull-tab ===== */}
      <div
        className="hidden lg:grid xl:hidden h-full w-full"
        style={{ gridTemplateColumns: hasNav ? `${navRailWidth}px 1fr` : '1fr' }}
      >
        {hasNav && (
          <aside className="border-r border-slate-200 bg-white overflow-y-auto">
            {navRail}
          </aside>
        )}
        <main className="overflow-y-auto relative">{children}</main>
      </div>

      {/* ===== md (768-1023px) and below: centre only, tab buttons at top ===== */}
      <div className="lg:hidden h-full w-full flex flex-col">
        {(hasNav || hasCtx) && (
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 bg-white shrink-0">
            {hasNav && (
              <button
                onClick={openNav}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300"
                aria-label="Open filters"
              >
                <SlidersHorizontal size={12} /> Filter
              </button>
            )}
            {hasCtx && (
              <button
                onClick={openCtx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300 ml-auto"
                aria-label="Open details"
              >
                <ClipboardList size={12} /> Details
              </button>
            )}
          </div>
        )}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* ===== lg-only: context pull-tab on right edge ===== */}
      {hasCtx && (
        <button
          onClick={openCtx}
          className="hidden lg:flex xl:hidden fixed right-0 top-1/2 -translate-y-1/2 z-30 items-center gap-1.5 px-2 py-3 rounded-l-lg bg-white border border-r-0 border-slate-200 shadow-md text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          aria-label="Open details"
        >
          <ClipboardList size={13} />
          Details
        </button>
      )}

      {/* ===== Nav rail slide-over (all sub-xl widths) — stays as a left-side
                 drawer regardless of viewport (Sidebar already uses this idiom). */}
      {hasNav && (
        <SlideOver
          open={openPanel === 'nav'}
          onClose={closeAny}
          side="left"
          title="Filters"
          widthPx={Math.max(navRailWidth, 280)}
        >
          {navRail}
        </SlideOver>
      )}

      {/* ===== Context drawer — phone gets a bottom-sheet (thumb-friendly);
                 sm/md keep the right slide-over. ===== */}
      {hasCtx && (
        <>
          {/* sm:hidden — phone */}
          <div className="sm:hidden">
            <BottomSheet
              open={openPanel === 'ctx'}
              onClose={closeAny}
              title="Details"
            >
              {context}
            </BottomSheet>
          </div>
          {/* hidden sm:block — tablet/desktop slide-over */}
          <div className="hidden sm:block">
            <SlideOver
              open={openPanel === 'ctx'}
              onClose={closeAny}
              side="right"
              title="Details"
              widthPx={Math.max(contextWidth, 320)}
            >
              {context}
            </SlideOver>
          </div>
        </>
      )}
    </>
  )
}

/* ---------------------------------------------------------------------------
 * SlideOver — internal helper.
 * Opens from left or right with a backdrop. On phone (<640px) it becomes
 * a full-width sheet that slides from the right (more thumb-friendly than
 * a left drawer that fights with the system back-swipe on Android).
 * --------------------------------------------------------------------------*/
function SlideOver({ open, onClose, side, title, widthPx, children }) {
  const isLeft = side === 'left'
  const translateClass = open
    ? 'translate-x-0'
    : isLeft
      ? '-translate-x-full'
      : 'translate-x-full'

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className={`fixed top-0 ${isLeft ? 'left-0' : 'right-0'} h-full z-50 bg-white shadow-2xl flex flex-col transition-transform duration-200 ease-out ${translateClass}`}
        style={{ width: `min(${widthPx}px, 92vw)` }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-center justify-between px-3 py-2 border-b border-slate-100 shrink-0">
          <h2 className="text-[12px] font-semibold text-slate-700">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  )
}
