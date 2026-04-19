import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

const ToastContext = createContext()

// Per-type durations tuned so errors stay long enough to actually read:
//   success  4.5 s  — confirms the action
//   info     4.5 s
//   warning  6 s
//   error    8 s   — worth the extra time; user might need to re-try
const DEFAULT_DURATIONS = { success: 4500, info: 4500, warning: 6000, error: 8000 }

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([])

  // addToast signature:
  //   addToast(message, type?, options?)
  // options = { duration, action: { label, onClick } }
  const addToast = useCallback((message, type = 'info', options = {}) => {
    const duration = options.duration ?? DEFAULT_DURATIONS[type] ?? 4500
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, message, type, action: options.action || null }])
    if (duration > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
    }
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Convenience methods — second arg may be options object for action/duration overrides.
  const success = useCallback((msg, options) => addToast(msg, 'success', options), [addToast])
  const error = useCallback((msg, options) => addToast(msg, 'error', options), [addToast])
  const warning = useCallback((msg, options) => addToast(msg, 'warning', options), [addToast])
  const info = useCallback((msg, options) => addToast(msg, 'info', options), [addToast])

  const value = useMemo(() => ({ addToast, removeToast, success, error, warning, info }), [addToast, removeToast, success, error, warning, info])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

const TOAST_STYLES = {
  success: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', accent: 'text-emerald-600 hover:bg-emerald-100', Icon: CheckCircle },
  error: { bg: 'bg-red-50 border-red-200', text: 'text-red-800', accent: 'text-red-600 hover:bg-red-100', Icon: AlertCircle },
  warning: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', accent: 'text-amber-600 hover:bg-amber-100', Icon: AlertTriangle },
  info: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', accent: 'text-blue-600 hover:bg-blue-100', Icon: Info },
}

const ToastContainer = ({ toasts, onRemove }) => (
  <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm" role="region" aria-label="Notifications">
    {toasts.map(toast => {
      const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info
      const { Icon } = style
      return (
        <div
          key={toast.id}
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${style.bg} shadow-lg toast-enter`}
        >
          <Icon size={18} className={style.text} />
          <span className={`text-sm font-medium flex-1 ${style.text}`}>{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => { toast.action.onClick?.(); onRemove(toast.id) }}
              className={`px-2 py-1 text-[12px] font-semibold rounded-md transition-colors ${style.accent}`}
            >
              {toast.action.label || 'Undo'}
            </button>
          )}
          <button
            onClick={() => onRemove(toast.id)}
            aria-label="Dismiss"
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
