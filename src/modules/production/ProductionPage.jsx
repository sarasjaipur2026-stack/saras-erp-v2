import { useState, useEffect, useMemo } from 'react'
import { productionPlans, orders as ordersApi } from '../../lib/db'
import { useApp } from '../../contexts/AppContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Modal, Badge, Input } from '../../components/ui'
import {
  Factory, Plus, Play, CheckCircle2, Pause, RotateCw, Search, TrendingUp
} from 'lucide-react'

const STATUS = {
  planned:     { label: 'Planned',     variant: 'default',  icon: Pause },
  in_progress: { label: 'In Progress', variant: 'warning',  icon: Play },
  on_hold:     { label: 'On Hold',     variant: 'warning',  icon: Pause },
  completed:   { label: 'Completed',   variant: 'success',  icon: CheckCircle2 },
  cancelled:   { label: 'Cancelled',   variant: 'danger',   icon: Pause },
}

import { fmt, fmtDateShort as fmtDate } from '../../lib/format'

export default function ProductionPage() {
  const toast = useToast()
  const { machines, operators } = useApp()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [availableOrders, setAvailableOrders] = useState([])
  const [pickedOrder, setPickedOrder] = useState('')
  const [detailJob, setDetailJob] = useState(null)

  const [loadError, setLoadError] = useState(null)

  const loadData = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await productionPlans.getAll()
      if (result?.error) throw result.error
      setList(result?.data || [])
    } catch (err) {
      setLoadError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { loadData() }, [])

  const openCreate = async () => {
    const { data } = await ordersApi.getAll()
    setAvailableOrders((data || []).filter(o => ['approved', 'booking'].includes(o.status)))
    setPickedOrder('')
    setShowCreate(true)
  }

  const createFromOrder = async () => {
    if (!pickedOrder) { toast.error('Select an order'); return }
    const { error } = await productionPlans.createFromOrder(pickedOrder)
    if (error) { toast.error(error.message || 'Failed to create production job'); return }
    toast.success('Production job created — order moved to production')
    setShowCreate(false)
    loadData()
  }

  const updateStatus = async (job, newStatus) => {
    const patch = { status: newStatus }
    if (newStatus === 'in_progress' && !job.actual_start) patch.actual_start = new Date().toISOString()
    if (newStatus === 'completed') patch.actual_end = new Date().toISOString()
    const { error } = await productionPlans.update(job.id, patch)
    if (error) { toast.error('Update failed'); return }
    toast.success(`Status: ${STATUS[newStatus]?.label || newStatus}`)
    loadData()
    if (detailJob?.id === job.id) setDetailJob({ ...detailJob, ...patch })
  }

  const filtered = useMemo(() => {
    let rows = list
    if (filter !== 'all') rows = rows.filter(r => r.status === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        (r.orders?.order_number || '').toLowerCase().includes(q) ||
        (r.orders?.customers?.firm_name || '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [list, filter, search])

  const counts = useMemo(() => {
    const c = { all: list.length, planned: 0, in_progress: 0, completed: 0, on_hold: 0 }
    list.forEach(r => { c[r.status] = (c[r.status] || 0) + 1 })
    return c
  }, [list])

  return (
    <div className="fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Factory size={20} className="text-indigo-600" />
            Production
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {loading ? 'Loading…' : `${list.length} production jobs`}
          </p>
        </div>
        <Button onClick={openCreate}><Plus size={15} /> New Production Job</Button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {[
          { k: 'all', label: 'Total', color: 'slate' },
          { k: 'planned', label: 'Planned', color: 'slate' },
          { k: 'in_progress', label: 'In Progress', color: 'amber' },
          { k: 'on_hold', label: 'On Hold', color: 'amber' },
          { k: 'completed', label: 'Completed', color: 'emerald' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setFilter(t.k)}
            className={`text-left bg-white rounded-xl border p-3 transition-all ${filter === t.k ? 'border-indigo-300 ring-2 ring-indigo-500/10' : 'border-slate-200/80 hover:border-slate-300'}`}
          >
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.label}</div>
            <div className="text-2xl font-mono font-bold text-slate-800 mt-0.5">{counts[t.k] || 0}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <Input icon={Search} placeholder="Search by order number or customer..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Jobs table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr>
              {['Order', 'Customer', 'Machine', 'Qty', 'Planned', 'Status', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(job => {
              const S = STATUS[job.status] || STATUS.planned
              const Icon = S.icon
              const pct = job.planned_qty > 0 ? Math.min(100, Math.round((job.completed_qty || 0) / job.planned_qty * 100)) : 0
              return (
                <tr key={job.id} onClick={() => setDetailJob(job)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 cursor-pointer">
                  <td className="px-4 py-3 font-mono text-[13px] font-semibold text-indigo-700">{job.orders?.order_number || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{job.orders?.customers?.firm_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 text-[13px]">{job.machines?.name || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[13px]">
                    <div>{fmt(job.completed_qty || 0)} / {fmt(job.planned_qty)}</div>
                    <div className="w-24 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{fmtDate(job.planned_start)} → {fmtDate(job.planned_end)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={S.variant}><Icon size={11} /> {S.label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {job.status === 'planned' && (
                      <button onClick={e => { e.stopPropagation(); updateStatus(job, 'in_progress') }} className="text-indigo-600 hover:text-indigo-700 text-[12px] font-semibold">Start →</button>
                    )}
                    {job.status === 'in_progress' && (
                      <button onClick={e => { e.stopPropagation(); updateStatus(job, 'completed') }} className="text-emerald-600 hover:text-emerald-700 text-[12px] font-semibold">Complete →</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {!filtered.length && !loading && (
              <tr><td colSpan={7} className="text-center py-12 text-sm text-slate-400">No production jobs match the filter. Click “New Production Job” to create one from an approved order.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Production Job from Order"
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button size="sm" onClick={createFromOrder} disabled={!pickedOrder}>Create</Button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-[12px] text-slate-500">Only orders with status <strong>approved</strong> or <strong>booking</strong> are listed. Creating a job will move the order to <strong>production</strong> status.</p>
          {availableOrders.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No eligible orders. Approve an order first from the Orders page.</p>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto space-y-2">
              {availableOrders.map(o => (
                <label key={o.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${pickedOrder === o.id ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input
                    type="radio"
                    name="order"
                    checked={pickedOrder === o.id}
                    onChange={() => setPickedOrder(o.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-mono text-[13px] font-semibold text-indigo-700">{o.order_number || 'Draft'}</div>
                    <div className="text-[12px] text-slate-600">{o.customers?.firm_name || '—'}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {o.order_line_items?.length || 0} line items · Status: {o.status}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={!!detailJob}
        onClose={() => setDetailJob(null)}
        title={detailJob ? `Job — ${detailJob.orders?.order_number || 'Draft'}` : ''}
        size="lg"
        footer={detailJob && <>
          <Button variant="secondary" size="sm" onClick={() => setDetailJob(null)}>Close</Button>
          {detailJob.status === 'planned' && <Button size="sm" onClick={() => updateStatus(detailJob, 'in_progress')}><Play size={13} /> Start</Button>}
          {detailJob.status === 'in_progress' && <>
            <Button variant="secondary" size="sm" onClick={() => updateStatus(detailJob, 'on_hold')}>Hold</Button>
            <Button size="sm" variant="success" onClick={() => updateStatus(detailJob, 'completed')}><CheckCircle2 size={13} /> Complete</Button>
          </>}
          {detailJob.status === 'on_hold' && <Button size="sm" onClick={() => updateStatus(detailJob, 'in_progress')}><RotateCw size={13} /> Resume</Button>}
        </>}
      >
        {detailJob && <ProductionDetailBody job={detailJob} onPatch={async (p) => {
          const { error } = await productionPlans.update(detailJob.id, p)
          if (error) return toast.error('Save failed')
          toast.success('Saved')
          setDetailJob({ ...detailJob, ...p })
          loadData()
        }} />}
      </Modal>
    </div>
  )
}

function ProductionDetailBody({ job, onPatch }) {
  const [completed, setCompleted] = useState(job.completed_qty || 0)
  const [notes, setNotes] = useState(job.notes || '')
  const pct = job.planned_qty > 0 ? Math.min(100, (completed / job.planned_qty) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase">Customer</div>
          <div className="font-medium text-slate-700">{job.orders?.customers?.firm_name || '—'}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase">Machine</div>
          <div className="font-medium text-slate-700">{job.machines?.name || '—'}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase">Material</div>
          <div className="font-medium text-slate-700">{job.materials?.name || '—'}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase">Planned</div>
          <div className="font-mono font-semibold text-slate-700">{fmt(job.planned_qty)}</div>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Progress</label>
          <div className="text-[12px] font-mono text-slate-600">{Math.round(pct)}%</div>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex gap-2 mt-3">
          <Input
            type="number"
            value={completed}
            onChange={e => setCompleted(parseFloat(e.target.value) || 0)}
            className="flex-1"
            placeholder="Completed qty"
          />
          <Button size="sm" onClick={() => onPatch({ completed_qty: completed })}>
            <TrendingUp size={13} /> Update
          </Button>
        </div>
      </div>

      {/* Timestamps */}
      <div className="grid grid-cols-2 gap-3 bg-slate-50/60 rounded-xl p-3 text-[12px]">
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase">Actual Start</div>
          <div className="font-mono text-slate-600">{job.actual_start ? new Date(job.actual_start).toLocaleString('en-IN') : '—'}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase">Actual End</div>
          <div className="font-mono text-slate-600">{job.actual_end ? new Date(job.actual_end).toLocaleString('en-IN') : '—'}</div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => notes !== (job.notes || '') && onPatch({ notes })}
          rows={3}
          placeholder="Shop-floor observations, delays, quality issues…"
          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none resize-none"
        />
      </div>
    </div>
  )
}
