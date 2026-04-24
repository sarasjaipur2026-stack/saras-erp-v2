import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Undo2 } from 'lucide-react'

const ToastContext = createContext()

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info', duration = 3500, action = null) => {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, message, type, action }])
    if (duration > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
    }
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Convenience methods
  const success = useCallback((msg) => addToast(msg, 'success'), [addToast])
  const error = useCallback((msg) => addToast(msg, 'error'), [addToast])
  const warning = useCallback((msg) => addToast(msg, 'warning'), [addToast])
  const info = useCallback((msg) => addToast(msg, 'info'), [addToast])
  // Toast with an inline Undo button — preferred over confirm() for destructive
  // actions. Operator can "un-delete" for `duration` ms after the action fires.
  // Usage: toast.action('Customer removed', { label: 'Undo', onClick: restoreFn })
  const action = useCallback((msg, opts = {}) => {
    const duration = opts.duration ?? 6000
    return addToast(msg, opts.type || 'info', duration, {
      label: opts.label || 'Undo',
      onClick: opts.onClick,
    })
  }, [addToast])

  const value = useMemo(
    () => ({ addToast, removeToast, success, error, warning, info, action }),
    [addToast, removeToast, success, error, warning, info, action],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

const TOAST_STYLES = {
  success: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', Icon: CheckCircle },
  error: { bg: 'bg-red-50 border-red-200', text: 'text-red-800', Icon: AlertCircle },
  warning: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', Icon: AlertTriangle },
  info: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', Icon: Info },
}

const ToastContainer = ({ toasts, onRemove }) => (
  <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
    {toasts.map(toast => {
      const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info
      const { Icon } = style
      return (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${style.bg} shadow-lg toast-enter`}
        >
          <Icon size={18} className={style.text} />
          <span className={`text-sm font-medium flex-1 ${style.text}`}>{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => { toast.action.onClick?.(); onRemove(toast.id) }}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold hover:bg-black/5 transition-colors ${style.text}`}
            >
              <Undo2 size={12} />
              {toast.action.label}
            </button>
          )}
          <button
            onClick={() => onRemove(toast.id)}
            className="p-0.5 rounded hover:bg-black/5 transition-colors"
          >
            <X size={14} className={style.text} />
          </button>
        </div>
      )
    })}
  </div>
)

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
