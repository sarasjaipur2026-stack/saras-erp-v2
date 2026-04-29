/**
 * PosSessionPage — open / close cashier drawer.
 *
 * Open flow:  pick terminal → enter opening cash → INSERT pos_sessions
 * Close flow: count cash → pos_close_session RPC → render Z-report
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §6 (session lifecycle)
 * Plan: docs/specs/2026-04-28-pos-system-plan.md §Phase 9
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Input } from '../../components/ui'
import { useToast } from '../../contexts/ToastContext'
import { defaultTerminal, currentSession, openSession, closeSession } from './lib/posDb'
import ZReportModal from './components/ZReportModal'
import { ArrowLeft, Banknote, Loader2 } from 'lucide-react'

export default function PosSessionPage() {
  const toast = useToast()
  const navigate = useNavigate()

  const [terminal, setTerminal] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  const [openingCash, setOpeningCash] = useState('4200')
  const [countedCash, setCountedCash] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [report, setReport] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: t } = await defaultTerminal()
      if (!alive) return
      setTerminal(t)
      if (t) {
        const { data: s } = await currentSession(t.id)
        if (alive) setSession(s)
      }
      if (alive) setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  const onOpen = async () => {
    setSubmitting(true)
    const { data, error } = await openSession({
      terminalId: terminal.id,
      openedWith: parseFloat(openingCash) || 0,
    })
    setSubmitting(false)
    if (error) { toast.error(String(error.message || error)); return }
    setSession(data)
    toast.success('Drawer opened')
    navigate('/pos')
  }

  const onClose = async () => {
    setSubmitting(true)
    const { data, error } = await closeSession({
      sessionId: session.id,
      countedCash: parseFloat(countedCash) || 0,
    })
    setSubmitting(false)
    if (error) { toast.error(String(error.message || error)); return }
    setReport(data)
    setSession(null)
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
  }

  if (!terminal) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <h2 className="text-lg font-bold text-slate-700 mb-2">No POS terminal</h2>
          <Link to="/dashboard" className="text-indigo-600 hover:underline text-sm">Back to dashboard</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="max-w-xl mx-auto p-6">
        <Link to="/pos" className="inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-indigo-600 mb-4">
          <ArrowLeft size={13} /> Back to register
        </Link>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Banknote size={20} />
            </div>
            <div>
              <div className="text-lg font-bold text-slate-800">Drawer Session</div>
              <div className="text-[12px] text-slate-500">{terminal.name}</div>
            </div>
          </div>

          {!session ? (
            <>
              <div className="text-[12px] text-slate-500 mb-3">No drawer open. Count physical cash and enter the opening balance to start a session.</div>
              <Input label="Opening cash (₹)" type="number" value={openingCash} onChange={e => setOpeningCash(e.target.value)} />
              <Button className="mt-3 w-full" onClick={onOpen} loading={submitting}>Open drawer</Button>
            </>
          ) : (
            <>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-[12px] text-emerald-700 mb-4">
                Drawer open since {new Date(session.opened_at).toLocaleString()} · opened with ₹{Number(session.opened_with).toFixed(2)}
              </div>
              <div className="text-[12px] text-slate-600 mb-3">Count the physical cash now (notes + coin) and enter below to reconcile.</div>
              <Input label="Counted cash (₹)" type="number" value={countedCash} onChange={e => setCountedCash(e.target.value)} placeholder="0.00" autoFocus />
              <div className="flex gap-2 mt-3">
                <Button variant="secondary" onClick={() => navigate('/pos')}>Keep open</Button>
                <Button variant="danger" onClick={onClose} loading={submitting} disabled={!countedCash}>Close drawer</Button>
              </div>
            </>
          )}
        </div>
      </div>

      <ZReportModal
        open={!!report}
        onClose={() => { setReport(null); navigate('/pos') }}
        report={report ? { ...report, opened_with: report.opened_with } : null}
      />
    </div>
  )
}
