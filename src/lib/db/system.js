import { supabase } from '../supabase'
import { safe, createTable } from './core'

// ─── APP SETTINGS ──────────────────────────────────────────
export const appSettings = {
  getAll: async () => safe(() => supabase.from('app_settings').select('*').order('key')),

  get: async (key) => safe(() =>
    supabase.from('app_settings').select('*').eq('key', key).maybeSingle()
  ),

  set: async (key, value, description) => safe(() =>
    supabase.from('app_settings').upsert({
      key,
      value,
      description: description || undefined,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' }).select().single()
  ),
}

// ─── ATTACHMENTS ──────────────────────────────────────────
export const attachments = {
  ...createTable('attachments', { orderBy: 'created_at', orderAsc: false, ownerFilter: false }),

  listByEntity: async (entityType, entityId) => safe(() =>
    supabase
      .from('attachments')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(100)
  ),

  upload: async (entityType, entityId, file, uploadedBy) => {
    try {
      const bucket = 'order-attachments'
      const fileName = `${entityType}/${entityId}/${Date.now()}_${file.name}`

      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(fileName, file)
      if (uploadErr) return { data: null, error: uploadErr }

      const { data: attachment, error: recordErr } = await safe(() =>
        supabase
          .from('attachments')
          .insert([{
            entity_type: entityType,
            entity_id: entityId,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            storage_path: fileName,
            uploaded_by: uploadedBy,
          }])
          .select()
          .single()
      )

      return { data: attachment, error: recordErr }
    } catch (error) {
      return { data: null, error }
    }
  },
}

// ─── QUALITY INSPECTIONS ───────────────────────────────────
const qualityInspectionsBase = createTable('quality_inspections', {
  orderBy: 'inspected_at',
  orderAsc: false,
  ownerFilter: false,
  select: '*, quality_inspection_results(*, quality_parameters(name, unit, min_value, max_value))',
})
export const qualityInspections = {
  ...qualityInspectionsBase,

  getAll: async () => safe(() =>
    supabase
      .from('quality_inspections')
      .select('id, qi_number, source_type, source_id, inspector, sample_size, overall_status, inspected_at, created_at')
      .order('inspected_at', { ascending: false })
      .limit(1000)
  ),

  createInspection: async ({ source_type, source_id, inspector, sample_size, notes }) => {
    try {
      const { data: qiNum, error: numErr } = await supabase.rpc('next_qi_number')
      if (numErr) return { data: null, error: numErr }
      const { data, error } = await supabase.from('quality_inspections').insert([{
        qi_number: qiNum,
        source_type: source_type || 'manual',
        source_id: source_id || null,
        inspector: inspector || null,
        sample_size: sample_size || null,
        overall_status: 'pending',
        notes: notes || null,
      }]).select().single()
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  submitResults: async ({ inspection_id, results, overall_status }) => {
    try {
      await supabase.from('quality_inspection_results').delete().eq('inspection_id', inspection_id)
      if (results?.length) {
        const rows = results.map(r => ({
          inspection_id,
          parameter_id: r.parameter_id || null,
          parameter_name: r.parameter_name || null,
          measured_value: r.measured_value != null && r.measured_value !== '' ? Number(r.measured_value) : null,
          text_value: r.text_value || null,
          pass: r.pass ?? null,
          notes: r.notes || null,
        }))
        const { error: insErr } = await supabase.from('quality_inspection_results').insert(rows)
        if (insErr) return { data: null, error: insErr }
      }

      let finalStatus = overall_status
      if (!finalStatus) {
        const anyFail = (results || []).some(r => r.pass === false)
        const allPass = (results || []).length > 0 && (results || []).every(r => r.pass === true)
        finalStatus = anyFail ? 'failed' : allPass ? 'passed' : 'pending'
      }

      const { data, error } = await supabase
        .from('quality_inspections')
        .update({ overall_status: finalStatus, inspected_at: new Date().toISOString() })
        .eq('id', inspection_id)
        .select()
        .single()
      if (error) return { data: null, error }

      try {
        if (data?.source_type === 'grn' && data?.source_id && finalStatus !== 'pending') {
          const qcMap = { passed: 'passed', failed: 'failed', rework: 'rework' }
          const grnQc = qcMap[finalStatus] || 'pending'
          await supabase
            .from('goods_receipt_items')
            .update({ qc_status: grnQc })
            .eq('grn_id', data.source_id)
        }
      } catch (gErr) {
        if (import.meta.env.DEV) console.error('[qualityInspections.submitResults] GRN gating failed', gErr)
      }

      return { data, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },
}
