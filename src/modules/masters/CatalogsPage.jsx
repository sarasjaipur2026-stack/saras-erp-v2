import { useNavigate } from 'react-router-dom'
import {
  Settings, Palette, Briefcase, DollarSign, Archive, CreditCard,
  Building2, Layers, Sparkles, Cog, Workflow, UserCog, Hash, Ruler,
  PackageOpen, Truck, ShieldCheck,
} from 'lucide-react'

// CatalogsPage — one hub for all the setup-once master tables that used to
// clutter the sidebar. The 5 daily-use masters (Customers, Products,
// Materials, Suppliers, Staff) stay top-level; everything else lives here.
//
// Each card navigates to the existing /masters/<slug> route. No routes
// have been removed; this page just aggregates them in one place.

const CATALOGS = [
  { group: 'Product & Design', items: [
    { path: '/masters/colors',            label: 'Colors',            icon: Palette,   description: 'Yarn / FG colour palette' },
    { path: '/masters/product-types',     label: 'Product Types',     icon: Layers,    description: 'Categories of finished goods' },
    { path: '/masters/yarn-types',        label: 'Yarn Types',        icon: Sparkles,  description: 'Yarn counts / deniers / fibres' },
    { path: '/masters/packaging-types',   label: 'Packaging',         icon: PackageOpen, description: 'Cartons, rolls, bundles' },
  ]},
  { group: 'Production', items: [
    { path: '/masters/machines',          label: 'Machines',          icon: Settings,  description: 'Your plant inventory' },
    { path: '/masters/machine-types',     label: 'Machine Types',     icon: Cog,       description: 'Machine categories' },
    { path: '/masters/chaal-types',       label: 'Chaal Types',       icon: Workflow,  description: 'Weave / pattern variants' },
    { path: '/masters/process-types',     label: 'Process Types',     icon: Workflow,  description: 'Manufacturing processes' },
    { path: '/masters/operators',         label: 'Operators',         icon: UserCog,   description: 'Machine operators' },
    { path: '/masters/quality-parameters', label: 'Quality Params',   icon: ShieldCheck, description: 'QC inspection criteria' },
  ]},
  { group: 'Commercial', items: [
    { path: '/masters/brokers',           label: 'Brokers',           icon: Briefcase, description: 'Trade brokers & commission' },
    { path: '/masters/order-types',       label: 'Order Types',       icon: Archive,   description: 'Sales order classifications' },
    { path: '/masters/payment-terms',     label: 'Payment Terms',     icon: CreditCard, description: 'Net 30, advance, etc.' },
    { path: '/masters/charge-types',      label: 'Charge Types',      icon: DollarSign, description: 'Extra line items (freight, etc.)' },
    { path: '/masters/banks',             label: 'Banks',             icon: Building2, description: 'Bank accounts for receipts' },
  ]},
  { group: 'Operations & Reference', items: [
    { path: '/masters/warehouses',        label: 'Warehouses',        icon: Building2, description: 'Stock locations' },
    { path: '/masters/transports',        label: 'Transports',        icon: Truck,     description: 'Shipping partners' },
    { path: '/masters/hsn-codes',         label: 'HSN Codes',         icon: Hash,      description: 'GST tax codes' },
    { path: '/masters/units',             label: 'Units',             icon: Ruler,     description: 'kg, meters, pcs…' },
  ]},
]

export default function CatalogsPage() {
  const navigate = useNavigate()
  return (
    <div className="fade-in max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Catalogs</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          All setup-once reference data. The 5 masters you touch daily (Customers, Products,
          Materials, Suppliers, Staff) live in the sidebar directly.
        </p>
      </div>

      <div className="space-y-7">
        {CATALOGS.map((group) => (
          <section key={group.group}>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">{group.group}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className="flex items-start gap-3 bg-white border border-slate-200/80 rounded-xl p-4 text-left hover:border-indigo-300 hover:shadow-sm transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-indigo-50 text-slate-500 group-hover:text-indigo-600 flex items-center justify-center flex-shrink-0 transition-colors">
                      <Icon size={17} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-slate-800 group-hover:text-slate-900">
                        {item.label}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{item.description}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
