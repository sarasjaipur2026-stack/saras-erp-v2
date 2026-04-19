import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Modal, Button } from './ui'

// ConfirmProvider
//
// Replaces the scattered `window.confirm(...)` calls with a Promise-returning
// `confirm({ title, message, variant })` that shows a styled modal matching
// our design system. Drop-in replacement:
//
//   const confirm = useConfirm()
//   if (await confirm({ title: 'Delete order?', message: 'This cannot be undone.', variant: 'danger' })) {
//     // user clicked Confirm
//   }

const ConfirmContext = createContext(null)

// Resolvable singleton — keeps `useConfirm()` callable as a plain function
// outside React (e.g., from db handlers if we ever want that).
let globalConfirm = null

export function ConfirmProvider({ children }) {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState({})
  const [resolver, setResolver] = useState(null)

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setOpts({
        title:       options.title       || 'Are you sure?',
        message:     options.message     || 'This action cannot be undone.',
        confirmText: options.confirmText || 'Confirm',
        cancelText:  options.cancelText  || 'Cancel',
        variant:     options.variant     || 'primary',   // 'primary' | 'danger'
      })
      setResolver(() => resolve)
      setOpen(true)
    })
  }, [])

  // Expose `confirm` to the module-level singleton so `confirmDialog(...)`
  // can be imported imperatively outside the React tree (e.g., from
  // db handlers). Set inside an effect to satisfy React's purity rules.
  useEffect(() => { globalConfirm = confirm; return () => { globalConfirm = null } }, [confirm])

  const handleClose = (value) => {
    setOpen(false)
    resolver?.(value)
    setResolver(null)
  }

  const ctxValue = useMemo(() => ({ confirm }), [confirm])

  return (
    <ConfirmContext.Provider value={ctxValue}>
      {children}
      <Modal open={open} onClose={() => handleClose(false)} title={opts.title} size="sm">
        <div className="space-y-4">
          <p className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap">{opts.message}</p>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" size="sm" onClick={() => handleClose(false)}>{opts.cancelText}</Button>
            <Button variant={opts.variant === 'danger' ? 'danger' : 'primary'} size="sm" onClick={() => handleClose(true)}>
              {opts.confirmText}
            </Button>
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    // Development convenience: if someone calls useConfirm outside the
    // provider, fall back to window.confirm so the app doesn't crash.
    return async ({ message }) => window.confirm(message || 'Are you sure?')
  }
  return ctx.confirm
}

// eslint-disable-next-line react-refresh/only-export-components
export function confirmDialog(options) {
  if (globalConfirm) return globalConfirm(options)
  return Promise.resolve(window.confirm(options?.message || 'Are you sure?'))
}
