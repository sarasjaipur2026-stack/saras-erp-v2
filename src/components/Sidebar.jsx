import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, ShoppingCart, ClipboardList, Calculator, Users,
  Package, FileText, Truck, Settings, Box, CreditCard,
  BarChart3, UserCircle, MessageSquare, Palette
} from 'lucide-react'

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', labelHi: 'Dashboard', icon: LayoutDashboard, category: 'main' },
  { path: '/orders', label: 'Order Booking', labelHi: 'Order Booking', icon: ShoppingCart, category: 'sales' },
  { path: '/enquiries', label: 'Enquiries', labelHi: 'Enquiry', icon: MessageSquare, category: 'sales' },
  { path: '/calculator', label: 'Calculator', labelHi: 'Calculator', icon: Calculator, category: 'production' },
  { path: '/masters/customers', label: 'Customers', labelHi: 'Customers', icon: Users, category: 'masters' },
  { path: '/masters/products', label: 'Products', labelHi: 'Products', icon: Package, category: 'masters' },
  { path: '/masters/materials', label: 'Materials', labelHi: 'Materials', icon: Box, category: 'masters' },
  { path: '/masters/machines', label: 'Machines', labelHi: 'Machines', icon: Settings, category: 'masters' },
  { path: '/masters/colors', label: 'Colors', labelHi: 'Colors', icon: Palette, category: 'masters' },
  { path: '/masters/suppliers', label: 'Suppliers', labelHi: 'Suppliers', icon: Truck, category: 'masters' },
  { path: '/stock', label: 'Stock', labelHi: 'Stock', icon: BarChart3, category: 'inventory', coming: true },
  { path: '/invoices', label: 'Invoices', labelHi: 'Bills', icon: FileText, category: 'finance', coming: true },
  { path: '/payments', label: 'Payments', labelHi: 'Payments', icon: CreditCard, category: 'finance', coming: true },
  { path: '/team', label: 'Team', labelHi: 'Team', icon: UserCircle, category: 'admin', adminOnly: true },
]

const CATEGORIES = [
  { key: 'main', label: '' },
  { key: 'sales', label: 'Sales' },
  { key: 'production', label: 'Production' },
  { key: 'masters', label: 'Masters' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'finance', label: 'Finance' },
  { key: 'admin', label: 'Admin' },
]

export default function Sidebar({ isOpen, onClose }) {
  const { isAdmin } = useAuth()
  const location = useLocation()

  const filteredItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin)

  return (
    <aside className={`
      fixed top-0 left-0 z-40 h-full w-64 bg-white border-r border-slate-200
      flex flex-col transition-transform duration-200
      lg:translate-x-0
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">S</div>
          <div>
            <div className="font-semibold text-slate-900 text-sm leading-tight">SARAS ERP</div>
            <div className="text-[10px] text-slate-400 leading-tight">Jaipur</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {CATEGORIES.map(cat => {
          const items = filteredItems.filter(i => i.category === cat.key)
          if (!items.length) return null

          return (
            <div key={cat.key} className="mb-1">
              {cat.label && (
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 pt-4 pb-1">
                  {cat.label}
                </div>
              )}
              {items.map(item => {
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
                      flex items-center gap-3 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors
                      ${item.coming
                        ? 'text-slate-300 cursor-not-allowed'
                        : isActive
                          ? 'bg-indigo-50 text-indigo-700 font-medium'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }
                    `}
                  >
                    <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                    <span className="flex-1">{item.label}</span>
                    {item.coming && (
                      <span className="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full font-medium">
                        Soon
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
      <div className="p-3 border-t border-slate-100">
        <div className="text-[10px] text-slate-400 text-center">SARAS ERP v2.0</div>
      </div>
    </aside>
  )
}
