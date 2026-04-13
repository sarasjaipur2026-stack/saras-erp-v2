import { useState, useEffect, useMemo } from 'react'
import { qualityInspections, goodsReceipts, jobworkJobs } from '../../lib/db'
import { useApp } from '../../contexts/AppContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Modal, Input, Badge, PaginationBar } from '../../components/ui'
import { ShieldCheck, Plus, Search, CheckCircle2, XCircle, RotateCw, Clock } from 'lucide-react'

import { fmtDate } from '../../lib/format'

const STATUS = {
  pending: { variant: 'default', label: 'Pending', icon: Clock },
  passed: { variant: 'success', label: 'Passed', icon: CheckCircle2 },
  failed: { variant: 'danger', label: 'Failed', icon: XCircle },
  rework: { variant: 'warning', label: 'Rework', icon: RotateCw },
}

const SOURCE_LABEL = {
  grn: 'Goods Receipt',
  jobwork: 'Jobwork Return',
  production: 'Production',
  manual: 'Manual / Ad-hoc',
}

export default function QualityPage() {
  const toast = useToast()
  const { qualityParameters, ensureDeferred } = useApp()
  useEffect(() => { ensureDeferred() }, [ensureDeferred])
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Create inspection modal
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    source_type: 'manual',
    source_id: '',
    inspector: '',
    sample_size: '',
    notes: '',
  })
  const [sourceOptions, setSourceOptions] = useState([])

  // Results entry modal
  const [resultsInspection, setResultsInspection] = useState(null)
  const [resultRows, setResultRows] = useState([])

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await qualityInspections.getAll()
      if (res?.error) throw res.error
      setList(res?.data || [])
    } catch (err) {
      setLoadError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  // When the source_type changes in the create modal, fetch options for the source dropdown
  useEffect(() => {
    if (!showCreate) return
    if (createForm.source_type === 'grn') {
      goodsReceipts.getAll().then(r => setSourceOptions(r?.data || []))
    } else if (createForm.source_type === 'jobwork') {
      jobworkJobs.getAll().then(r => setSourceOptions((r?.data || []).filter(j => j.status !== 'cancelled')))
    } else {
      setSourceOptions([])
    }
  }, [showCreate, createForm.source_type])

  const filtered = useMemo(() => {
    let rows = list
    if (statusFilter !== 'all') rows = rows.filter(r => r.overall_status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        (r.qi_number || '').toLowerCase().includes(q) ||
        (r.inspector || '').toLowerCase().includes(q) ||
        (r.source_type || '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [list, statusFilter, search])

  const counts = useMemo(() => {
    const c = { all: list.length, pending: 0, passed: 0, failed: 0, rework: 0 }
    for (const r of list) {
      if (c[r.overall_status] != null) c[r.overall_status] += 1
    }
    return c
  }, [list])

  // ─── CREATE INSPECTION ────────────────────────────────────
  const openCreate = () => {
    setCreateForm({
      source_type: 'manual',
      source_id: '',
      inspector: '',
      sample_size: '',
      notes: '',
    })
    setShowCreate(true)
  }

  const submitCreate = async () => {
    const { data, error } = await qualityInspections.createInspection({
      source_type: createForm.source_type,
      source_id: createForm.source_id || null,
      inspector: createForm.inspector || null,
      sample_size: createForm.sample_size ? Number(createForm.sample_size) : null,
      notes: createForm.notes || null,
    })
    if (error) {
      toast.error(error.message || 'Failed to create inspection')
      return
    }
    toast.success(`Inspection ${data.qi_number} created — enter results`)
    setShowCreate(false)
    // Immediately open the results entry modal so the user can fill in parameter values
    openResults(data)
  }

  // ─── ENTER RESULTS ────────────────────────────────────────
  const openResults = (inspection) => {
    setResultsInspection(inspection)
    // Pre-populate with all active quality_parameters, merging any existing results
    const existing = (inspection.quality_inspection_results || []).reduce((acc, r) => {
      acc[r.parameter_id] = r
      return acc
    }, {})
    const rows = (qualityParameters || [])
      .filter(p => p.active !== false)
      .map(p => {
        const ex = existing[p.id]
        return {
          parameter_id: p.id,
          parameter_name: p.name,
          unit: p.unit,
          min_value: p.min_value,
          max_value: p.max_value,
          is_mandatory: p.is_mandatory,
          measured_value: ex?.measured_value ?? '',
          pass: ex?.pass ?? null,
          notes: ex?.notes || '',
        }
      })
    setResultRows(rows)
  }

  const updateResult = (id, patch) =>
    setResultRows(rows => rows.map(r => (r.parameter_id === id ? { ...r, ...patch } : r)))

  const autoPass = (row) => {
    if (row.measured_value === '' || row.measured_value == null) return null
    const v = Number(row.measured_value)
    if (!Number.isFinite(v)) return null
    if (row.min_value != null && v < Number(row.min_value)) return false
    if (row.max_value != null && v > Number(row.max_value)) return false
    return true
  }

  const submitResults = async (overrideStatus) => {
    if (!resultsInspection) return
    // Auto-compute pass for rows that have a measured value but no explicit pass decision
    const normalized = resultRows.map(r => ({
      ...r,
      pass: r.pass != null ? r.pass : autoPass(r),
    }))
    const { error } = await qualityInspections.submitResults({
      inspection_id: resultsInspection.id,
      results: normalized,
      overall_status: overrideStatus,
    })
    if (error) {
      toast.error(error.message || 'Failed to save results')
      return
    }
    toast.success('Results saved')
    setResultsInspection(null)
    setResultRows([])
    load()
  }

  return (
    <div className="fade-in max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck size={20} className="text-indigo-600" /> Quality Check
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {loading ? 'Loading…' : `${list.length} inspections · ${counts.passed} passed · ${counts.failed} failed`}
          </p>
        </div>
        <Button onClick={openCreate}><Plus size={15} /> New Inspection</Button>
      </div>

      {loadError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700">
          <strong>Failed to load:</strong> {loadError}
        </div>
      )}

      {/* Stat tiles double as filters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {[
          { k: 'all', label: 'Total', color: 'indigo' },
          { k: 'pending', label: 'Pending', color: 'slate' },
          { k: 'passed', label: 'Passed', color: 'emerald' },
          { k: 'failed', label: 'Failed', color: 'red' },
          { k: 'rework', label: 'Rework', color: 'amber' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setStatusFilter(t.k)}
            className={`text-left bg-white rounded-xl border p-3 transition-all ${
              statusFilter === t.k ? 'border-indigo-300 ring-2 ring-indigo-500/10' : 'border-slate-200/80 hover:border-slate-300'
            }`}
          >
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.label}</div>
            <div className="text-2xl font-mono font-bold text-slate-800 mt-0.5">{counts[t.k] || 0}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <Input
        icon={Search}
        placeholder="Search QI # / inspector / source…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="mb-4"
      />

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr>
              {['QI #', 'Date', 'Source', 'Inspector', 'Sample', 'Results', 'Status'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(qi => {
              const S = STATUS[qi.overall_status] || STATUS.pending
              const Icon = S.icon
              const results = qi.quality_inspection_results || []
              const passed = results.filter(r => r.pass === true).length
              const failed = results.filter(r => r.pass === false).length
              return (
                <tr key={qi.id} onClick={() => openResults(qi)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 cursor-pointer">
                  <td className="px-4 py-3 font-mono text-[13px] font-semibold text-indigo-700">{qi.qi_number}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{fmtDate(qi.inspected_at)}</td>
                  <td className="px-4 py-3 text-slate-700 text-[12px]">{SOURCE_LABEL[qi.source_type] || qi.source_type}</td>
                  <td className="px-4 py-3 text-slate-700 text-[12px]">{qi.inspector || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{qi.sample_size || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">
                    {results.length > 0 ? (
                      <span>
                        <span className="text-emerald-600">{passed}</span>
                        {' / '}
                        <span className="text-red-500">{failed}</span>
                        {' / '}
                        <span className="text-slate-400">{results.length}</span>
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3"><Badge variant={S.variant}><Icon size={11} /> {S.label}</Badge></td>
                </tr>
              )
            })}
            {!filtered.length && !loading && (
              <tr><td colSpan={7} className="text-center py-12 text-sm text-slate-400">No inspections match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE MODAL */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Quality Inspection"
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button size="sm" onClick={submitCreate}>Create &amp; Enter Results</Button>
        </>}
      >
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Source</label>
            <select
              value={createForm.source_type}
              onChange={e => setCreateForm(f => ({ ...f, source_type: e.target.value, source_id: '' }))}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
            >
              <option value="manual">Manual / Ad-hoc</option>
              <option value="grn">Goods Receipt (GRN)</option>
              <option value="jobwork">Jobwork Return</option>
              <option value="production">Production</option>
            </select>
          </div>

          {(createForm.source_type === 'grn' || createForm.source_type === 'jobwork') && sourceOptions.length > 0 && (
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                {createForm.source_type === 'grn' ? 'Goods Receipt' : 'Jobwork Job'}
              </label>
              <select
                value={createForm.source_id}
                onChange={e => setCreateForm(f => ({ ...f, source_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
              >
                <option value="">— select —</option>
                {sourceOptions.map(s => (
                  <option key={s.id} value={s.id}>
                    {createForm.source_type === 'grn'
                      ? `${s.grn_number} — ${s.suppliers?.firm || s.suppliers?.name || ''}`
                      : `${s.job_number} — ${s.customers?.firm_name || s.suppliers?.firm || s.suppliers?.name || ''}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input label="Inspector" value={createForm.inspector} onChange={e => setCreateForm(f => ({ ...f, inspector: e.target.value }))} />
            <Input label="Sample Size" type="number" value={createForm.sample_size} onChange={e => setCreateForm(f => ({ ...f, sample_size: e.target.value }))} />
          </div>
          <Input label="Notes" value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} />
          <p className="text-[11px] text-slate-400">A QI number will be auto-generated. After creation, you will immediately be prompted to enter per-parameter test results against all active quality parameters.</p>
        </div>
      </Modal>

      {/* RESULTS ENTRY MODAL */}
      <Modal
        isOpen={!!resultsInspection}
        onClose={() => { setResultsInspection(null); setResultRows([]) }}
        title={resultsInspection ? `Results · ${resultsInspection.qi_number}` : ''}
        size="2xl"
        footer={resultsInspection && <>
          <Button variant="secondary" size="sm" onClick={() => { setResultsInspection(null); setResultRows([]) }}>Cancel</Button>
          <Button size="sm" variant="danger" onClick={() => submitResults('failed')}><XCircle size={13} /> Fail</Button>
          <Button size="sm" variant="secondary" onClick={() => submitResults('rework')}><RotateCw size={13} /> Rework</Button>
          <Button size="sm" variant="success" onClick={() => submitResults('passed')}><CheckCircle2 size={13} /> Pass</Button>
        </>}
      >
        {resultsInspection && (
          <div className="space-y-4">
            <div className="bg-slate-50/60 rounded-xl p-3 text-[12px] flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Source</div>
                <div className="font-medium text-slate-700">{SOURCE_LABEL[resultsInspection.source_type] || resultsInspection.source_type}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Current Status</div>
                <Badge variant={STATUS[resultsInspection.overall_status]?.variant || 'default'}>
                  {STATUS[resultsInspection.overall_status]?.label || resultsInspection.overall_status}
                </Badge>
              </div>
            </div>

            {resultRows.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">
                No active quality parameters configured. Add some in Masters → Quality Parameters first.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Test Results</div>
                {resultRows.map(row => {
                  const auto = autoPass(row)
                  const currentPass = row.pass != null ? row.pass : auto
                  return (
                    <div key={row.parameter_id} className="grid grid-cols-12 gap-2 items-center bg-slate-50/60 rounded-lg p-2">
                      <div className="col-span-4">
                        <div className="font-medium text-[13px] text-slate-700">
                          {row.parameter_name}
                          {row.is_mandatory && <span className="text-red-400 ml-1">*</span>}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {row.min_value != null || row.max_value != null
                            ? `${row.min_value ?? '—'} – ${row.max_value ?? '—'} ${row.unit || ''}`
                            : (row.unit || '')}
                        </div>
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          step="0.0001"
                          value={row.measured_value}
                          onChange={e => updateResult(row.parameter_id, { measured_value: e.target.value, pass: null })}
                          placeholder="Value"
                          className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                        />
                      </div>
                      <div className="col-span-3 flex items-center gap-1">
                        <button
                          onClick={() => updateResult(row.parameter_id, { pass: true })}
                          className={`flex-1 px-2 py-1.5 text-[11px] font-semibold rounded-md transition ${
                            currentPass === true ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >Pass</button>
                        <button
                          onClick={() => updateResult(row.parameter_id, { pass: false })}
                          className={`flex-1 px-2 py-1.5 text-[11px] font-semibold rounded-md transition ${
                            currentPass === false ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >Fail</button>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="text"
                          value={row.notes || ''}
                          onChange={e => updateResult(row.parameter_id, { notes: e.target.value })}
                          placeholder="Note"
                          className="w-full px-2 py-1.5 text-[12px] bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                        />
                      </div>
                    </div>
                  )
                })}
                <p className="text-[11px] text-slate-400 pt-2">
                  Leave Pass/Fail unset to auto-compute from the measured value against the parameter's min/max range. The overall status defaults to <strong>passed</strong> if every result passes, or use the footer buttons to override.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
