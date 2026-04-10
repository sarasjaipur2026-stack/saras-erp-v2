import { useState, useEffect, useMemo } from 'react'
import { jobworkJobs } from '../../lib/db'
import { useApp } from '../../contexts/AppContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Modal, Input, Badge } from '../../components/ui'
import {
  Briefcase, Plus, Search, Package, ArrowDownLeft, ArrowUpRight, X, CheckCircle2,
} from 'lucide-react'

import { fmt, fmtMoney, fmtDate } from '../../lib/format'

const STATUS = {
  pending: { variant: 'default', label: 'Pending' },
  in_progress: { variant: 'warning', label: 'In Progress' },
  returned: { variant: 'info', label: 'Returned' },
  completed: { variant: 'success', label: 'Completed' },
  cancelled: { variant: 'danger', label: 'Cancelled' },
}

const ITEM_KIND_LABEL = {
  material_sent: 'Material Sent',
  material_received: 'Material Received',
  finished_received: 'Finished Received',
  finished_returned: 'Finished Returned',
}

const emptyLine = (defaultKind) => ({
  id: crypto.randomUUID(),
  kind: defaultKind || 'material_received',
  yarn_type_id: '',
  product_type_id: '',
  quantity: 0,
  unit: 'kg',
})

export default function JobworkPage() {
  const toast = useToast()
  const { customers, suppliers, yarnTypes, productTypes } = useApp()
  const [direction, setDirection] = useState('inward')
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [search, setSearch] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(null)

  const [detail, setDetail] = useState(null)
  const [addItemKind, setAddItemKind] = useState(null)
  const [addItemForm, setAddItemForm] = useState({ yarn_type_id: '', product_type_id: '', quantity: 0, unit: 'kg' })

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await jobworkJobs.getAll()
      if (res?.error) throw res.error
      setList(res?.data || [])
    } catch (err) {
      setLoadError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    let rows = list.filter(j => j.direction === direction)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(j =>
        (j.job_number || '').toLowerCase().includes(q) ||
        (j.customers?.firm_name || '').toLowerCase().includes(q) ||
        (j.suppliers?.firm || j.suppliers?.name || '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [list, direction, search])

  const counts = useMemo(() => ({
    total: list.length,
    inward: list.filter(j => j.direction === 'inward').length,
    outward: list.filter(j => j.direction === 'outward').length,
    open: list.filter(j => ['pending', 'in_progress'].includes(j.status)).length,
  }), [list])

  // ─── CREATE ───────────────────────────────────────────────
  const openCreate = () => {
    setForm({
      direction,
      customer_id: '',
      supplier_id: '',
      start_date: new Date().toISOString().slice(0, 10),
      due_date: '',
      rate_per_unit: 0,
      notes: '',
      items: [emptyLine(direction === 'inward' ? 'material_received' : 'material_sent')],
    })
    setShowCreate(true)
  }

  const updateLine = (id, patch) =>
    setForm(f => ({ ...f, items: f.items.map(it => (it.id === id ? { ...it, ...patch } : it)) }))
  const addLine = () =>
    setForm(f => ({
      ...f,
      items: [...f.items, emptyLine(f.direction === 'inward' ? 'material_received' : 'material_sent')],
    }))
  const removeLine = (id) =>
    setForm(f => ({
      ...f,
      items: f.items.length > 1 ? f.items.filter(it => it.id !== id) : f.items,
    }))

  const submitCreate = async () => {
    if (!form) return
    if (form.direction === 'inward' && !form.customer_id) {
      toast.error('Select a customer')
      return
    }
    if (form.direction === 'outward' && !form.supplier_id) {
      toast.error('Select a jobworker (supplier)')
      return
    }
    const { data, error } = await jobworkJobs.createWithItems({
      direction: form.direction,
      customer_id: form.customer_id || null,
      supplier_id: form.supplier_id || null,
      start_date: form.start_date,
      due_date: form.due_date || null,
      rate_per_unit: Number(form.rate_per_unit) || null,
      notes: form.notes,
      items: form.items,
    })
    if (error) {
      toast.error(error.message || 'Failed to create jobwork')
      return
    }
    toast.success(`Jobwork ${data.job_number} created`)
    setShowCreate(false)
    load()
  }

  // ─── ADD ITEM TO EXISTING JOB ─────────────────────────────
  const openAddItem = (kind) => {
    setAddItemKind(kind)
    setAddItemForm({ yarn_type_id: '', product_type_id: '', quantity: 0, unit: 'kg' })
  }

  const submitAddItem = async () => {
    if (!detail || !addItemKind) return
    const isFinishedGoods = ['finished_received', 'finished_returned'].includes(addItemKind)
    const payload = {
      job_id: detail.id,
      kind: addItemKind,
      yarn_type_id: isFinishedGoods ? null : addItemForm.yarn_type_id || null,
      product_type_id: isFinishedGoods ? addItemForm.product_type_id || null : null,
      quantity: addItemForm.quantity,
      unit: addItemForm.unit,
    }
    if (!payload.yarn_type_id && !payload.product_type_id) {
      toast.error('Select an item'); return
    }
    if (!(Number(payload.quantity) > 0)) {
      toast.error('Enter quantity'); return
    }
    const { error } = await jobworkJobs.addItem(payload)
    if (error) { toast.error(error.message || 'Failed to add item'); return }
    toast.success('Item added')
    setAddItemKind(null)
    // Refresh detail + list
    const res = await jobworkJobs.get(detail.id)
    if (res?.data) setDetail(res.data)
    load()
  }

  const markCompleted = async (job) => {
    const { error } = await jobworkJobs.markCompleted(job.id)
    if (error) { toast.error(error.message || 'Failed'); return }
    toast.success('Marked completed')
    if (detail?.id === job.id) {
      const res = await jobworkJobs.get(job.id)
      if (res?.data) setDetail(res.data)
    }
    load()
  }

  return (
    <div className="fade-in max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Briefcase size={20} className="text-indigo-600" /> Jobwork
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {loading ? 'Loading…' : `${counts.total} jobs · ${counts.inward} inward · ${counts.outward} outward · ${counts.open} open`}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={15} /> New {direction === 'inward' ? 'Inward' : 'Outward'} Job
        </Button>
      </div>

      {loadError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700">
          <strong>Failed to load:</strong> {loadError}
        </div>
      )}

      {/* Direction toggle */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {[
            { k: 'inward', label: 'Inward (Customer → Us)', icon: ArrowDownLeft },
            { k: 'outward', label: 'Outward (Us → Jobworker)', icon: ArrowUpRight },
          ].map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.k}
                onClick={() => setDirection(t.k)}
                className={`flex items-center gap-2 px-3 py-1.5 text-[12px] font-semibold rounded-md transition ${
                  direction === t.k ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                <Icon size={13} /> {t.label}
              </button>
            )
          })}
        </div>
        <div className="flex-1">
          <Input
            icon={Search}
            placeholder="Search job # / customer / jobworker…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Jobs table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr>
              {(direction === 'inward'
                ? ['Job #', 'Start', 'Customer', 'Items', 'Rate', 'Due', 'Status', '']
                : ['Job #', 'Start', 'Jobworker', 'Items', 'Rate', 'Due', 'Status', '']
              ).map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(job => {
              const S = STATUS[job.status] || STATUS.pending
              const partyName = direction === 'inward'
                ? (job.customers?.firm_name || '—')
                : (job.suppliers?.firm || job.suppliers?.name || '—')
              const itemCount = (job.jobwork_items || []).length
              return (
                <tr key={job.id} onClick={() => setDetail(job)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 cursor-pointer">
                  <td className="px-4 py-3 font-mono text-[13px] font-semibold text-indigo-700">{job.job_number}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{fmtDate(job.start_date)}</td>
                  <td className="px-4 py-3 text-slate-700">{partyName}</td>
                  <td className="px-4 py-3 font-mono text-[13px]">{itemCount}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-slate-500">{job.rate_per_unit ? `${fmtMoney(job.rate_per_unit)}/${job.rate_unit}` : '—'}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{fmtDate(job.due_date)}</td>
                  <td className="px-4 py-3"><Badge variant={S.variant}>{S.label}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    {job.status !== 'completed' && job.status !== 'cancelled' && (
                      <button
                        onClick={e => { e.stopPropagation(); markCompleted(job) }}
                        className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
                      >
                        Complete →
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {!filtered.length && !loading && (
              <tr><td colSpan={8} className="text-center py-12 text-sm text-slate-400">
                No {direction} jobwork jobs yet. Click &ldquo;New {direction === 'inward' ? 'Inward' : 'Outward'} Job&rdquo; to create one.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE MODAL */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title={form ? `New ${form.direction === 'inward' ? 'Inward' : 'Outward'} Jobwork` : 'New Jobwork'}
        size="2xl"
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button size="sm" onClick={submitCreate}>Create Job</Button>
        </>}
      >
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {form.direction === 'inward' ? (
                <div className="col-span-3">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Customer (who sends material)</label>
                  <select
                    value={form.customer_id}
                    onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                  >
                    <option value="">— select customer —</option>
                    {(customers || []).map(c => (
                      <option key={c.id} value={c.id}>{c.firm_name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="col-span-3">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Jobworker (supplier who processes)</label>
                  <select
                    value={form.supplier_id}
                    onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                  >
                    <option value="">— select jobworker —</option>
                    {(suppliers || []).map(s => (
                      <option key={s.id} value={s.id}>{s.firm || s.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <Input label="Start Date" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              <Input label="Due Date" type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              <Input label="Rate ₹/kg" type="number" value={form.rate_per_unit} onChange={e => setForm(f => ({ ...f, rate_per_unit: parseFloat(e.target.value) || 0 }))} />
            </div>

            {/* Initial items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  {form.direction === 'inward' ? 'Material Received from Customer' : 'Material Sent to Jobworker'}
                </label>
                <button onClick={addLine} className="text-[11px] text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1">
                  <Plus size={12} /> Add Line
                </button>
              </div>
              <div className="space-y-2">
                {form.items.map(it => (
                  <div key={it.id} className="grid grid-cols-12 gap-2 items-center bg-slate-50/60 rounded-lg p-2">
                    <div className="col-span-6">
                      <select
                        value={it.yarn_type_id}
                        onChange={e => updateLine(it.id, { yarn_type_id: e.target.value, product_type_id: '' })}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                      >
                        <option value="">— yarn —</option>
                        {(yarnTypes || []).map(y => (
                          <option key={y.id} value={y.id}>
                            {y.name}{y.count_or_denier ? ` · ${y.count_or_denier}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        step="0.001"
                        value={it.quantity}
                        onChange={e => updateLine(it.id, { quantity: parseFloat(e.target.value) || 0 })}
                        placeholder="Qty"
                        className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="text"
                        value={it.unit}
                        onChange={e => updateLine(it.id, { unit: e.target.value })}
                        className="w-full px-2 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => removeLine(it.id)}
                      className="col-span-1 p-2 text-slate-400 hover:text-red-600 justify-self-end"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <Input label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            <p className="text-[11px] text-slate-400">
              {form.direction === 'inward'
                ? 'Inward: customer supplies yarn, we process it, then return finished goods. Track material in, work done, and finished goods out.'
                : 'Outward: we send our yarn to a jobworker, they process it, and we receive finished goods back. Track material out and finished goods in.'}
            </p>
          </div>
        )}
      </Modal>

      {/* DETAIL MODAL */}
      <Modal
        isOpen={!!detail}
        onClose={() => { setDetail(null); setAddItemKind(null) }}
        title={detail ? `${detail.job_number} · ${STATUS[detail.status]?.label}` : ''}
        size="lg"
      >
        {detail && (
          <div className="space-y-4 text-[13px]">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">{detail.direction === 'inward' ? 'Customer' : 'Jobworker'}</div>
                <div className="font-medium text-slate-700">
                  {detail.direction === 'inward'
                    ? (detail.customers?.firm_name || '—')
                    : (detail.suppliers?.firm || detail.suppliers?.name || '—')}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Direction</div>
                <Badge variant={detail.direction === 'inward' ? 'info' : 'primary'}>
                  {detail.direction === 'inward' ? 'Inward' : 'Outward'}
                </Badge>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Start / Due</div>
                <div className="font-mono text-[12px]">{fmtDate(detail.start_date)} → {fmtDate(detail.due_date)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Rate</div>
                <div className="font-mono text-[12px]">{detail.rate_per_unit ? `${fmtMoney(detail.rate_per_unit)}/${detail.rate_unit}` : '—'}</div>
              </div>
            </div>

            {/* Timeline of items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Movements</div>
                <div className="flex gap-1">
                  {detail.direction === 'inward' ? (
                    <>
                      <button
                        onClick={() => openAddItem('material_received')}
                        className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 rounded font-semibold text-slate-600"
                      >+ Material In</button>
                      <button
                        onClick={() => openAddItem('finished_returned')}
                        className="px-2 py-1 text-[11px] bg-indigo-50 hover:bg-indigo-100 rounded font-semibold text-indigo-600"
                      >+ FG Returned</button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => openAddItem('material_sent')}
                        className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 rounded font-semibold text-slate-600"
                      >+ Material Out</button>
                      <button
                        onClick={() => openAddItem('finished_received')}
                        className="px-2 py-1 text-[11px] bg-indigo-50 hover:bg-indigo-100 rounded font-semibold text-indigo-600"
                      >+ FG Received</button>
                    </>
                  )}
                </div>
              </div>
              <div className="bg-slate-50/60 rounded-xl divide-y divide-slate-100">
                {(detail.jobwork_items || []).length === 0 ? (
                  <p className="p-3 text-[12px] text-slate-400 text-center">No movements yet.</p>
                ) : (
                  (detail.jobwork_items || []).map(it => (
                    <div key={it.id} className="px-3 py-2 flex items-center justify-between text-[12px]">
                      <div className="flex-1">
                        <div className="font-medium text-slate-700 flex items-center gap-2">
                          <Package size={12} className="text-slate-400" />
                          {it.yarn_types?.name || it.product_types?.name || 'Unknown item'}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {ITEM_KIND_LABEL[it.kind]} · {fmtDate(it.event_date)}
                        </div>
                      </div>
                      <div className="font-mono text-slate-700 font-semibold">
                        {fmt(it.quantity)} {it.unit}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add item inline form */}
            {addItemKind && (
              <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-3 space-y-3">
                <div className="text-[11px] font-bold text-indigo-600 uppercase">Record {ITEM_KIND_LABEL[addItemKind]}</div>
                <div className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6">
                    {['finished_received', 'finished_returned'].includes(addItemKind) ? (
                      <select
                        value={addItemForm.product_type_id}
                        onChange={e => setAddItemForm(f => ({ ...f, product_type_id: e.target.value }))}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                      >
                        <option value="">— finished product —</option>
                        {(productTypes || []).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={addItemForm.yarn_type_id}
                        onChange={e => setAddItemForm(f => ({ ...f, yarn_type_id: e.target.value }))}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                      >
                        <option value="">— yarn —</option>
                        {(yarnTypes || []).map(y => (
                          <option key={y.id} value={y.id}>{y.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      step="0.001"
                      value={addItemForm.quantity}
                      onChange={e => setAddItemForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                      placeholder="Qty"
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={addItemForm.unit}
                      onChange={e => setAddItemForm(f => ({ ...f, unit: e.target.value }))}
                      className="w-full px-2 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                    />
                  </div>
                  <button onClick={() => setAddItemKind(null)} className="col-span-1 p-2 text-slate-400 hover:text-slate-600 justify-self-end">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setAddItemKind(null)}>Cancel</Button>
                  <Button size="sm" onClick={submitAddItem}>Record</Button>
                </div>
              </div>
            )}

            {detail.notes && (
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Notes</div>
                <p className="text-[12px] text-slate-600 whitespace-pre-line">{detail.notes}</p>
              </div>
            )}

            {detail.status !== 'completed' && detail.status !== 'cancelled' && (
              <div className="flex justify-end pt-2 border-t border-slate-100">
                <Button size="sm" variant="success" onClick={() => markCompleted(detail)}>
                  <CheckCircle2 size={13} /> Mark Completed
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
