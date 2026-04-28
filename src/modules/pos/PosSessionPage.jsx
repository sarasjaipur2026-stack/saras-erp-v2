/**
 * PosSessionPage — open / close cashier drawer.
 * Phase 4 ships placeholders. Phase 9 wires real open/close + Z-report.
 */

import { Link } from 'react-router-dom'

export default function PosSessionPage() {
  return (
    <div className="flex-1 flex items-center justify-center text-center p-8">
      <div>
        <div className="text-6xl mb-4">💰</div>
        <h1 className="text-2xl font-bold text-slate-700 mb-2">Drawer Session</h1>
        <p className="text-sm text-slate-500 mb-6">Phase 9 wires open/close + Z-report.</p>
        <Link to="/pos" className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700">Back to register</Link>
      </div>
    </div>
  )
}
