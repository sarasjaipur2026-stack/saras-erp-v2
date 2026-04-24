import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ChevronDown } from 'lucide-react'
import { NAV_ITEMS, SYSTEM_ITEMS, CATEGORIES } from '../lib/navItems'

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

  // Filter by permission — items without a `perm` key are always visible,
  // items with `adminOnly` require the admin role outright.
  const allItems = [...NAV_ITEMS, ...SYSTEM_ITEMS].filter(it => {
    if (it.adminOnly) return isAdmin
    if (!it.perm) return true
    return hasPermission(it.perm)
  })

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
