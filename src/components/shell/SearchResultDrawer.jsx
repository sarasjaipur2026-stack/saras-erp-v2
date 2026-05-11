/**
 * SearchResultDrawer — slide-over preview of a search result.
 *
 * Triggered by Cmd+Enter on a result in CommandPaletteV2. Lets the user
 * peek at a record without leaving their current page. Shows entity-type
 * specific summary fields + a single "Open full page" button that routes
 * to the record's home.
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §5.3
 * Plan: docs/specs/2026-05-09-erp-shell-plan.md §Phase 5
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ExternalLink } from 'lucide-react'
import { formatResult } from '../../lib/db/search'

export default function SearchResultDrawer({ result, onClose }) {
  const navigate = useNavigate()

  // Esc closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!result) return null
  const { title, subtitle, path } = formatResult(result)

  const onOpen = () => {
    onClose()
    if (path && path !== '#') navigate(path)
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/30 transition-opacity duration-150 opacity-100"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed top-0 right-0 h-full z-[61] bg-white shadow-2xl flex flex-col w-[min(420px,92vw)] translate-x-0 transition-transform duration-200 ease-out"
        role="dialog"
        aria-modal="true"
        aria-label="Preview"
      >
        <header className="flex items-center justify-between px-3 py-2 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">{result.entity_type}</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded" aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-lg font-bold text-slate-800 leading-tight">{title}</div>
          {subtitle && (
            <div className="text-[12px] text-slate-500 mt-1">{subtitle}</div>
          )}

          {result.metadata && Object.keys(result.metadata).length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="text-[10px] uppercase font-semibold text-slate-400 mb-2 tracking-wider">Details</div>
              <dl className="space-y-1.5">
                {Object.entries(result.metadata).map(([k, v]) => (
                  v != null && v !== '' && (
                    <div key={k} className="flex items-start justify-between gap-3 text-[12px]">
                      <dt className="text-slate-500 capitalize">{k.replace(/_/g, ' ')}</dt>
                      <dd className="font-medium text-slate-700 text-right">{String(v)}</dd>
                    </div>
                  )
                ))}
              </dl>
            </div>
          )}
        </div>

        <footer className="px-3 py-3 border-t border-slate-100 shrink-0">
          <button
            onClick={onOpen}
            disabled={!path || path === '#'}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            <ExternalLink size={14} /> Open full page
          </button>
          <div className="text-[10px] text-slate-400 text-center mt-2">Esc to close · click outside to dismiss</div>
        </footer>
      </aside>
    </>
  )
}
