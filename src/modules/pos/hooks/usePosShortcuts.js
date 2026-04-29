/**
 * usePosShortcuts — keyboard shortcut binder for the POS register.
 *
 * F1  — focus search bar (handled by SearchBar itself)
 * F2  — open customer picker (handled by CustomerChip itself)
 * F3  — open bill discount sheet (TODO Phase 9)
 * F4  — open hold sheet (this hook fires `onHold`)
 * F5  — open recall sheet (this hook fires `onRecall`)
 * F8  — open checkout (this hook fires `onCheckout`)
 * F12 — reprint last receipt (TODO Phase 10)
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §7
 */

import { useEffect } from 'react'

export function usePosShortcuts({ onCheckout, onHold, onRecall, onReprint } = {}) {
  useEffect(() => {
    const handler = (e) => {
      // Ignore when typing into form controls — but Modal-level inputs still
      // bubble; keep behaviour predictable by checking activeElement.
      const ae = document.activeElement
      const inForm = ae && ae.matches?.('input, textarea, select')
      if (e.key === 'F8') {
        e.preventDefault()
        onCheckout?.()
      } else if (e.key === 'F4') {
        e.preventDefault()
        onHold?.()
      } else if (e.key === 'F5' && !inForm) {
        e.preventDefault()
        onRecall?.()
      } else if (e.key === 'F12') {
        e.preventDefault()
        onReprint?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCheckout, onHold, onRecall, onReprint])
}
