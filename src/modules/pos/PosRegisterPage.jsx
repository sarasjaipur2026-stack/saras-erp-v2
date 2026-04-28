/**
 * PosRegisterPage — placeholder shell. The full 3-panel UI lands in Phase 6.
 * Phase 4 ships this as a navigable route so routing + perms can be verified.
 */

import { Link } from 'react-router-dom'

export default function PosRegisterPage({ mode = 'counter' }) {
  return (
    <div className="flex-1 flex items-center justify-center text-center p-8">
      <div>
        <div className="text-6xl mb-4">🛒</div>
        <h1 className="text-2xl font-bold text-slate-700 mb-2">POS Register — {mode === 'field' ? 'Field Sales (Tablet)' : 'Counter'}</h1>
        <p className="text-sm text-slate-500 mb-6">Phase 6 ships the full Petpooja-style 3-panel UI here.</p>
        <div className="flex gap-2 justify-center">
          <Link to="/pos/session" className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700">Open Drawer</Link>
          <Link to="/pos/history" className="px-4 py-2 text-sm bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Today's sales</Link>
          <Link to="/dashboard" className="px-4 py-2 text-sm bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Exit POS (Esc)</Link>
        </div>
      </div>
    </div>
  )
}
