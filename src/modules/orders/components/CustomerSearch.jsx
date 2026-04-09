import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { customers } from '../../../lib/db'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { Input, Modal, Button } from '../../../components/ui'
import { Plus, Search, X, Building2, Phone, MapPin } from 'lucide-react'

export const CustomerSearch = ({ value, onChange, onSelect }) => {
  const { user } = useAuth()
  const toast = useToast()
  const [allCustomers, setAllCustomers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const emptyForm = { firm_name: '', contact_name: '', phone: '', email: '', city: '', address: '', gstin: '', pan: '' }
  const [newForm, setNewForm] = useState(emptyForm)
  const ref = useRef(null)

  useEffect(() => { if (user?.id) fetchCustomers() }, [user?.id])

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchCustomers = async () => {
    const { data } = await customers.list(user.id)
    if (data) {
      setAllCustomers(data)
      // value can be a customer_id (string) or a customer object
      const valueId = typeof value === 'object' ? value?.id : value
      if (valueId) setSelected(data.find(c => c.id === valueId) || null)
    }
  }

  const filtered = useMemo(() => {
    if (!searchTerm) return allCustomers
    const term = searchTerm.toLowerCase()
    return allCustomers.filter(c =>
      (c.contact_name || '').toLowerCase().includes(term) ||
      (c.firm_name || '').toLowerCase().includes(term)
    )
  }, [allCustomers, searchTerm])

  const handleSelect = (customer) => {
    setSelected(customer)
    if (onSelect) onSelect(customer)
    else if (onChange) onChange(customer.id)
    setIsOpen(false)
    setSearchTerm('')
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
              {filtered.length > 0 ? filtered.map(c => (
                <div
                  key={c.id}
                  onClick={() => handleSelect(c)}
                  className="px-3 py-2.5 hover:bg-indigo-50 cursor-pointer transition-colors"
                >
                  <p className="text-sm font-medium text-slate-800">{c.contact_name}</p>
                  <p className="text-xs text-slate-500">{c.firm_name} {c.city ? `• ${c.city}` : ''}</p>
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
              <button onClick={() => { setSelected(null); onChange(null) }} className="p-1 rounded hover:bg-indigo-100 text-indigo-400">
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
