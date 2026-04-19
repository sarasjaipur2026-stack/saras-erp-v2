import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, ShoppingCart, MessageSquare, Calculator, Users,
  Package, Settings, Truck, Box, Palette, BarChart3, FileText,
  CreditCard, Briefcase, DollarSign, Building2, ChevronDown, Archive,
  Hash, Ruler, Cog, Layers, Workflow, UserCog, Sparkles, PackageOpen, ShieldCheck, Factory, ShoppingBag, Bell
} from 'lucide-react'

// Sidebar structure (post-polish reorg):
// - Promote 5 daily-use masters to top-level (Customers, Products, Materials,
//   Suppliers, Staff). The other ~19 setup-once masters (HSN, Units, Machine
//   Types, Yarn Types, Chaal Types, Process Types, etc.) were cognitive noise
//   in daily navigation. They now all live behind a single "Catalogs" link
//   that opens /masters/catalogs — a hub page with a card per master.
// - Reduces the daily sidebar from 41 items → ~22 items.
// - All /masters/<slug> routes still resolve exactly as before; nothing is
//   removed, just demoted from the sidebar.
const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, category: 'main' },
  { path: '/orders', label: 'Orders', icon: ShoppingCart, category: 'main', badge: true, perm: 'orders' },
  { path: '/enquiries', label: 'Enquiries', icon: MessageSquare, category: 'main', perm: 'orders' },
  { path: '/calculator', label: 'Calculator', icon: Calculator, category: 'production', perm: 'calculator' },
  { path: '/production', label: 'Production', icon: Factory, category: 'production', perm: 'production' },
  { path: '/jobwork', label: 'Jobwork', icon: Briefcase, category: 'production', perm: 'jobwork' },
  { path: '/quality', label: 'Quality Check', icon: ShieldCheck, category: 'production', perm: 'quality' },
  // 5 daily-use masters stay top-level
  { path: '/masters/customers', label: 'Customers', icon: Users, category: 'masters', perm: 'masters' },
  { path: '/masters/products', label: 'Products', icon: Package, category: 'masters', perm: 'masters' },
  { path: '/masters/materials', label: 'Materials', icon: Box, category: 'masters', perm: 'masters' },
  { path: '/masters/suppliers', label: 'Suppliers', icon: Truck, category: 'masters', perm: 'masters' },
  { path: '/masters/staff', label: 'Staff', icon: Users, category: 'masters', perm: 'masters' },
  // The hub for everything else
  { path: '/masters/catalogs', label: 'Catalogs', icon: Archive, category: 'masters', perm: 'masters' },
  { path: '/purchase', label: 'Purchase', icon: ShoppingBag, category: 'inventory', perm: 'purchase' },
  { path: '/stock', label: 'Stock', icon: BarChart3, category: 'inventory', perm: 'stock' },
  { path: '/dispatch', label: 'Dispatch', icon: Truck, category: 'inventory', perm: 'dispatch' },
  { path: '/invoices', label: 'Invoices', icon: FileText, category: 'finance', perm: 'invoices' },
  { path: '/payments', label: 'Payments', icon: CreditCard, category: 'finance', perm: 'payments' },
  { path: '/reports', label: 'Reports', icon: BarChart3, category: 'finance', perm: 'reports' },
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
  const { isAdmin, hasPermission } = useAuth()
  const location = useLocation()
  const [expandedCategories, setExpandedCategories] = useState({ masters: true })

  const toggleCategory = (catKey) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catKey]: !prev[catKey]
    }))
  }

  const systemItems = [
    { path: '/notifications', label: 'Notifications', icon: Bell, category: 'system' },
    { path: '/settings', label: 'Settings', icon: Settings, category: 'system', perm: 'settings' },
    { path: '/settings/users', label: 'Users & Roles', icon: UserCog, category: 'system', adminOnly: true },
    { path: '/import', label: 'Import Data', icon: Archive, category: 'system', adminOnly: true },
  ]

  // Filter by permission — items without a `perm` key are always visible,
  // items with `adminOnly` require the admin role outright.
  const allItems = [...NAV_ITEMS, ...systemItems].filter(it => {
    if (it.adminOnly) return isAdmin
    if (!it.perm) return true
    return hasPermission(it.perm)
  })

  return (
    <aside className={`
      fixed top-0 left-0 z-40 h-full w-64 bg-white border-r border-slate-200/80
      flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
      lg:translate-x-0
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-slate-200/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-500/25 ring-1 ring-indigo-500/10">
            S
          </div>
          <div>
            <div className="font-bold text-slate-900 text-sm leading-tight tracking-tight">sarasERP</div>
            <div className="text-[10px] text-slate-400 leading-tight font-medium">Jaipur</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 pl-0 pr-3 sidebar-scroll">
        {CATEGORIES.map(cat => {
          const items = allItems.filter(i => i.category === cat.key)
          if (!items.length) return null

          const isCollapsed = cat.collapsible && !expandedCategories[cat.key]

          return (
            <div key={cat.key}>
              {cat.label && (
                <div
                  onClick={() => cat.collapsible && toggleCategory(cat.key)}
                  className={`
                    text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mt-6 mb-2
                    flex items-center justify-between select-none
                    ${cat.collapsible ? 'cursor-pointer hover:text-slate-600 transition-colors duration-150' : ''}
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
                      group relative flex items-center gap-3 py-2.5 px-3 ml-0 rounded-r-lg text-[13px] mb-0.5 cursor-pointer
                      transition-colors duration-150
                      ${item.coming
                        ? 'text-slate-300 cursor-not-allowed'
                        : isActive
                          ? 'bg-indigo-50 text-indigo-700 font-semibold border-l-[3px] border-indigo-600'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-[3px] border-transparent'
                      }
                    `}
                  >
                    <Icon
                      className={`w-5 h-5 shrink-0 transition-colors duration-150 ${
                        isActive
                          ? 'text-indigo-600'
                          : item.coming
                            ? 'text-slate-300'
                            : 'text-slate-400 group-hover:text-slate-600'
                      }`}
                      strokeWidth={isActive ? 2 : 1.5}
                    />
                    <span className="flex-1">{item.label}</span>
                    {item.coming && (
                      <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-md font-medium">
                        Soon
                      </span>
                    )}
                    {item.badge && (
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75 animate-ping" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-100">
        <div className="text-[10px] text-slate-300 text-center font-medium tracking-wide">sarasERP v2.0</div>
      </div>
    </aside>
  )
}
