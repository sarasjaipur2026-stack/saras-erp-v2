import { useState } from 'react'
import { Button, Modal, Input, Textarea, Select } from '../../../components/ui'
import { LOST_REASONS } from '../../../lib/db/enquiryPipeline'

/**
 * Modal for "Mark Lost" action. Forces the user to pick a reason so we can
 * learn from lost enquiries. Optional competitor name + rate for intel.
 */
export default function LostReasonModal({ open, onClose, onConfirm, loading }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [competitorName, setCompetitorName] = useState('')
  const [competitorRate, setCompetitorRate] = useState('')
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    if (!reason) { setError('Please pick a reason — it helps us learn.'); return }
    setError('')
    const payload = {
      lost_reason: reason,
      lost_reason_note: note || null,
    }
    if (competitorName || competitorRate) {
      payload.competitor_info = {
        competitor: competitorName || null,
        rate: competitorRate ? Number(competitorRate) : null,
      }
    }
    await onConfirm(payload)
    // Reset state
    setReason(''); setNote(''); setCompetitorName(''); setCompetitorRate(''); setError('')
  }

  const handleClose = () => {
    setReason(''); setNote(''); setCompetitorName(''); setCompetitorRate(''); setError('')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Mark as Lost">
      <div className="space-y-4">
        <p className="text-[13px] text-slate-600">
          Tell us why this enquiry was lost. This data powers the "lost reasons" report
          so we learn what to fix.
        </p>

        <Select
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          options={[{ value: '', label: 'Pick a reason...' }, ...LOST_REASONS]}
        />

        <Textarea
          label="Note (optional)"
          placeholder="What specifically happened?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />

        {reason === 'competitor' && (
          <div className="grid grid-cols-2 gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <Input
              label="Competitor name"
              placeholder="e.g. L&T Cordage"
              value={competitorName}
              onChange={(e) => setCompetitorName(e.target.value)}
            />
            <Input
              label="Their rate (₹)"
              type="number"
              placeholder="e.g. 82"
              value={competitorRate}
              onChange={(e) => setCompetitorRate(e.target.value)}
            />
          </div>
        )}

        {error && <p className="text-[12px] text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirm} loading={loading}>Confirm Lost</Button>
        </div>
      </div>
    </Modal>
  )
}
