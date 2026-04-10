import { createContext, useContext, useState, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

const ToastContext = createContext()

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, message, type }])
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

  const value = { addToast, removeToast, success, error, warning, info }

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

export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
