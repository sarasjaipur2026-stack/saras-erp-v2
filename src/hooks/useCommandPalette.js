import { useCallback, useEffect, useState } from 'react'

/**
 * Global keyboard shortcut + open/close state for the Cmd+K palette.
 * - Ctrl+K (Win/Linux) / Cmd+K (Mac) toggles the palette from anywhere.
 * - Esc closes it.
 * - Input fields that should still open the palette on Ctrl+K are not blocked
 *   (Ctrl+K is not a native browser shortcut inside inputs).
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  const show = useCallback(() => setOpen(true), [])
  const hide = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((v) => !v), [])

  useEffect(() => {
    const onKey = (e) => {
      const isCmdK = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')
      if (isCmdK) {
        e.preventDefault()
        toggle()
        return
      }
      if (open && e.key === 'Escape') {
        e.preventDefault()
        hide()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, toggle, hide])

  return { open, show, hide, toggle }
}
