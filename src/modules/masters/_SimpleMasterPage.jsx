import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, Modal, PaginationBar } from '../../components/ui'
import { usePagination } from '../../hooks/usePagination'
import { Plus, Pencil, Trash2 } from 'lucide-react'

/**
 * Generic master CRUD page. Drives list view + add/edit modal from a field schema.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.subtitle
 * @param {object} props.api - db table instance with getAll/create/update/delete
 * @param {Array<{key,label,type?,placeholder?,required?,options?,colSpan?,showInList?,render?}>} props.fields
 * @param {object} [props.defaults]
 * @param {function} [props.onChanged] - called after successful mutation
 */
export default function SimpleMasterPage({ title, subtitle, api, fields, defaults = {}, onChanged }) {
  const { user } = useAuth()
  const toast = useToast()
  const [list, setList] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(defaults)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { pageData, currentPage, totalPages, needsPagination, rangeLabel, setCurrentPage } = usePagination(list)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await api.getAll()
      if (result?.error) throw result.error
      setList(result?.data || [])
    } catch (err) {
      setLoadError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [api])
  useEffect(() => { loadData() }, [loadData])

  const openAdd = () => { setEditing(null); setForm(defaults); setShowModal(true) }
  const openEdit = (row) => { setEditing(row); setForm({ ...defaults, ...row }); setShowModal(true) }

  const handleSave = async () => {
    for (const f of fields) {
      if (f.required && !form[f.key] && form[f.key] !== 0) {
        toast.error(`${f.label} is required`); return
      }
    }
    const payload = {}
    for (const f of fields) {
      let v = form[f.key]
      if (f.type === 'number' && v !== '' && v != null) v = Number(v)
      if (f.type === 'checkbox') v = !!v
      payload[f.key] = v === '' ? null : v
    }
    const { error } = editing
      ? await api.update(editing.id, payload)
      : await api.create({ ...payload, user_id: user.id })
    if (error) { toast.error(error.message || 'Save failed'); return }
    toast.success(editing ? 'Updated' : 'Created')
    setShowModal(false)
    setForm(defaults)
    setEditing(null)
    loadData()
    onChanged?.()
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const { error } = await api.delete(deleteTarget.id)
    if (error) { toast.error(error.message || 'Delete failed'); setDeleteTarget(null); return }
    toast.success('Deleted')
    setDeleteTarget(null)
    loadData()
    onChanged?.()
  }

  const listFields = fields.filter(f => f.showInList !== false).slice(0, 5)

  return (
    <div className="fade-in max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {loading ? 'Loading…' : `${list.length} ${subtitle || 'items'}`}
          </p>
        </div>
        <Button onClick={openAdd}><Plus size={15} /> Add {title.replace(/s$/, '')}</Button>
      </div>

      {loadError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700">
          <strong>Failed to load:</strong> {loadError}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr>
              {listFields.map(f => (
                <th key={f.key} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{f.label}</th>
              ))}
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody>
            {pageData.map(row => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                {listFields.map(f => (
                  <td key={f.key} className="px-4 py-3 text-slate-700">
                    {f.render ? f.render(row) : (row[f.key] ?? '—')}
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => openEdit(row)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Pencil size={14} /></button>
                    <button onClick={() => setDeleteTarget(row)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!list.length && !loading && (
              <tr><td colSpan={listFields.length + 1} className="text-center py-12 text-sm text-slate-400">No records yet. Click “Add” to create the first one.</td></tr>
            )}
          </tbody>
        </table>
        {needsPagination && <PaginationBar currentPage={currentPage} totalPages={totalPages} rangeLabel={rangeLabel} onPageChange={setCurrentPage} />}
      </div>

      {/* Delete confirmation */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Confirm Delete"
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={confirmDelete}>Delete</Button>
        </>}
      >
        <p className="text-sm text-slate-600">
          Are you sure you want to delete <strong>"{deleteTarget?.name || deleteTarget?.code || deleteTarget?.id}"</strong>? This action cannot be undone.
        </p>
      </Modal>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? `Edit ${title.replace(/s$/, '')}` : `Add ${title.replace(/s$/, '')}`}
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>{editing ? 'Update' : 'Create'}</Button>
        </>}
      >
        <div className="grid grid-cols-2 gap-4">
          {fields.map(f => {
            const span = f.colSpan || 1
            const val = form[f.key] ?? ''
            const set = (v) => setForm(p => ({ ...p, [f.key]: v }))
            if (f.type === 'select') {
              return (
                <div key={f.key} className={span === 2 ? 'col-span-2' : ''}>
                  <label className="text-[13px] font-medium text-slate-600 block mb-1.5">
                    {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  <select
                    value={val || ''}
                    onChange={e => set(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                  >
                    <option value="">— select —</option>
                    {(f.options || []).map(o => (
                      <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
                    ))}
                  </select>
                </div>
              )
            }
            if (f.type === 'checkbox') {
              return (
                <label key={f.key} className={`flex items-center gap-2 ${span === 2 ? 'col-span-2' : ''}`}>
                  <input type="checkbox" checked={!!val} onChange={e => set(e.target.checked)} className="w-4 h-4 rounded border-slate-300" />
                  <span className="text-[13px] text-slate-600">{f.label}</span>
                </label>
              )
            }
            if (f.type === 'textarea') {
              return (
                <div key={f.key} className="col-span-2">
                  <label className="text-[13px] font-medium text-slate-600 block mb-1.5">{f.label}</label>
                  <textarea
                    value={val || ''}
                    onChange={e => set(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none resize-none"
                  />
                </div>
              )
            }
            return (
              <div key={f.key} className={span === 2 ? 'col-span-2' : ''}>
                <Input
                  label={f.label}
                  required={f.required}
                  type={f.type || 'text'}
                  placeholder={f.placeholder}
                  value={val ?? ''}
                  onChange={e => set(e.target.value)}
                />
              </div>
            )
          })}
        </div>
      </Modal>
    </div>
  )
}
