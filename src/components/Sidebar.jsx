import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, ShoppingCart, MessageSquare, Calculator, Users,
  Package, Settings, Truck, Box, Palette, BarChart3, FileText,
  CreditCard, Briefcase, DollarSign, Building2, ChevronDown, Archive,
  Hash, Ruler, Cog, Layers, Workflow, UserCog, Sparkles, PackageOpen, ShieldCheck, Factory, ShoppingBag
} from 'lucide-react'

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, category: 'main' },
  { path: '/orders', label: 'Orders', icon: ShoppingCart, category: 'main', badge: true },
  { path: '/enquiries', label: 'Enquiries', icon: MessageSquare, category: 'main' },
  { path: '/calculator', label: 'Calculator', icon: Calculator, category: 'production' },
  { path: '/production', label: 'Production', icon: Factory, category: 'production' },
  { path: '/masters/customers', label: 'Customers', icon: Users, category: 'masters' },
  { path: '/masters/products', label: 'Products', icon: Package, category: 'masters' },
  { path: '/masters/materials', label: 'Materials', icon: Box, category: 'masters' },
  { path: '/masters/machines', label: 'Machines', icon: Settings, category: 'masters' },
  { path: '/masters/colors', label: 'Colors', icon: Palette, category: 'masters' },
  { path: '/masters/suppliers', label: 'Suppliers', icon: Truck, category: 'masters' },
  { path: '/masters/brokers', label: 'Brokers', icon: Briefcase, category: 'masters' },
  { path: '/masters/charge-types', label: 'Charge Types', icon: DollarSign, category: 'masters' },
  { path: '/masters/order-types', label: 'Order Types', icon: Archive, category: 'masters' },
  { path: '/masters/payment-terms', label: 'Payment Terms', icon: CreditCard, category: 'masters' },
  { path: '/masters/warehouses', label: 'Warehouses', icon: Building2, category: 'masters' },
  { path: '/masters/banks', label: 'Banks', icon: Building2, category: 'masters' },
  { path: '/masters/staff', label: 'Staff', icon: Users, category: 'masters' },
  { path: '/masters/product-types', label: 'Product Types', icon: Layers, category: 'masters' },
  { path: '/masters/yarn-types', label: 'Yarn Types', icon: Sparkles, category: 'masters' },
  { path: '/masters/machine-types', label: 'Machine Types', icon: Cog, category: 'masters' },
  { path: '/masters/chaal-types', label: 'Chaal Types', icon: Workflow, category: 'masters' },
  { path: '/masters/process-types', label: 'Process Types', icon: Workflow, category: 'masters' },
  { path: '/masters/operators', label: 'Operators', icon: UserCog, category: 'masters' },
  { path: '/masters/hsn-codes', label: 'HSN Codes', icon: Hash, category: 'masters' },
  { path: '/masters/units', label: 'Units', icon: Ruler, category: 'masters' },
  { path: '/masters/packaging-types', label: 'Packaging', icon: PackageOpen, category: 'masters' },
  { path: '/masters/transports', label: 'Transports', icon: Truck, category: 'masters' },
  { path: '/masters/quality-parameters', label: 'Quality Params', icon: ShieldCheck, category: 'masters' },
  { path: '/purchase', label: 'Purchase', icon: ShoppingBag, category: 'inventory' },
  { path: '/stock', label: 'Stock', icon: BarChart3, category: 'inventory' },
  { path: '/dispatch', label: 'Dispatch', icon: Truck, category: 'inventory' },
  { path: '/invoices', label: 'Invoices', icon: FileText, category: 'finance' },
  { path: '/payments', label: 'Payments', icon: CreditCard, category: 'finance' },
  { path: '/reports', label: 'Reports', icon: BarChart3, category: 'finance' },
]

const CATEGORIES = [
  { key: 'main', label: '', collapsible: false },
  { key: 'production', label: 'Production', collapsible: false },
  { key: 'masters', label: 'Masters', collapsible: true },
  { key: 'inventory', label: 'Inventory', collapsible: false },
  { key: 'finance', label: 'Finance', collapsible: false },
  { key: 'system', label: 'System', collapsible: false },
]

export default function Sidebar({ isOpen, onClose }) {
  const { isAdmin } = useAuth()
  const location = useLocation()
  const [expandedCategories, setExpandedCategories] = useState({ masters: true })

  const toggleCategory = (catKey) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catKey]: !prev[catKey]
    }))
  }

  const systemItems = [
    { path: '/settings', label: 'Settings', icon: Settings, category: 'system' },
    { path: '/import', label: 'Import Data', icon: Archive, category: 'system' },
  ]

  const allItems = [...NAV_ITEMS, ...systemItems]

  return (
    <aside className={`
      fixed top-0 left-0 z-40 h-full w-64 bg-white border-r border-slate-200/70
      flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
      lg:translate-x-0
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-indigo-500/20">
            S
          </div>
          <div>
            <div className="font-bold text-slate-900 text-sm leading-tight tracking-tight">SARAS ERP</div>
            <div className="text-[10px] text-slate-400 leading-tight font-medium">Jaipur</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 sidebar-scroll">
        {CATEGORIES.map(cat => {
          const items = allItems.filter(i => i.category === cat.key)
          if (!items.length) return null

          const isCollapsed = cat.collapsible && !expandedCategories[cat.key]

          return (
            <div key={cat.key} className="mb-0.5">
              {cat.label && (
                <div
                  onClick={() => cat.collapsible && toggleCategory(cat.key)}
                  className={`
                    text-[10px] font-semibold text-slate-400/80 uppercase tracking-[0.08em] px-3 pt-5 pb-2
                    flex items-center justify-between
                    ${cat.collapsible ? 'cursor-pointer hover:text-slate-600' : ''}
                  `}
                >
                  <span>{cat.label}</span>
                  {cat.collapsible && (
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                    />
                  )}
                </div>
              )}
              {!isCollapsed && items.map(item => {
                const Icon = item.icon
                const isActive = location.pathname === item.path ||
                  (item.path !== '/' && location.pathname.startsWith(item.path))

                return (
                  <NavLink
                    key={item.path}
                    to={item.coming ? '#' : item.path}
                    onClick={(e) => {
                      if (item.coming) e.preventDefault()
                      else onClose?.()
                    }}
                    className={`
                      group relative flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] mb-0.5
                      transition-all duration-200
                      ${item.coming
                        ? 'text-slate-300 cursor-not-allowed'
                        : isActive
                          ? 'bg-indigo-50/80 text-indigo-700 font-semibold'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                      }
                    `}
                  >
                    {/* Active indicator bar */}
                    {isActive && !item.coming && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-indigo-500 rounded-r-full" />
                    )}
                    <Icon size={18} strokeWidth={isActive ? 2 : 1.5} className={`shrink-0 transition-colors duration-200 ${isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                    <span className="flex-1">{item.label}</span>
                    {item.coming && (
                      <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-md font-medium">
                        Soon
                      </span>
                    )}
                    {item.badge && (
                      <span className="w-2 h-2 bg-indigo-500 rounded-full" />
                    )}
                  </NavLink>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-100">
        <div className="text-[10px] text-slate-300 text-center font-medium tracking-wide">SARAS ERP v2.0</div>
      </div>
    </aside>
  )
}
