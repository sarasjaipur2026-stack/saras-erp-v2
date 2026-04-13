import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { calculatorProfiles, orders as ordersApi } from '../../lib/db'
import { Button, Input, Modal, Badge } from '../../components/ui'
import {
  Save, RotateCcw, Plus, X, Link2, Camera, TrendingUp, TrendingDown,
  Package, Settings, Activity, IndianRupee, Factory, FileText
} from 'lucide-react'

// ─── HELPERS ─────────────────────────────────────────────────
const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}
import { fmtMoney, fmtInt } from '../../lib/format'
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

const emptyYarn = () => ({ id: crypto.randomUUID(), yarn_type_id: '', rate_per_kg: 0, carriers: 0, weight_pct: 0 })
const emptyProcessRow = (processType = null) => ({
  id: crypto.randomUUID(),
  process_type_id: processType?.id || '',
  process_name: processType?.name || '',
  operator_id: '',
  machine_type_id: processType?.default_machine_type_id || '',
  duration_mins_per_kg: processType?.default_duration_per_kg_mins || 0,
})

const defaultState = () => ({
  // ⓪ Order link
  order_id: '',
  booking_photo_url: '',
  actual_sell_per_kg: 0,

  // ① Sample
  sample: { length_m: 0, total_wt_g: 0, cov_wt_g: 0, fil_wt_g: 0, width_mm: 0 },

  // ② Customer order
  order_meters: 0,
  order_kgs: 0,
  waste_pct: 5,

  // ③ Product & material
  machine_type_id: '',
  product_type_id: '',
  chaal_type_id: '',
  blend_mode: 'weight', // 'weight' or 'carriers'
  covering_yarns: [emptyYarn()],
  filler_yarns: [],

  // ④ Process
  processes: [],

  // ⑤ Pricing
  labor_per_kg: 0,
  overhead_per_kg: 0,
  profit_pct: 15,

  // ⑥ Production plan
  speed_m_per_min: 0,
  machines_count: 1,
  efficiency_pct: 80,
  bobbin_weight_g: 0,
  carriers: 0,

  // Meta
  profile_name: '',
})

// ─── CALCULATION ─────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
function calculate(state, masters) {
  const { sample, waste_pct, order_meters, order_kgs, covering_yarns, filler_yarns,
    labor_per_kg, overhead_per_kg, profit_pct, speed_m_per_min, machines_count,
    efficiency_pct, actual_sell_per_kg } = state

  // Sample derived values
  const grams_per_meter = sample.length_m > 0 ? sample.total_wt_g / sample.length_m : 0
  const meters_per_kg = grams_per_meter > 0 ? 1000 / grams_per_meter : 0
  const gsm = sample.length_m > 0 && sample.width_mm > 0
    ? (sample.total_wt_g * 1000) / (sample.length_m * sample.width_mm)
    : 0

  const cov_fraction = sample.total_wt_g > 0 ? (sample.cov_wt_g || 0) / sample.total_wt_g : 1
  const fil_fraction = sample.total_wt_g > 0 ? (sample.fil_wt_g || 0) / sample.total_wt_g : 0

  // Order qty — bidirectional derivation
  const effective_meters = order_meters > 0 ? order_meters : (order_kgs * meters_per_kg)
  const effective_kgs = order_kgs > 0 ? order_kgs : (order_meters / Math.max(meters_per_kg, 1e-9))

  // Waste-adjusted totals
  const waste_mult = 1 + waste_pct / 100
  const total_kg_with_waste = effective_kgs * waste_mult
  const covering_kg_base = effective_kgs * cov_fraction
  const filler_kg_base = effective_kgs * fil_fraction
  const covering_kg_with_waste = covering_kg_base * waste_mult
  const filler_kg_with_waste = filler_kg_base * waste_mult

  // Yarn blending — weighted average rates
  const blendRate = (yarns, mode) => {
    if (!yarns?.length) return 0
    if (mode === 'carriers') {
      const total_carriers = yarns.reduce((s, y) => s + num(y.carriers), 0)
      if (total_carriers <= 0) return 0
      return yarns.reduce((s, y) => s + num(y.rate_per_kg) * (num(y.carriers) / total_carriers), 0)
    }
    const total_pct = yarns.reduce((s, y) => s + num(y.weight_pct), 0)
    if (total_pct <= 0) {
      // fallback: simple average
      return yarns.reduce((s, y) => s + num(y.rate_per_kg), 0) / yarns.length
    }
    return yarns.reduce((s, y) => s + num(y.rate_per_kg) * (num(y.weight_pct) / total_pct), 0)
  }

  const covering_rate_per_kg = blendRate(covering_yarns, state.blend_mode)
  const filler_rate_per_kg = blendRate(filler_yarns, state.blend_mode)

  // Cost per 1 kg of finished goods
  const covering_cost_per_kg_fg = covering_rate_per_kg * cov_fraction * waste_mult
  const filler_cost_per_kg_fg = filler_rate_per_kg * fil_fraction * waste_mult
  const material_cost_per_kg = covering_cost_per_kg_fg + filler_cost_per_kg_fg
  const process_cost_per_kg = num(labor_per_kg) + num(overhead_per_kg)
  const total_cost_per_kg = material_cost_per_kg + process_cost_per_kg
  const calculated_sell_per_kg = total_cost_per_kg * (1 + num(profit_pct) / 100)
  const calculated_margin_per_kg = calculated_sell_per_kg - total_cost_per_kg

  // Actual margin vs calc
  const actual_margin_per_kg = actual_sell_per_kg > 0
    ? actual_sell_per_kg - total_cost_per_kg
    : 0
  const actual_margin_pct = actual_sell_per_kg > 0
    ? (actual_margin_per_kg / actual_sell_per_kg) * 100
    : 0
  const calculated_margin_pct = calculated_sell_per_kg > 0
    ? (calculated_margin_per_kg / calculated_sell_per_kg) * 100
    : 0

  // Production estimate
  const effective_speed = num(speed_m_per_min) * (num(efficiency_pct) / 100) * num(machines_count)
  const meters_per_hour = effective_speed * 60
  const meters_per_8hr_shift = meters_per_hour * 8
  const days_to_complete = meters_per_8hr_shift > 0 && effective_meters > 0
    ? effective_meters / meters_per_8hr_shift
    : 0

  // Totals
  const total_material_cost = material_cost_per_kg * effective_kgs
  const total_order_cost = total_cost_per_kg * effective_kgs
  const total_order_sell = calculated_sell_per_kg * effective_kgs
  const total_actual_sell = actual_sell_per_kg * effective_kgs

  return {
    grams_per_meter, meters_per_kg, gsm,
    cov_fraction, fil_fraction,
    effective_meters, effective_kgs,
    covering_kg_base, filler_kg_base,
    covering_kg_with_waste, filler_kg_with_waste,
    total_kg_with_waste,
    covering_rate_per_kg, filler_rate_per_kg,
    material_cost_per_kg, process_cost_per_kg,
    total_cost_per_kg, calculated_sell_per_kg, calculated_margin_per_kg, calculated_margin_pct,
    actual_margin_per_kg, actual_margin_pct,
    meters_per_hour, meters_per_8hr_shift, days_to_complete,
    total_material_cost, total_order_cost, total_order_sell, total_actual_sell,
  }
}

// ─── SECTION HEADER ──────────────────────────────────────────
const SectionHeader = ({ icon: Icon, num: n, title, children }) => (
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-bold flex items-center justify-center">{n}</span>
      {Icon && <Icon size={14} className="text-slate-400" />}
      <h3 className="text-[13px] font-semibold text-slate-700 uppercase tracking-wide">{title}</h3>
    </div>
    {children}
  </div>
)

// ─── COMPACT INPUT ───────────────────────────────────────────
const NumInput = ({ label, value, onChange, suffix, step = '0.01', className = '' }) => (
  <div className={`flex flex-col gap-1 ${className}`}>
    {label && <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</label>}
    <div className="relative">
      <input
        type="number"
        step={step}
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? 0 : parseFloat(e.target.value))}
        className="w-full px-3 py-2 pr-8 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-medium pointer-events-none">{suffix}</span>}
    </div>
  </div>
)

const SelectInput = ({ label, value, onChange, options, placeholder = '— select —', className = '' }) => {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = useMemo(() => {
    if (!search) return options.slice(0, 50)
    const term = search.toLowerCase()
    return options.filter(o => o.label.toLowerCase().includes(term)).slice(0, 50)
  }, [options, search])

  const selected = value ? options.find(o => o.value === value) : null

  return (
    <div className={`flex flex-col gap-1 ${className}`} ref={ref}>
      {label && <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{label}</label>}
      <div className="relative">
        <input
          type="text"
          value={open ? search : (selected?.label || '')}
          onChange={e => { setSearch(e.target.value); if (!open) setOpen(true) }}
          onFocus={() => { setOpen(true); setSearch('') }}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
        />
        {value && !open && (
          <button onClick={() => { onChange(''); setSearch('') }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500">
            <X size={12} />
          </button>
        )}
        {open && (
          <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-30 max-h-48 overflow-auto">
            <div
              className="px-3 py-1.5 text-sm text-slate-400 cursor-pointer hover:bg-slate-50"
              onClick={() => { onChange(''); setOpen(false); setSearch('') }}
            >{placeholder}</div>
            {filtered.map(o => (
              <div
                key={o.value}
                className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-indigo-50 ${o.value === value ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'}`}
                onClick={() => { onChange(o.value); setOpen(false); setSearch('') }}
              >{o.label}</div>
            ))}
            {!filtered.length && <div className="px-3 py-2 text-sm text-slate-400 italic">No matches</div>}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── OUTPUT ROW ──────────────────────────────────────────────
const OutRow = ({ label, value, sub, big, accent }) => (
  <div className="flex items-baseline justify-between py-1.5">
    <span className={`${big ? 'text-[13px]' : 'text-[12px]'} text-slate-500`}>{label}</span>
    <div className="text-right">
      <div className={`font-mono font-semibold ${big ? 'text-xl' : 'text-sm'} ${accent || 'text-slate-800'}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 font-mono">{sub}</div>}
    </div>
  </div>
)

// ─── MAIN COMPONENT ──────────────────────────────────────────
export default function CalculatorPage() {
  const { user } = useAuth()
  const toast = useToast()
  const masters = useApp()
  const {
    machineTypes, productTypes, yarnTypes, chaalTypes, processTypes, operators,
    ensureDeferred,
  } = masters
  useEffect(() => { ensureDeferred() }, [ensureDeferred])

  const [state, setState] = useState(defaultState)
  const [orderList, setOrderList] = useState([])
  const [profileList, setProfileList] = useState([])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showProfilesModal, setShowProfilesModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load orders + profiles
  useEffect(() => {
    let cancelled = false
    ordersApi.list().then(r => { if (!cancelled) setOrderList((r?.data || []).filter(o => ['booking', 'approved', 'draft'].includes(o.status))) })
    calculatorProfiles.getAll().then(r => { if (!cancelled) setProfileList(r?.data || []) })
    return () => { cancelled = true }
  }, [])

  // Seed default process steps (4 core: Cone Winding, Bobbin Winding, Braiding, Tipping)
  // We pick one representative per sequence_order to avoid seeding hundreds of rows
  useEffect(() => {
    if (!processTypes?.length) return
    setState(s => {
      if (s.processes.length) return s // already seeded — no-op
      const seen = new Set()
      const defaults = processTypes
        .filter(p => p && !p.is_optional)
        .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))
        .filter(p => {
          const seq = p.sequence_order ?? p.name
          if (seen.has(seq)) return false
          seen.add(seq)
          return true
        })
        .slice(0, 4) // max 4 default steps
      return { ...s, processes: defaults.map(p => emptyProcessRow(p)) }
    })
  }, [processTypes])

  // Auto-fill carriers when machine selected
  useEffect(() => {
    if (state.machine_type_id) {
      const mt = (machineTypes || []).find(m => m.id === state.machine_type_id)
      if (mt?.default_carriers && !state.carriers) {
        setState(s => ({ ...s, carriers: mt.default_carriers, speed_m_per_min: s.speed_m_per_min || mt.default_speed_m_per_min || 0 }))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-run on machine change
  }, [state.machine_type_id])

  const derived = useMemo(() => calculate(state, masters), [state, masters])

  // ─── HANDLERS ──────────────────────────────────────────────
  const patch = useCallback((partial) => setState(s => ({ ...s, ...partial })), [])
  const patchSample = useCallback((k, v) => setState(s => {
    const cur = s.sample[k]
    const next = num(v)
    if (cur === next) return s // no change — skip re-render
    return { ...s, sample: { ...s.sample, [k]: next } }
  }), [])

  // Auto-fill missing sample weight from the other two (handy UX)
  useEffect(() => {
    const { total_wt_g, cov_wt_g, fil_wt_g } = state.sample
    if (total_wt_g > 0 && cov_wt_g > 0 && !fil_wt_g) {
      patchSample('fil_wt_g', Math.max(0, total_wt_g - cov_wt_g))
    } else if (total_wt_g > 0 && fil_wt_g > 0 && !cov_wt_g) {
      patchSample('cov_wt_g', Math.max(0, total_wt_g - fil_wt_g))
    } else if (cov_wt_g > 0 && fil_wt_g > 0 && !total_wt_g) {
      patchSample('total_wt_g', cov_wt_g + fil_wt_g)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- patchSample is stable (useCallback with [])
  }, [state.sample.total_wt_g, state.sample.cov_wt_g, state.sample.fil_wt_g])

  const addYarn = (kind) => setState(s => ({
    ...s,
    [kind]: [...s[kind], emptyYarn()]
  }))
  const removeYarn = (kind, id) => setState(s => ({
    ...s,
    [kind]: s[kind].filter(y => y.id !== id)
  }))
  const updateYarn = (kind, id, patch) => setState(s => ({
    ...s,
    [kind]: s[kind].map(y => y.id === id ? { ...y, ...patch } : y)
  }))

  const addProcess = () => setState(s => ({ ...s, processes: [...s.processes, emptyProcessRow()] }))
  const removeProcess = (id) => setState(s => ({ ...s, processes: s.processes.filter(p => p.id !== id) }))
  const updateProcess = (id, patch) => setState(s => ({
    ...s,
    processes: s.processes.map(p => p.id === id ? { ...p, ...patch } : p)
  }))

  const reset = () => {
    if (!confirm('Clear all inputs and start fresh?')) return
    setState(defaultState())
    toast.success('Calculator reset')
  }

  const saveProfile = async () => {
    if (!state.profile_name.trim()) { toast.error('Enter a profile name'); return }
    setSaving(true)
    const product = productTypes?.find(p => p.id === state.product_type_id)
    const payload = {
      user_id: user?.id,
      profile_name: state.profile_name.trim(),
      product_id: null, // legacy column — v2 uses payload
      machine_id: null,
      chaal: state.chaal_type_id,
      sample_length_m: state.sample.length_m,
      sample_weight_kg: state.sample.total_wt_g / 1000,
      grams_per_meter: derived.grams_per_meter,
      waste_percentage: state.waste_pct,
      labor_cost_per_kg: state.labor_per_kg,
      overhead_cost_percentage: state.overhead_per_kg,
      profit_margin_percentage: state.profit_pct,
      total_cost_per_unit: derived.total_cost_per_kg,
      order_id: state.order_id || null,
      actual_sell_per_kg: state.actual_sell_per_kg || null,
      calculated_sell_per_kg: derived.calculated_sell_per_kg,
      calculated_cost_per_kg: derived.total_cost_per_kg,
      payload: { ...state, product_name: product?.name },
    }
    const { data, error } = await calculatorProfiles.create(payload)
    setSaving(false)
    if (error) { toast.error(error.message || 'Save failed'); return }
    toast.success(`Saved "${state.profile_name}"`)
    setShowSaveModal(false)
    setProfileList(l => [data, ...l])
  }

  const loadProfile = (p) => {
    if (p.payload && Object.keys(p.payload).length) {
      setState({ ...defaultState(), ...p.payload })
    } else {
      // legacy v1 profile
      setState(s => ({
        ...s,
        sample: { ...s.sample, length_m: num(p.sample_length_m), total_wt_g: num(p.sample_weight_kg) * 1000 },
        waste_pct: num(p.waste_percentage),
        labor_per_kg: num(p.labor_cost_per_kg),
        overhead_per_kg: num(p.overhead_cost_percentage),
        profit_pct: num(p.profit_margin_percentage),
      }))
    }
    setShowProfilesModal(false)
    toast.success(`Loaded "${p.profile_name}"`)
  }

  // ─── OPTIONS ──────────────────────────────────────────────
  const machineOptions = (machineTypes || []).map(m => ({ value: m.id, label: `${m.name}${m.custom_number ? ` (${m.custom_number})` : ''}` }))
  const productOptions = (productTypes || []).map(p => ({ value: p.id, label: p.name }))
  const chaalOptions = (chaalTypes || []).map(c => ({ value: c.id, label: c.hindi_name ? `${c.name} (${c.hindi_name})` : c.name }))
  const yarnOptions = (yarnTypes || []).map(y => ({ value: y.id, label: `${y.name}${y.count_or_denier ? ` · ${y.count_or_denier}` : ''}` }))
  const operatorOptions = (operators || []).map(o => ({ value: o.id, label: o.name }))
  const orderOptions = orderList.map(o => ({ value: o.id, label: `${o.order_number || 'Draft'} — ${o.customers?.firm_name || ''}` }))

  const selectedProduct = (productTypes || []).find(p => p.id === state.product_type_id)
  const requiresFiller = selectedProduct?.requires_filler ?? false

  // ─── SELL PRICE COMPARISON ─────────────────────────────────
  const sellDiff = state.actual_sell_per_kg > 0
    ? state.actual_sell_per_kg - derived.calculated_sell_per_kg
    : 0

  return (
    <div className="fade-in h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Factory size={20} className="text-indigo-600" />
            Production Calculator
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">Plan cost, material, and production for any order</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowProfilesModal(true)}>
            <FileText size={14} /> Profiles ({profileList.length})
          </Button>
          <Button variant="secondary" size="sm" onClick={reset}>
            <RotateCcw size={14} /> Reset
          </Button>
          <Button size="sm" onClick={() => setShowSaveModal(true)}>
            <Save size={14} /> Save
          </Button>
        </div>
      </div>

      {/* Two-card layout */}
      <div className="grid lg:grid-cols-2 gap-4 flex-1 min-h-0">
        {/* ═══ LEFT CARD — INPUT ═══════════════════════════════════ */}
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2 shrink-0">
            <Package size={14} className="text-indigo-600" />
            <h2 className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">Inputs</h2>
          </div>
          <div className="overflow-y-auto flex-1 p-5 space-y-6">

            {/* ⓪ ORDER LINK */}
            <div>
              <SectionHeader icon={Link2} num="0" title="Order Link" />
              <SelectInput
                label="Linked Order"
                value={state.order_id}
                onChange={v => patch({ order_id: v })}
                options={orderOptions}
                placeholder="— standalone (no order) —"
              />
              <div className="grid grid-cols-2 gap-3 mt-3">
                <NumInput
                  label="Actual Sell ₹/kg"
                  value={state.actual_sell_per_kg}
                  onChange={v => patch({ actual_sell_per_kg: v })}
                  suffix="₹/kg"
                />
                {state.actual_sell_per_kg > 0 && derived.calculated_sell_per_kg > 0 && (
                  <div className="flex items-end">
                    <Badge variant={sellDiff >= 0 ? 'success' : 'danger'}>
                      {sellDiff >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {' '}{sellDiff >= 0 ? '+' : ''}{fmt(sellDiff)} vs calc
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* ① SAMPLE */}
            <div>
              <SectionHeader num="1" title="Sample Naap-Tol" />
              <div className="grid grid-cols-2 gap-3">
                <NumInput label="Length" value={state.sample.length_m} onChange={v => patchSample('length_m', v)} suffix="m" />
                <NumInput label="Total Wt" value={state.sample.total_wt_g} onChange={v => patchSample('total_wt_g', v)} suffix="g" />
                <NumInput label="Covering Wt" value={state.sample.cov_wt_g} onChange={v => patchSample('cov_wt_g', v)} suffix="g" />
                <NumInput label="Filler Wt" value={state.sample.fil_wt_g} onChange={v => patchSample('fil_wt_g', v)} suffix="g" />
                <NumInput label="Width" value={state.sample.width_mm} onChange={v => patchSample('width_mm', v)} suffix="mm" />
                <div className="flex items-end">
                  <div className="text-[11px] text-slate-400 font-mono bg-slate-50 px-3 py-2 rounded-lg w-full text-center">
                    GSM: <span className="text-slate-700 font-semibold">{fmt(derived.gsm, 1)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ② CUSTOMER ORDER */}
            <div>
              <SectionHeader num="2" title="Customer Order" />
              <div className="grid grid-cols-3 gap-3">
                <NumInput label="Meters" value={state.order_meters} onChange={v => patch({ order_meters: v, order_kgs: 0 })} suffix="m" />
                <NumInput label="Kgs" value={state.order_kgs} onChange={v => patch({ order_kgs: v, order_meters: 0 })} suffix="kg" />
                <NumInput label="Waste" value={state.waste_pct} onChange={v => patch({ waste_pct: v })} suffix="%" />
              </div>
            </div>

            {/* ③ PRODUCT & MATERIAL */}
            <div>
              <SectionHeader icon={Package} num="3" title="Product & Material" />
              <div className="grid grid-cols-2 gap-3">
                <SelectInput label="Machine" value={state.machine_type_id} onChange={v => patch({ machine_type_id: v })} options={machineOptions} />
                <SelectInput label="Product" value={state.product_type_id} onChange={v => patch({ product_type_id: v })} options={productOptions} />
                <SelectInput label="Chaal" value={state.chaal_type_id} onChange={v => patch({ chaal_type_id: v })} options={chaalOptions} className="col-span-2" />
              </div>

              {/* Blend mode toggle */}
              <div className="flex items-center gap-2 mt-4 mb-2">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Blend by:</span>
                <div className="flex bg-slate-100 rounded-lg p-0.5">
                  {['weight', 'carriers'].map(m => (
                    <button
                      key={m}
                      onClick={() => patch({ blend_mode: m })}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${state.blend_mode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                    >
                      {m === 'weight' ? 'Weight %' : 'Carriers'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Covering yarns */}
              <div className="mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Covering Yarns</span>
                  <button onClick={() => addYarn('covering_yarns')} className="text-[11px] text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1">
                    <Plus size={12} /> Add
                  </button>
                </div>
                <div className="space-y-2">
                  {state.covering_yarns.map(y => (
                    <YarnRow key={y.id} yarn={y} options={yarnOptions} mode={state.blend_mode}
                      onChange={patch => updateYarn('covering_yarns', y.id, patch)}
                      onRemove={state.covering_yarns.length > 1 ? () => removeYarn('covering_yarns', y.id) : null}
                      yarnTypesData={yarnTypes}
                    />
                  ))}
                </div>
              </div>

              {/* Filler yarns (conditional) */}
              {(requiresFiller || state.filler_yarns.length > 0) && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Filler Yarns</span>
                    <button onClick={() => addYarn('filler_yarns')} className="text-[11px] text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1">
                      <Plus size={12} /> Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {state.filler_yarns.map(y => (
                      <YarnRow key={y.id} yarn={y} options={yarnOptions} mode={state.blend_mode}
                        onChange={patch => updateYarn('filler_yarns', y.id, patch)}
                        onRemove={() => removeYarn('filler_yarns', y.id)}
                        yarnTypesData={yarnTypes}
                      />
                    ))}
                    {!state.filler_yarns.length && (
                      <p className="text-[11px] text-slate-400 italic">No filler yarns added</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ④ PROCESS & OPERATORS */}
            <div>
              <SectionHeader icon={Activity} num="4" title="Process & Operators">
                <button onClick={addProcess} className="text-[11px] text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1">
                  <Plus size={12} /> Add Step
                </button>
              </SectionHeader>
              <div className="space-y-2">
                {state.processes.map(p => (
                  <div key={p.id} className="grid grid-cols-12 gap-2 items-end bg-slate-50/60 rounded-lg p-2">
                    <SelectInput
                      className="col-span-4"
                      value={p.process_type_id}
                      onChange={v => {
                        const pt = processTypes?.find(x => x.id === v)
                        updateProcess(p.id, {
                          process_type_id: v,
                          process_name: pt?.name || '',
                          duration_mins_per_kg: pt?.default_duration_per_kg_mins || p.duration_mins_per_kg,
                        })
                      }}
                      options={(processTypes || []).map(x => ({ value: x.id, label: x.name }))}
                    />
                    <SelectInput
                      className="col-span-4"
                      value={p.operator_id}
                      onChange={v => updateProcess(p.id, { operator_id: v })}
                      options={operatorOptions}
                      placeholder="operator"
                    />
                    <NumInput
                      className="col-span-3"
                      value={p.duration_mins_per_kg}
                      onChange={v => updateProcess(p.id, { duration_mins_per_kg: v })}
                      suffix="min/kg"
                    />
                    <button onClick={() => removeProcess(p.id)} className="col-span-1 p-2 text-slate-400 hover:text-red-600">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {!state.processes.length && <p className="text-[11px] text-slate-400 italic">No process steps yet</p>}
              </div>
            </div>

            {/* ⑤ PRICING */}
            <div>
              <SectionHeader icon={IndianRupee} num="5" title="Pricing" />
              <div className="grid grid-cols-3 gap-3">
                <NumInput label="Labor" value={state.labor_per_kg} onChange={v => patch({ labor_per_kg: v })} suffix="₹/kg" />
                <NumInput label="Overhead" value={state.overhead_per_kg} onChange={v => patch({ overhead_per_kg: v })} suffix="₹/kg" />
                <NumInput label="Profit" value={state.profit_pct} onChange={v => patch({ profit_pct: v })} suffix="%" />
              </div>
            </div>

            {/* ⑥ PRODUCTION PLAN */}
            <div>
              <SectionHeader icon={Settings} num="6" title="Production Plan" />
              <div className="grid grid-cols-3 gap-3">
                <NumInput label="Speed" value={state.speed_m_per_min} onChange={v => patch({ speed_m_per_min: v })} suffix="m/min" />
                <NumInput label="Machines" value={state.machines_count} onChange={v => patch({ machines_count: v })} step="1" />
                <NumInput label="Efficiency" value={state.efficiency_pct} onChange={v => patch({ efficiency_pct: v })} suffix="%" />
                <NumInput label="Bobbin Wt" value={state.bobbin_weight_g} onChange={v => patch({ bobbin_weight_g: v })} suffix="g" />
                <NumInput label="Carriers" value={state.carriers} onChange={v => patch({ carriers: v })} step="1" />
              </div>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT CARD — OUTPUT ═══════════════════════════════ */}
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2 shrink-0">
            <TrendingUp size={14} className="text-emerald-600" />
            <h2 className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">Output</h2>
          </div>
          <div className="overflow-y-auto flex-1 p-5 space-y-5">

            {/* Profit comparison */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100">
              <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-3">Profit Comparison</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase mb-1">Calc Cost</div>
                  <div className="text-sm font-mono font-bold text-slate-700">{fmtMoney(derived.total_cost_per_kg)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase mb-1">Calc Sell</div>
                  <div className="text-sm font-mono font-bold text-indigo-700">{fmtMoney(derived.calculated_sell_per_kg)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase mb-1">Actual Sell</div>
                  <div className="text-sm font-mono font-bold text-emerald-700">{state.actual_sell_per_kg > 0 ? fmtMoney(state.actual_sell_per_kg) : '—'}</div>
                </div>
              </div>
              {state.actual_sell_per_kg > 0 && (
                <div className="pt-3 border-t border-indigo-100/70 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase mb-0.5">Calc Margin</div>
                    <div className="text-sm font-mono font-semibold text-slate-700">
                      {fmtMoney(derived.calculated_margin_per_kg)} <span className="text-[10px] text-slate-400">({fmt(derived.calculated_margin_pct, 1)}%)</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase mb-0.5">Actual Margin</div>
                    <div className={`text-sm font-mono font-semibold ${derived.actual_margin_per_kg >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {fmtMoney(derived.actual_margin_per_kg)} <span className="text-[10px] opacity-70">({fmt(derived.actual_margin_pct, 1)}%)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Cost Breakdown */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Cost Breakdown (per kg)</div>
              <div className="bg-slate-50/60 rounded-lg px-4 py-2">
                <OutRow label="Covering yarn @" value={fmtMoney(derived.covering_rate_per_kg)} sub={`${fmt(derived.cov_fraction * 100, 1)}% of FG`} />
                <OutRow label="Filler yarn @" value={fmtMoney(derived.filler_rate_per_kg)} sub={`${fmt(derived.fil_fraction * 100, 1)}% of FG`} />
                <div className="border-t border-slate-200/70 my-1" />
                <OutRow label="Material cost" value={fmtMoney(derived.material_cost_per_kg)} />
                <OutRow label="Labor + Overhead" value={fmtMoney(derived.process_cost_per_kg)} />
                <div className="border-t border-slate-200/70 my-1" />
                <OutRow label="Total cost" value={fmtMoney(derived.total_cost_per_kg)} big accent="text-slate-900" />
                <OutRow label={`Sell (+${state.profit_pct}% profit)`} value={fmtMoney(derived.calculated_sell_per_kg)} big accent="text-indigo-700" />
              </div>
            </div>

            {/* Material Requirement */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Material Requirement</div>
              <div className="bg-slate-50/60 rounded-lg px-4 py-2">
                <OutRow label="Order (effective)" value={`${fmtInt(derived.effective_meters)} m / ${fmt(derived.effective_kgs, 2)} kg`} />
                <OutRow label="Covering (with waste)" value={`${fmt(derived.covering_kg_with_waste, 2)} kg`} sub={`base ${fmt(derived.covering_kg_base, 2)} kg`} />
                <OutRow label="Filler (with waste)" value={`${fmt(derived.filler_kg_with_waste, 2)} kg`} sub={`base ${fmt(derived.filler_kg_base, 2)} kg`} />
                <OutRow label="Total yarn needed" value={`${fmt(derived.total_kg_with_waste, 2)} kg`} accent="text-indigo-700" />
              </div>
            </div>

            {/* Conversions */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Conversions</div>
              <div className="bg-slate-50/60 rounded-lg px-4 py-2">
                <OutRow label="1 m weighs" value={`${fmt(derived.grams_per_meter, 2)} g`} />
                <OutRow label="1 kg =" value={`${fmtInt(derived.meters_per_kg)} m`} />
                <OutRow label="GSM" value={fmt(derived.gsm, 1)} />
              </div>
            </div>

            {/* Production Estimate */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Production Estimate</div>
              <div className="bg-slate-50/60 rounded-lg px-4 py-2">
                <OutRow label="Per hour" value={`${fmtInt(derived.meters_per_hour)} m`} />
                <OutRow label="Per 8-hr shift" value={`${fmtInt(derived.meters_per_8hr_shift)} m`} />
                <OutRow label="Days to complete" value={fmt(derived.days_to_complete, 1)} big accent="text-amber-700" />
              </div>
            </div>

            {/* Order totals */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Order Totals</div>
              <div className="bg-slate-50/60 rounded-lg px-4 py-2">
                <OutRow label="Total cost" value={fmtMoney(derived.total_order_cost)} />
                <OutRow label="Total sell (calc)" value={fmtMoney(derived.total_order_sell)} />
                {state.actual_sell_per_kg > 0 && (
                  <OutRow label="Total sell (actual)" value={fmtMoney(derived.total_actual_sell)} big accent="text-emerald-700" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Modal */}
      <Modal isOpen={showSaveModal} onClose={() => setShowSaveModal(false)} title="Save Calculator Profile"
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setShowSaveModal(false)}>Cancel</Button>
          <Button size="sm" onClick={saveProfile} loading={saving}>Save</Button>
        </>}
      >
        <div className="space-y-3">
          <Input
            label="Profile Name"
            required
            placeholder="e.g., Sharma 5mm Round Cord"
            value={state.profile_name}
            onChange={e => patch({ profile_name: e.target.value })}
          />
          <p className="text-[12px] text-slate-400">Saves all inputs so you can reload later.</p>
        </div>
      </Modal>

      {/* Profiles Modal */}
      <Modal isOpen={showProfilesModal} onClose={() => setShowProfilesModal(false)} title="Saved Profiles" size="lg">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {!profileList.length && <p className="text-sm text-slate-400 text-center py-6">No profiles saved yet</p>}
          {profileList.map(p => (
            <button
              key={p.id}
              onClick={() => loadProfile(p)}
              className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-indigo-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition-colors"
            >
              <div className="font-semibold text-sm text-slate-700">{p.profile_name}</div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                cost ₹{fmt(p.calculated_cost_per_kg || p.total_cost_per_unit)}/kg · sell ₹{fmt(p.calculated_sell_per_kg)}/kg
                {' · '}{new Date(p.created_at).toLocaleDateString('en-IN')}
              </div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}

// ─── YARN ROW ────────────────────────────────────────────────
function YarnRow({ yarn, options, mode, onChange, onRemove, yarnTypesData }) {
  const onSelectYarn = (id) => {
    const yt = yarnTypesData?.find(y => y.id === id)
    onChange({ yarn_type_id: id, rate_per_kg: yarn.rate_per_kg || yt?.default_rate_per_kg || 0 })
  }
  return (
    <div className="grid grid-cols-12 gap-2 items-end bg-slate-50/60 rounded-lg p-2">
      <SelectInput
        className="col-span-5"
        value={yarn.yarn_type_id}
        onChange={onSelectYarn}
        options={options}
        placeholder="— yarn —"
      />
      <NumInput
        className="col-span-3"
        value={yarn.rate_per_kg}
        onChange={v => onChange({ rate_per_kg: v })}
        suffix="₹/kg"
      />
      <NumInput
        className="col-span-3"
        value={mode === 'carriers' ? yarn.carriers : yarn.weight_pct}
        onChange={v => onChange(mode === 'carriers' ? { carriers: v } : { weight_pct: v })}
        suffix={mode === 'carriers' ? 'carr' : '%'}
        step={mode === 'carriers' ? '1' : '0.1'}
      />
      {onRemove ? (
        <button onClick={onRemove} className="col-span-1 p-2 text-slate-400 hover:text-red-600">
          <X size={14} />
        </button>
      ) : <div className="col-span-1" />}
    </div>
  )
}
