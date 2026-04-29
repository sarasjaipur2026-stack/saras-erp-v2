/**
 * ZReportModal — drawer-close report.
 * Shows opening balance, cash in, expected vs counted, variance, gross sales,
 * invoice count.
 */

import { Modal, Button } from '../../../components/ui'

export default function ZReportModal({ open, onClose, report }) {
  if (!report) return null
  const variance = Number(report.variance || 0)
  const isOver = variance > 0.01
  const isShort = variance < -0.01

  return (
    <Modal isOpen={open} onClose={onClose} title="Z-Report — drawer closed" size="md">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Invoices" value={report.invoice_count ?? 0} />
          <Stat label="Gross sales" value={`₹${Number(report.gross_sales ?? 0).toFixed(2)}`} highlight />
        </div>

        <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
          <Row label="Opening cash" value={`₹${Number(report.opened_with).toFixed(2)}`} />
          <Row label="+ Cash sales" value={`₹${Number(report.cash_in).toFixed(2)}`} />
          <Row label="= Expected" value={`₹${Number(report.expected_cash).toFixed(2)}`} />
          <Row label="Counted" value={`₹${Number(report.counted_cash).toFixed(2)}`} />
          <div className={`flex items-center justify-between font-semibold pt-1 mt-1 border-t border-slate-200 ${isOver ? 'text-amber-600' : isShort ? 'text-red-600' : 'text-emerald-600'}`}>
            <span>Variance</span>
            <span>{variance >= 0 ? '+' : ''}₹{variance.toFixed(2)} {isOver ? '(over)' : isShort ? '(short)' : '(matched)'}</span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  )
}

function Row({ label, value }) {
  return <div className="flex items-center justify-between text-[12px] text-slate-600"><span>{label}</span><span className="font-mono">{value}</span></div>
}
function Stat({ label, value, highlight }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? 'bg-indigo-50' : 'bg-slate-50'}`}>
      <div className="text-[10px] uppercase text-slate-400 font-semibold mb-0.5">{label}</div>
      <div className={`text-lg font-bold ${highlight ? 'text-indigo-700' : 'text-slate-700'}`}>{value}</div>
    </div>
  )
}
