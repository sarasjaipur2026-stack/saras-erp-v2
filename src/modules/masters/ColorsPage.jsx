import { useState, useEffect } from 'react'
import { colors } from '../../lib/db'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, Modal } from '../../components/ui'
import { Plus, Palette } from 'lucide-react'

export default function ColorsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [list, setList] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', hex_code: '#6366f1' })

  const fetchData = async () => {
    const { data, error } = await colors.list(user.id)
    if (!error) setList(data || [])
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (user?.id) fetchData() }, [user?.id])

  const handleAdd = async () => {
    if (!form.name) { toast.error('Enter a color name'); return }
    const { error } = await colors.create({ ...form, user_id: user.id })
    if (error) toast.error('Failed to add color')
    else { toast.success('Color added'); setShowModal(false); setForm({ name: '', hex_code: '#6366f1' }); fetchData() }
  }

  return (
    <div className="fade-in max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Colors</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">{list.length} colors</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus size={15} /> Add Color
        </Button>
      </div>

      {list.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {list.map(color => (
            <div key={color.id} className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden hover:shadow-md hover:shadow-slate-100 transition-all duration-200 group">
              <div className="h-24 transition-transform duration-300 group-hover:scale-[1.03]" style={{ backgroundColor: color.hex_code }} />
              <div className="p-3">
                <p className="font-medium text-[13px] text-slate-700">{color.name}</p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">{color.hex_code}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Palette size={24} className="text-slate-400" />
          </div>
          <p className="text-sm text-slate-400 mb-4">No colors added yet</p>
          <Button variant="secondary" onClick={() => setShowModal(true)}>Add First Color</Button>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Color"
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</Button><Button size="sm" onClick={handleAdd}>Add Color</Button></>}
      >
        <div className="space-y-4">
          <Input label="Color Name" placeholder="e.g., Crimson Red" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Input label="Hex Code" value={form.hex_code} onChange={e => setForm(p => ({ ...p, hex_code: e.target.value }))} />
            </div>
            <div className="w-12 h-12 rounded-xl border-2 border-slate-200 shrink-0" style={{ backgroundColor: form.hex_code }} />
          </div>
          <input type="color" value={form.hex_code} onChange={e => setForm(p => ({ ...p, hex_code: e.target.value }))} className="w-full h-10 cursor-pointer rounded-lg" />
        </div>
      </Modal>
    </div>
  )
}
