import { useEffect } from 'react'

/**
 * useUnsavedChangesPrompt
 *
 * Warns the user before they navigate away or close the tab when the passed
 * `dirty` flag is true. Wires up both:
 *   1. The browser `beforeunload` event (covers tab close / reload / url-bar
 *      navigation). Most browsers show a generic "Leave site?" dialog.
 *   2. A link/button `popstate` guard via React Router's navigation blocker
 *      equivalent: installs a click-capturer on all anchor tags inside the
 *      document that belong to the current origin.
 *
 * Usage:
 *   const [dirty, setDirty] = useState(false)
 *   useUnsavedChangesPrompt(dirty)
 *   // setDirty(true) on any field change; setDirty(false) after save.
 */
export function useUnsavedChangesPrompt(dirty) {
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e) => {
      e.preventDefault()
      // Chrome requires a truthy returnValue assignment; string isn't shown.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    // Capture clicks on any same-origin link. If the user confirms, let the
    // navigation proceed by removing this handler and re-clicking the link.
    const onClick = (event) => {
      const a = event.target.closest && event.target.closest('a[href]')
      if (!a) return
      const target = a.getAttribute('target')
      if (target && target !== '_self') return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return
      // Only intercept same-origin links to our own routes
      try {
        const url = new URL(href, window.location.origin)
        if (url.origin !== window.location.origin) return
        if (url.pathname === window.location.pathname) return
      } catch { return }
      // Don't block if user has a modifier down (Cmd/Ctrl click to open new tab)
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const ok = window.confirm('You have unsaved changes. Leave anyway?')
      if (!ok) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('click', onClick, { capture: true })

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, { capture: true })
    }
  }, [dirty])
}
