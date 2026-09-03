import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen flex bg-[#f6f8fc]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30 lg:hidden backdrop-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col h-screen lg:ml-64">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="app-canvas flex-1 min-w-0 overflow-auto px-4 py-5 sm:px-6 sm:py-6 xl:px-8 xl:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
