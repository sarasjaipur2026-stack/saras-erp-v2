/**
 * PosHistoryPage — today's POS sales + reprint.
 * Phase 4 ships placeholder. Phase 8 wires search/reprint.
 */

import { Link } from 'react-router-dom'

export default function PosHistoryPage() {
  return (
    <div className="flex-1 flex items-center justify-center text-center p-8">
      <div>
        <div className="text-6xl mb-4">📜</div>
        <h1 className="text-2xl font-bold text-slate-700 mb-2">Today's Sales</h1>
        <p className="text-sm text-slate-500 mb-6">Phase 8 ships search + reprint.</p>
        <Link to="/pos" className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700">Back to register</Link>
      </div>
    </div>
  )
}
