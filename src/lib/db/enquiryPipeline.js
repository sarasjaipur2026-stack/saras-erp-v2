import { supabase } from '../supabase'
import { safe } from './core'

// ─── SOURCE CHANNELS ─────────────────────────────────
export const SOURCE_CHANNELS = [
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'call',      label: 'Phone Call' },
  { value: 'referral',  label: 'Referral' },
  { value: 'indiamart', label: 'IndiaMART' },
  { value: 'justdial',  label: 'JustDial' },
  { value: 'walkin',    label: 'Walk-in' },
  { value: 'tradeshow', label: 'Trade Show' },
  { value: 'website',   label: 'Website' },
  { value: 'email',     label: 'Email' },
  { value: 'cold',      label: 'Cold Outreach' },
  { value: 'repeat',    label: 'Repeat Customer' },
  { value: 'other',     label: 'Other' },
]

// ─── PIPELINE STAGES ─────────────────────────────────
export const STAGES = [
  { value: 'new',         label: 'New',         defaultProb: 10, color: 'slate'  },
  { value: 'contacted',   label: 'Contacted',   defaultProb: 20, color: 'blue'   },
  { value: 'quoted',      label: 'Quoted',      defaultProb: 40, color: 'indigo' },
  { value: 'negotiating', label: 'Negotiating', defaultProb: 70, color: 'purple' },
  { value: 'closing',     label: 'Closing',     defaultProb: 90, color: 'emerald'},
]

export const OUTCOMES = [
  { value: 'open', label: 'Open',  color: 'slate'   },
  { value: 'won',  label: 'Won',   color: 'emerald' },
  { value: 'lost', label: 'Lost',  color: 'red'     },
]

// ─── LOST REASONS ────────────────────────────────────
export const LOST_REASONS = [
  { value: 'price',      label: 'Price too high' },
  { value: 'competitor', label: 'Competitor won' },
  { value: 'timing',     label: 'Timing wrong' },
  { value: 'mismatch',   label: 'Product mismatch' },
  { value: 'vanished',   label: 'Customer stopped responding' },
  { value: 'policy',     label: 'Internal policy / budget cut' },
  { value: 'other',      label: 'Other' },
]

export const PRIORITIES = [
  { value: 'normal', label: 'Normal', color: 'slate'  },
  { value: 'high',   label: 'High',   color: 'amber'  },
  { value: 'urgent', label: 'Urgent', color: 'red'    },
]

// ─── ACTIVITY TYPES ──────────────────────────────────
export const ACTIVITY_TYPES = {
  call:              { label: 'Call',           icon: 'phone' },
  whatsapp:          { label: 'WhatsApp',       icon: 'message' },
  email:             { label: 'Email',          icon: 'mail' },
  visit:             { label: 'Visit',          icon: 'map' },
  quote_sent:        { label: 'Quote sent',     icon: 'file' },
  sample_sent:       { label: 'Sample sent',    icon: 'package' },
  note:              { label: 'Note',           icon: 'edit' },
  stage_change:      { label: 'Stage changed',  icon: 'arrow-right' },
  outcome_change:    { label: 'Outcome',        icon: 'check' },
  assignment_change: { label: 'Reassigned',     icon: 'user' },
  system:            { label: 'System',         icon: 'cog' },
}

// ─── LINE ITEMS ──────────────────────────────────────
export const enquiryLineItems = {
  listByEnquiry: async (enquiryId) => safe(() =>
    supabase.from('enquiry_line_items').select('*, products(id, name, code)')
      .eq('enquiry_id', enquiryId).order('position', { ascending: true })
  ),
  create: async (row) => safe(() =>
    supabase.from('enquiry_line_items').insert([row]).select().single()
  ),
  createMany: async (rows) => safe(() =>
    supabase.from('enquiry_line_items').insert(rows).select()
  ),
  update: async (id, row) => safe(() =>
    supabase.from('enquiry_line_items').update(row).eq('id', id).select().single()
  ),
  delete: async (id) => safe(() =>
    supabase.from('enquiry_line_items').delete().eq('id', id)
  ),
}

// ─── ACTIVITIES ──────────────────────────────────────
export const enquiryActivities = {
  listByEnquiry: async (enquiryId) => safe(() =>
    supabase.from('enquiry_activities').select('*')
      .eq('enquiry_id', enquiryId).order('happened_at', { ascending: false })
  ),
  create: async (row) => safe(() =>
    supabase.from('enquiry_activities').insert([row]).select().single()
  ),
}

// ─── PIPELINE HELPERS ────────────────────────────────
export const stageByValue = (v) => STAGES.find(s => s.value === v) || STAGES[0]
export const outcomeByValue = (v) => OUTCOMES.find(o => o.value === v) || OUTCOMES[0]
export const priorityByValue = (v) => PRIORITIES.find(p => p.value === v) || PRIORITIES[0]
export const lostReasonByValue = (v) => LOST_REASONS.find(l => l.value === v)
export const sourceByValue = (v) => SOURCE_CHANNELS.find(s => s.value === v)

// ─── MARK LOST RPC-style helper ──────────────────────
export const markEnquiryLost = async (id, { lost_reason, lost_reason_note, competitor_info } = {}) => {
  if (!lost_reason) return { data: null, error: new Error('lost_reason is required') }
  return safe(() =>
    supabase.from('enquiries').update({
      outcome: 'lost',
      lost_reason,
      lost_reason_note: lost_reason_note || null,
      competitor_info: competitor_info || null,
    }).eq('id', id).select().single()
  )
}

export const undoMarkLost = async (id) => safe(() =>
  supabase.from('enquiries').update({
    outcome: 'open',
    lost_reason: null,
    lost_reason_note: null,
    lost_at: null,
  }).eq('id', id).select().single()
)
