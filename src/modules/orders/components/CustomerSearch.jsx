import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { customers } from '../../../lib/db'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { Input, Modal, Button } from '../../../components/ui'
import { Plus, Search, X, Building2, Phone, MapPin, Clock } from 'lucide-react'

// localStorage key for most-recently-used customer IDs. Persists across sessions
// so "Jaipur Cordage ji" shows as first chip when they call again.
const RECENT_KEY = 'saras.recentCustomers'
const RECENT_MAX = 5

const loadRecent = () => {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const pushRecent = (customerId) => {
  if (!customerId) return
  try {
    const cur = loadRecent().filter((id) => id !== customerId)
    cur.unshift(customerId)
    localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, RECENT_MAX)))
  } catch { /* quota/privacy — safe to ignore */ }
}

// GSTIN first 2 digits = state code (e.g. "08" = Rajasthan). Used so when
// CSR types a GSTIN into search the right customer still matches.
const normalize = (s) => (s || '').toString().toLowerCase()

export const CustomerSearch = ({ value, onChange, onSelect }) => {
  const { user } = useAuth()
  const toast = useToast()
  const [allCustomers, setAllCustomers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [recentIds, setRecentIds] = useState(loadRecent())
  const [activeIdx, setActiveIdx] = useState(0)
  const emptyForm = { firm_name: '', contact_name: '', phone: '', email: '', city: '', address: '', gstin: '', pan: '' }
  const [newForm, setNewForm] = useState(emptyForm)
  const ref = useRef(null)

  const fetchCustomers = useCallback(async () => {
    if (!user?.id) return
    const { data } = await customers.list(user.id)
    if (data) {
      setAllCustomers(data)
      const valueId = typeof value === 'object' ? value?.id : value
      if (valueId) setSelected(data.find(c => c.id === valueId) || null)
    }
  }, [user, value])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Multi-attribute fuzzy — contact_name, firm_name, phone, whatsapp, city,
  // gstin, pan, email. Catches "call the Mumbai guy" + "the 9825... number".
  const filtered = useMemo(() => {
    if (!searchTerm) return allCustomers
    const term = normalize(searchTerm)
    return allCustomers.filter((c) =>
      normalize(c.contact_name).includes(term) ||
      normalize(c.firm_name).includes(term) ||
      normalize(c.phone).includes(term) ||
      normalize(c.whatsapp).includes(term) ||
      normalize(c.city).includes(term) ||
      normalize(c.gstin).includes(term) ||
      normalize(c.pan).includes(term) ||
      normalize(c.email).includes(term),
    )
  }, [allCustomers, searchTerm])

  // Resolve recent chip IDs against the loaded customer list
  const recentChips = useMemo(
    () => recentIds
      .map((id) => allCustomers.find((c) => c.id === id))
      .filter(Boolean),
    [recentIds, allCustomers],
  )

  // Prev-prop sync pattern — reset highlight row when search/open changes
  // without useEffect (avoids react-hooks/set-state-in-effect).
  const resetKey = `${searchTerm}|${isOpen}`
  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey)
    if (activeIdx !== 0) setActiveIdx(0)
  }

  const handleSelect = (customer) => {
    setSelected(customer)
    pushRecent(customer.id)
    setRecentIds(loadRecent())
    if (onSelect) onSelect(customer)
    else if (onChange) onChange(customer.id)
    setIsOpen(false)
    setSearchTerm('')
  }

  const handleKeyDown = (e) => {
    if (!isOpen) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[activeIdx]) handleSelect(filtered[activeIdx])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setSearchTerm('')
    }
  }

  const handleAddNew = async () => {
    if (!newForm.firm_name || !newForm.contact_name) { toast.error('Name and firm required'); return }
    const { data, error } = await customers.create({ ...newForm, user_id: user.id })
    if (error) { toast.error('Failed to add customer'); return }
    toast.success('Customer added')
    setShowNewModal(false)
    setNewForm(emptyForm)
    await fetchCustomers()
    if (data) handleSelect(data)
  }

  return (
    <>
      <div className="space-y-3">
        {/* Search input */}
        <div className="relative" ref={ref}>
          <div className={`flex items-center gap-2 px-3 py-2.5 bg-white border rounded-xl transition-all ${isOpen ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
            <Search size={16} className="text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setIsOpen(true) }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search name, firm, phone, city, GSTIN..."
              className="w-full outline-none text-sm bg-transparent placeholder:text-slate-400"
            />
            {searchTerm && (
              <button onClick={() => { setSearchTerm(''); setIsOpen(false) }} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>

          {isOpen && (
            <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-72 overflow-auto scale-in">
              {filtered.length > 0 ? filtered.map((c, idx) => (
                <div
                  key={c.id}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => handleSelect(c)}
                  className={`px-3 py-2.5 cursor-pointer transition-colors ${idx === activeIdx ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                >
                  <p className="text-sm font-medium text-slate-800">
                    {c.contact_name}
                    {c.firm_name ? <span className="text-slate-400 font-normal"> · {c.firm_name}</span> : null}
                  </p>
                  <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    {c.phone && <><Phone size={10} />{c.phone}</>}
                    {c.city && <><MapPin size={10} />{c.city}</>}
                    {c.gstin && <span className="font-mono text-slate-400">{c.gstin}</span>}
                  </p>
                </div>
              )) : (
                <div className="px-3 py-6 text-sm text-slate-400 text-center space-y-2">
                  <p>No customers match "{searchTerm}"</p>
                  <button
                    onClick={() => { setShowNewModal(true); setIsOpen(false) }}
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    <Plus size={12} /> Add as new customer
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent customer chips — only when nothing selected */}
        {!selected && recentChips.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Clock size={12} className="text-slate-400 shrink-0" />
            <span className="text-xs text-slate-400 font-medium">Recent:</span>
            {recentChips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelect(c)}
                className="px-2.5 py-1 text-xs rounded-md bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-600 transition-colors"
              >
                {c.contact_name || c.firm_name}
              </button>
            ))}
          </div>
        )}

        {/* Selected customer card */}
        {selected && (
          <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-sm text-indigo-900">{selected.contact_name}</p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-indigo-700">
                    <Building2 size={12} /> {selected.firm_name}
                  </div>
                  {selected.phone && <div className="flex items-center gap-2 text-xs text-indigo-700"><Phone size={12} /> {selected.phone}</div>}
                  {selected.city && <div className="flex items-center gap-2 text-xs text-indigo-700"><MapPin size={12} /> {selected.city}</div>}
                  {selected.gstin && <div className="flex items-center gap-2 text-xs text-indigo-700 font-mono">{selected.gstin}</div>}
                </div>
              </div>
              <button
                onClick={() => { setSelected(null); if (onSelect) onSelect(null); else if (onChange) onChange(null) }}
                className="p-1 rounded hover:bg-indigo-100 text-indigo-400"
                aria-label="Clear customer"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <Button variant="ghost" size="sm" onClick={() => setShowNewModal(true)}>
          <Plus size={14} /> Add New Customer
        </Button>
      </div>

      <Modal isOpen={showNewModal} onClose={() => setShowNewModal(false)} title="Add Customer" size="lg"
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowNewModal(false)}>Cancel</Button><Button size="sm" onClick={handleAddNew}>Add</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Firm Name *" value={newForm.firm_name} onChange={e => setNewForm(p => ({ ...p, firm_name: e.target.value }))} />
          <Input label="Contact Person *" value={newForm.contact_name} onChange={e => setNewForm(p => ({ ...p, contact_name: e.target.value }))} />
          <Input label="Phone" value={newForm.phone} onChange={e => setNewForm(p => ({ ...p, phone: e.target.value }))} />
          <Input label="Email" type="email" value={newForm.email} onChange={e => setNewForm(p => ({ ...p, email: e.target.value }))} />
          <Input label="City" value={newForm.city} onChange={e => setNewForm(p => ({ ...p, city: e.target.value }))} />
          <Input
            label="GSTIN"
            value={newForm.gstin}
            onChange={e => setNewForm(p => ({ ...p, gstin: e.target.value.toUpperCase() }))}
            maxLength={15}
          />
        </div>
      </Modal>
    </>
  )
}
