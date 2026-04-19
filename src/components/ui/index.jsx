import { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, X, Upload, Loader2, Search } from 'lucide-react'

// ─── BUTTON ────────────────────────────────────────────────
export const Button = ({
  variant = 'primary', size = 'md', loading = false, disabled = false,
  children, className = '', type = 'button', ...props
}) => {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus-ring select-none cursor-pointer'
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-sm shadow-indigo-600/20',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 shadow-sm',
    danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm shadow-red-600/20',
    ghost: 'text-slate-600 hover:bg-slate-100 active:bg-slate-200',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-sm shadow-emerald-600/20',
  }
  const sizes = {
    xs: 'px-2.5 py-1 text-xs',
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${base} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
      {...props}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  )
}

// ─── INPUT ─────────────────────────────────────────────────
export const Input = ({
  label, error, required, className = '', icon: Icon, ...props
}) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    {label && (
      <label className="text-[13px] font-medium text-slate-600">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
    )}
    <div className="relative">
      {Icon && <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />}
      <input
        className={`w-full ${Icon ? 'pl-9' : 'pl-3'} pr-3 py-2 text-sm bg-white border rounded-xl transition-all duration-200 placeholder:text-slate-400
          ${error ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-50' : 'border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10'}
          focus:outline-none disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed`}
        {...props}
      />
    </div>
    {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
  </div>
)

// ─── TEXTAREA ──────────────────────────────────────────────
export const Textarea = ({
  label, error, required, className = '', ...props
}) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    {label && (
      <label className="text-[13px] font-medium text-slate-600">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
    )}
    <textarea
      className={`w-full px-3 py-2 text-sm bg-white border rounded-xl transition-all duration-200 placeholder:text-slate-400 resize-none
        ${error ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-50' : 'border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10'}
        focus:outline-none disabled:bg-slate-50 disabled:text-slate-400`}
      {...props}
    />
    {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
  </div>
)

// ─── SELECT ────────────────────────────────────────────────
export const Select = ({
  label, error, required, options = [], className = '', ...props
}) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    {label && (
      <label className="text-[13px] font-medium text-slate-600">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
    )}
    <div className="relative">
      <select
        className={`w-full appearance-none px-3 py-2 pr-8 text-sm bg-white border rounded-xl transition-all duration-200
          ${error ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-50' : 'border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10'}
          focus:outline-none disabled:bg-slate-50 disabled:text-slate-400 cursor-pointer`}
        {...props}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
    {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
  </div>
)

// ─── SEARCH SELECT ─────────────────────────────────────────
export const SearchSelect = ({
  label, error, required, options = [], onSearch, onChange,
  value, placeholder = 'Search...', renderOption, className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = useMemo(() => {
    if (!searchTerm) return options
    const term = searchTerm.toLowerCase()
    return options.filter(opt => opt.label.toLowerCase().includes(term))
  }, [options, searchTerm])

  return (
    <div className={`relative ${className}`} ref={ref}>
      {label && (
        <label className="text-[13px] font-medium text-slate-600 block mb-1.5">
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      <div className={`relative px-3 py-2 bg-white border rounded-xl transition-all duration-200
        ${isOpen ? 'border-indigo-400 ring-2 ring-indigo-500/10' : error ? 'border-red-300' : 'border-slate-200'}
      `}>
        <div className="flex items-center gap-2">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); onSearch?.(e.target.value); setIsOpen(true) }}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            className="w-full outline-none text-sm bg-transparent placeholder:text-slate-400"
          />
        </div>
      </div>
      {isOpen && filtered.length > 0 && (
        <div role="listbox" className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/50 z-20 max-h-60 overflow-auto dropdown-in">
          {filtered.map(opt => (
            <div
              key={opt.value}
              role="option"
              aria-selected={value === opt.value}
              tabIndex={0}
              onClick={() => { onChange(opt); setIsOpen(false); setSearchTerm('') }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onChange(opt); setIsOpen(false); setSearchTerm('')
                }
              }}
              className="px-3 py-2.5 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none cursor-pointer text-sm transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              {renderOption ? renderOption(opt) : opt.label}
            </div>
          ))}
        </div>
      )}
      {error && <span className="text-xs text-red-500 font-medium block mt-1">{error}</span>}
    </div>
  )
}

// ─── BADGE ─────────────────────────────────────────────────
export const Badge = ({ children, variant = 'default', className = '' }) => {
  const variants = {
    default: 'bg-slate-100 text-slate-600',
    primary: 'bg-indigo-50 text-indigo-700',
    info: 'bg-blue-50 text-blue-700',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${variants[variant] || variants.default} ${className}`}>
      {children}
    </span>
  )
}

// ─── STATUS BADGE ──────────────────────────────────────────
// Includes a single-letter prefix inside a tiny square so colorblind
// users distinguish statuses without relying on the variant color alone.
// (Green and red look identical to red-green colorblind users.)
const STATUS_MAP = {
  draft:      { variant: 'default', label: 'Draft',      tag: 'D' },
  booking:    { variant: 'primary', label: 'Booking',    tag: 'B' },
  approved:   { variant: 'info',    label: 'Approved',   tag: 'A' },
  production: { variant: 'warning', label: 'Production', tag: 'P' },
  qc:         { variant: 'purple',  label: 'QC',         tag: 'Q' },
  dispatch:   { variant: 'success', label: 'Dispatch',   tag: 'D' },
  completed:  { variant: 'success', label: 'Completed',  tag: 'C' },
  cancelled:  { variant: 'danger',  label: 'Cancelled',  tag: 'X' },
  new:        { variant: 'primary', label: 'New',        tag: 'N' },
  follow_up:  { variant: 'warning', label: 'Follow Up',  tag: 'F' },
  quoted:     { variant: 'info',    label: 'Quoted',     tag: 'Q' },
  converted:  { variant: 'success', label: 'Converted',  tag: '✓' },
  lost:       { variant: 'danger',  label: 'Lost',       tag: '✗' },
}

const BADGE_TAG_BG = {
  default: 'bg-slate-200 text-slate-700',
  primary: 'bg-indigo-200 text-indigo-800',
  info:    'bg-blue-200 text-blue-800',
  success: 'bg-emerald-200 text-emerald-800',
  warning: 'bg-amber-200 text-amber-800',
  danger:  'bg-red-200 text-red-800',
  purple:  'bg-purple-200 text-purple-800',
}

export const StatusBadge = ({ status, showTag = true }) => {
  const config = STATUS_MAP[status] || { variant: 'default', label: status, tag: String(status || '?').charAt(0).toUpperCase() }
  const tagBg = BADGE_TAG_BG[config.variant] || BADGE_TAG_BG.default
  return (
    <Badge variant={config.variant}>
      {showTag && (
        <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm text-[9px] font-bold mr-1.5 ${tagBg}`} aria-hidden="true">
          {config.tag}
        </span>
      )}
      {config.label}
    </Badge>
  )
}

// ─── MODAL ─────────────────────────────────────────────────
export const Modal = ({ isOpen, open, onClose, title, children, footer, size = 'md' }) => {
  const visible = isOpen ?? open

  // ESC-to-close + body scroll lock while the modal is open.
  useEffect(() => {
    if (!visible) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [visible, onClose])

  if (!visible) return null
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        className={`relative bg-white rounded-2xl shadow-2xl shadow-slate-900/10 ${sizes[size] || sizes.md} w-full max-h-[85vh] flex flex-col scale-in`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer focus-ring"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-6 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CONFIRM DIALOG ────────────────────────────────────────
export const ConfirmDialog = ({ isOpen, onConfirm, onCancel, title, message, isDangerous }) => (
  <Modal isOpen={isOpen} onClose={onCancel} title={title} size="sm">
    <div className="space-y-4">
      <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant={isDangerous ? 'danger' : 'primary'} size="sm" onClick={onConfirm}>Confirm</Button>
      </div>
    </div>
  </Modal>
)

// ─── EMPTY STATE ───────────────────────────────────────────
export const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4">
    {Icon && (
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Icon size={24} className="text-slate-500" />
      </div>
    )}
    <h3 className="text-sm font-semibold text-slate-700 mb-1">{title}</h3>
    {description && <p className="text-[13px] text-slate-500 mb-5 text-center max-w-xs leading-relaxed">{description}</p>}
    {action}
  </div>
)

// ─── SPINNER ───────────────────────────────────────────────
// Dual-ring design: soft outer ring + indigo inner arc, slightly faster
// rotation than before. Reads as deliberate motion rather than a browser
// default.
export const Spinner = ({ size = 'md', label = 'Loading' }) => {
  const dims = {
    sm: { box: 'w-4 h-4', stroke: 2 },
    md: { box: 'w-7 h-7', stroke: 2.5 },
    lg: { box: 'w-12 h-12', stroke: 3 },
  }
  const d = dims[size] || dims.md
  return (
    <div className={`relative ${d.box}`} role="status" aria-label={label}>
      <div className={`absolute inset-0 rounded-full border-slate-200/80`} style={{ borderWidth: d.stroke, borderStyle: 'solid' }} />
      <div
        className={`absolute inset-0 rounded-full border-transparent border-t-indigo-600 border-r-indigo-500`}
        style={{ borderWidth: d.stroke, borderStyle: 'solid', animation: 'spin 0.55s cubic-bezier(0.5,0.1,0.5,0.9) infinite' }}
      />
    </div>
  )
}

// ─── PAGE LOADER ───────────────────────────────────────────
export const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen" role="status" aria-live="polite">
    <div className="text-center">
      <Spinner size="lg" />
      <p className="mt-3 text-sm text-slate-500 font-medium">Loading...</p>
    </div>
  </div>
)

// ─── PHOTO UPLOAD ──────────────────────────────────────────
export const PhotoUpload = ({ onUpload, isLoading = false }) => {
  const [drag, setDrag] = useState(false)
  const handleDrop = (e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.[0]) onUpload(e.dataTransfer.files[0]) }
  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={(e) => { e.preventDefault(); setDrag(false) }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
        ${drag ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'}`}
    >
      <input type="file" onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} accept="image/*" className="hidden" id="photo-upload" disabled={isLoading} />
      <label htmlFor="photo-upload" className="cursor-pointer block">
        {isLoading ? (
          <><Spinner size="sm" /><p className="mt-2 text-sm text-slate-500">Uploading...</p></>
        ) : (
          <>
            <Upload size={22} className="text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600 font-medium">Drop photo here or click to select</p>
            <p className="text-xs text-slate-400 mt-1">PNG, JPG up to 10MB</p>
          </>
        )}
      </label>
    </div>
  )
}

// ─── STAT CARD ─────────────────────────────────────────────
const STAT_COLORS = {
  indigo: { bg: 'bg-indigo-50/70', icon: 'bg-indigo-100 text-indigo-600', text: 'text-indigo-600', border: 'border-indigo-100/60' },
  blue: { bg: 'bg-blue-50/70', icon: 'bg-blue-100 text-blue-600', text: 'text-blue-600', border: 'border-blue-100/60' },
  amber: { bg: 'bg-amber-50/70', icon: 'bg-amber-100 text-amber-600', text: 'text-amber-600', border: 'border-amber-100/60' },
  green: { bg: 'bg-emerald-50/70', icon: 'bg-emerald-100 text-emerald-600', text: 'text-emerald-600', border: 'border-emerald-100/60' },
  red: { bg: 'bg-red-50/70', icon: 'bg-red-100 text-red-600', text: 'text-red-600', border: 'border-red-100/60' },
  purple: { bg: 'bg-purple-50/70', icon: 'bg-purple-100 text-purple-600', text: 'text-purple-600', border: 'border-purple-100/60' },
}

export const StatCard = ({ icon: Icon, label, value, trend, color = 'indigo' }) => {
  const c = STAT_COLORS[color] || STAT_COLORS.indigo
  return (
    <div className={`${c.bg} rounded-2xl p-5 transition-all duration-200 border ${c.border} hover:shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</p>
          <p className="text-2xl font-bold text-slate-900 tracking-tight truncate">{value}</p>
          {trend !== undefined && trend !== null && (
            <p className={`text-[11px] mt-2 font-semibold ${trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-red-500' : 'text-slate-400'}`}>
              {trend > 0 ? '+' : ''}{trend}% from last month
            </p>
          )}
        </div>
        {Icon && (
          <div className={`w-10 h-10 rounded-xl ${c.icon} flex items-center justify-center`}>
            <Icon size={19} strokeWidth={1.8} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── DATA TABLE ────────────────────────────────────────────
export const DataTable = ({
  columns, data, onRowClick, isLoading, loading,
  emptyMessage = 'No data available', emptyTitle,
  emptyIcon, emptyDescription, emptyAction,
  pageSize = 50,
}) => {
  const isLoadingFinal = isLoading ?? loading ?? false
  const emptyText = emptyTitle || emptyMessage
  const dataLen = data?.length || 0
  const [currentPage, setCurrentPage] = useState(0)

  // Reset to page 0 when data changes (e.g. filter/search) — ref-based to avoid cascading renders
  const prevDataLen = useRef(dataLen)
  if (prevDataLen.current !== dataLen) {
    prevDataLen.current = dataLen
    if (currentPage !== 0) setCurrentPage(0)
  }

  if (isLoadingFinal) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm shadow-slate-100" role="status" aria-live="polite">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {columns.map(col => (
                  <th key={col.key} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/70">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-50">
                  {columns.map(col => (
                    <td key={col.key} className="px-5 py-3.5">
                      <div className="h-4 bg-slate-100 rounded-md animate-pulse" style={{ width: `${55 + Math.random() * 30}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyText}
        description={emptyDescription || 'Try adjusting your search or filters'}
        action={emptyAction}
      />
    )
  }

  const totalPages = Math.ceil(data.length / pageSize)
  const needsPagination = data.length > pageSize
  const pageData = needsPagination
    ? data.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
    : data

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm shadow-slate-100">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              {columns.map(col => (
                <th key={col.key} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/70">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pageData.map((row, idx) => (
              <tr
                key={row.id || idx}
                onClick={() => onRowClick?.(row)}
                onKeyDown={onRowClick ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row) }
                } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
                className={`${onRowClick ? 'cursor-pointer hover:bg-indigo-50/40 focus:outline-none focus:bg-indigo-50/40' : 'hover:bg-slate-50/50'} transition-colors`}
              >
                {columns.map(col => (
                  <td key={col.key} className="px-5 py-3 text-sm text-slate-600">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {needsPagination && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/50">
          <span className="text-[12px] text-slate-400">
            {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, data.length)} of {data.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-[12px] font-medium text-slate-500 px-2">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PAGINATION BAR (for custom tables) ───────────────────
export const PaginationBar = ({ currentPage, totalPages, rangeLabel, onPageChange }) => (
  <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
    <span className="text-[12px] text-slate-400">{rangeLabel}</span>
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(0, currentPage - 1))}
        disabled={currentPage === 0}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-[12px] font-medium text-slate-500 px-2">{currentPage + 1} / {totalPages}</span>
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages - 1, currentPage + 1))}
        disabled={currentPage >= totalPages - 1}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  </div>
)

// ─── TABS ──────────────────────────────────────────────────
export const Tabs = ({ tabs, defaultTab = 0, onChange }) => {
  const [active, setActive] = useState(defaultTab)
  const handleChange = (idx) => { setActive(idx); onChange?.(idx) }

  return (
    <div>
      <div role="tablist" className="flex gap-0.5 bg-slate-100/80 p-1 rounded-xl w-fit">
        {tabs.map((tab, idx) => (
          <button
            key={idx}
            type="button"
            role="tab"
            aria-selected={active === idx}
            onClick={() => handleChange(idx)}
            className={`px-4 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-200 cursor-pointer focus-ring
              ${active === idx
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-4">
        {tabs[active]?.content}
      </div>
    </div>
  )
}

// ─── CURRENCY ──────────────────────────────────────────────
const currencyFormatters = new Map()
const getCurrencyFormatter = (currency) => {
  if (!currencyFormatters.has(currency)) {
    currencyFormatters.set(currency, new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }))
  }
  return currencyFormatters.get(currency)
}

const formatCompactINR = (amount) => {
  const v = Math.abs(amount || 0)
  const sign = amount < 0 ? '-' : ''
  if (v >= 1e7) return `${sign}₹${(v / 1e7).toFixed(2)} Cr`
  if (v >= 1e5) return `${sign}₹${(v / 1e5).toFixed(2)} L`
  if (v >= 1e3) return `${sign}₹${(v / 1e3).toFixed(1)} K`
  return `${sign}₹${v.toFixed(0)}`
}

export const Currency = ({ amount, currency = 'INR', compact = false }) => {
  if (compact && currency === 'INR') {
    return <span className="tabular-nums">{formatCompactINR(amount)}</span>
  }
  return <span className="tabular-nums">{getCurrencyFormatter(currency).format(amount || 0)}</span>
}
