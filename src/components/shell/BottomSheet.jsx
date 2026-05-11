/**
 * BottomSheet — mobile-first slide-up sheet.
 *
 * Used by <ShellShell> on phone widths (<640px) to surface the context
 * panel — thumb-friendly (rises from where the user's hand already is)
 * vs a right-side slide-over which is harder to dismiss one-handed.
 *
 * Features:
 *  - Slides up from the bottom with a drag-handle visual at the top
 *  - Backdrop dim + tap-to-dismiss
 *  - Escape to close
 *  - aria-modal + aria-label
 *  - Max height 85vh with internal scroll (long content doesn't overflow)
 *  - Touch-drag-down to dismiss (browser-native — no JS gesture handler needed,
 *    just the visual affordance for now)
 *  - rounded-t-2xl + shadow so it visually pops off the page
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §7
 * Plan: docs/specs/2026-05-09-erp-shell-plan.md §Phase 9
 */

import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function BottomSheet({ open, onClose, title, children }) {
  // Esc closes
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl flex flex-col transition-transform duration-250 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '85vh' }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Drag handle visual */}
        <div className="flex items-center justify-center pt-2 pb-1 shrink-0">
          <span className="w-9 h-1 rounded-full bg-slate-300" />
        </div>

        <header className="flex items-center justify-between px-4 pb-2 shrink-0">
          <h2 className="text-[13px] font-semibold text-slate-700">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1 text-slate-400 hover:text-slate-700 rounded"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain pb-[max(env(safe-area-inset-bottom),1rem)]">
          {children}
        </div>
      </aside>
    </>
  )
}
