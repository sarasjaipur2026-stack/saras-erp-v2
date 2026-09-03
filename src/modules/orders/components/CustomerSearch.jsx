import { useState, useEffect, useRef } from 'react'
import { customers } from '../../../lib/db'
import { search } from '../../../lib/db/search'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { Input, Modal, Button } from '../../../components/ui'
import { Plus, Search, X, Building2, Phone, MapPin } from 'lucide-react'

export const CustomerSearch = ({ value, onChange, onSelect }) => {
  const { user } = useAuth()
  const userId = user?.id
  const toast = useToast()
  const [results, setResults] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selected, setSelected] = useState(() => (typeof value === 'object' ? value : null))
  const [showNewModal, setShowNewModal] = useState(false)
  const emptyForm = { firm_name: '', contact_name: '', phone: '', email: '', city: '', address: '', gstin: '', pan: '' }
  const [newForm, setNewForm] = useState(emptyForm)
  const ref = useRef(null)

  const valueId = typeof value === 'object' ? value?.id : value

  // Existing orders already include the selected customer relation, so render
  // it immediately instead of waiting for the entire customer table to load.
  // ID-only callers (for example Jobwork) fetch just that one row.
  useEffect(() => {
    let cancelled = false
    if (!valueId) {
      setSelected(null)
      return () => { cancelled = true }
    }
    if (typeof value === 'object') {
      setSelected(value)
      return () => { cancelled = true }
    }
    customers.get(valueId).then(({ data }) => {
      if (!cancelled) setSelected(data || null)
    })
    return () => { cancelled = true }
  }, [value, valueId])

  // Search on the server so performance stays bounded as customer data grows.
  useEffect(() => {
    let cancelled = false
    const term = searchTerm.trim()
    if (!isOpen || term.length < 2) {
      setResults([])
      setIsSearching(false)
      return () => { cancelled = true }
    }
    setIsSearching(true)
    const timer = setTimeout(async () => {
      const { data, error } = await search.entities(term, { types: ['customer'], maxPer: 20 })
      if (!cancelled) {
        setResults(error ? [] : (data || []))
        setIsSearching(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isOpen, searchTerm])

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (customer) => {
    setSelected(customer)
    if (onSelect) onSelect(customer)
    else if (onChange) onChange(customer.id)
    setIsOpen(false)
    setSearchTerm('')
  }

  const handleResultSelect = async (result) => {
    const { data, error } = await customers.get(result.entity_id)
    if (error || !data) {
      toast.error('Failed to load customer')
      return
    }
    handleSelect(data)
  }

  const handleClear = () => {
    setSelected(null)
    if (onChange) onChange(null)
    else if (onSelect) onSelect(null)
  }

  const handleAddNew = async () => {
    if (!newForm.firm_name || !newForm.contact_name) { toast.error('Name and firm required'); return }
    const { data, error } = await customers.create({ ...newForm, user_id: userId })
    if (error) { toast.error('Failed to add customer'); return }
    toast.success('Customer added')
    setShowNewModal(false)
    setNewForm(emptyForm)
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
              placeholder="Search by name or firm..."
              className="w-full outline-none text-sm bg-transparent placeholder:text-slate-400"
            />
            {searchTerm && (
              <button onClick={() => { setSearchTerm(''); setIsOpen(false) }} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>

          {isOpen && (
            <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-60 overflow-auto scale-in">
              {isSearching ? (
                <div className="px-3 py-4 text-sm text-slate-400 text-center">Searching…</div>
              ) : searchTerm.trim().length < 2 ? (
                <div className="px-3 py-4 text-sm text-slate-400 text-center">Type at least 2 characters</div>
              ) : results.length > 0 ? results.map(result => (
                <div
                  key={result.entity_id}
                  onClick={() => handleResultSelect(result)}
                  className="px-3 py-2.5 hover:bg-indigo-50 cursor-pointer transition-colors"
                >
                  <p className="text-sm font-medium text-slate-800">{result.primary_label}</p>
                  <p className="text-xs text-slate-500">{result.secondary || 'Customer'}</p>
                </div>
              )) : (
                <div className="px-3 py-4 text-sm text-slate-400 text-center">No customers found</div>
              )}
            </div>
          )}
        </div>

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
                </div>
              </div>
              <button onClick={handleClear} className="p-1 rounded hover:bg-indigo-100 text-indigo-400">
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
          <Input label="GSTIN" value={newForm.gstin} onChange={e => setNewForm(p => ({ ...p, gstin: e.target.value }))} />
        </div>
      </Modal>
    </>
  )
}
