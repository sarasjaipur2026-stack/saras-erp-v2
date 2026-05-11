/**
 * ShellV2 — the new top-level layout shell.
 *
 * Drop-in replacement for src/components/Layout.jsx. Mounted ONCE per session
 * by LayoutShell (App.jsx) so Topbar/Sidebar/CommandPalette never remount on
 * route navigation — same anti-stampede contract as the old Layout.
 *
 * Renders:
 *   <Sidebar/>     (existing, now with PinnedNav + recent — see Phase 3)
 *   <TopbarV2/>    (new, with status pills + Cmd+K hotbar — Phase 2)
 *   <main>{children}</main>
 *   <CommandPalette/> (existing, now listens for the saras:open-command-palette
 *                     event dispatched by TopbarV2 — wired this phase)
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §4.1
 * Plan: docs/specs/2026-05-09-erp-shell-plan.md §Phase 4
 */

import { useState } from 'react'
import Sidebar from '../Sidebar'
import TopbarV2 from './TopbarV2'
import CommandPaletteV2 from './CommandPaletteV2'

export default function ShellV2({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobile sidebar overlay — same behaviour as the legacy Layout. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30 lg:hidden backdrop-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content — same lg:ml-64 sidebar offset. The h-screen flex column
          mirrors the legacy Layout so any page that relies on
          calc(100vh - header) still works. */}
      <div className="flex-1 flex flex-col h-screen lg:ml-64">
        <TopbarV2 onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>

      {/* CommandPaletteV2 mounted at root — reachable from anywhere via Cmd+K,
          via the saras:open-command-palette event dispatched by TopbarV2's
          search hotbar, or via the `/` shortcut anywhere except inside inputs. */}
      <CommandPaletteV2 />
    </div>
  )
}
