import { supabase } from '../supabase'
import { safe, createTable, fetchAll } from './core'

const ATTACHMENT_BUCKET = 'order-attachments'
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
])
const ALLOWED_ENTITY_TYPES = new Set(['order', 'enquiry', 'invoice', 'purchase_order', 'goods_receipt', 'quality_inspection'])

const validateAttachment = (entityType, entityId, file) => {
  if (!ALLOWED_ENTITY_TYPES.has(entityType)) throw new Error('Unsupported attachment entity')
  if (!entityId) throw new Error('Attachment entity ID is required')
  if (!file) throw new Error('Choose a file to upload')
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) throw new Error('Only JPEG, PNG, WebP, GIF and PDF files are allowed')
  if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE) throw new Error('Attachment must be between 1 byte and 5 MB')
}

const safeDisplayName = (name) => String(name || 'attachment')
  .split('')
  .filter(character => {
    const code = character.charCodeAt(0)
    return code >= 32 && code !== 127
  })
  .join('')
  .replace(/[\\/]+/g, '_')
  .trim()
  .slice(0, 180) || 'attachment'

// ─── APP SETTINGS ──────────────────────────────────────────
export const appSettings = {
  getAll: async () => safe(() => supabase.from('app_settings').select('*').order('key')),

  get: async (key) => safe(() =>
    supabase.from('app_settings').select('*').eq('key', key).maybeSingle()
  ),

  set: async (key, value, description) => safe(() => supabase.rpc('set_app_setting', {
    p_key: key,
    p_value: value,
    p_description: description || null,
  })),
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
      validateAttachment(entityType, entityId, file)
      const { data: { session } } = await supabase.auth.getSession()
      const authenticatedUserId = session?.user?.id
      if (!authenticatedUserId) throw new Error('You must be signed in to upload attachments')
      if (uploadedBy && uploadedBy !== authenticatedUserId) throw new Error('Invalid attachment owner')

      const originalName = safeDisplayName(file.name)
      const extension = originalName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
      const objectName = `${crypto.randomUUID()}.${extension}`
      const storagePath = `${entityType}/${entityId}/${objectName}`

      const { error: uploadErr } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false })
      if (uploadErr) return { data: null, error: uploadErr }

      const { data: attachment, error: recordErr } = await safe(() =>
        supabase
          .from('attachments')
          .insert([{
            entity_type: entityType,
            entity_id: entityId,
            file_name: originalName,
            file_type: file.type,
            file_size: file.size,
            storage_path: storagePath,
            uploaded_by: authenticatedUserId,
          }])
          .select()
          .single()
      )

      if (recordErr) {
        await supabase.storage.from(ATTACHMENT_BUCKET).remove([storagePath])
        return { data: null, error: recordErr }
      }

      return { data: attachment, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },

  createSignedUrl: async (storagePath) => {
    if (!storagePath || storagePath.includes('..') || storagePath.startsWith('/')) {
      return { data: null, error: new Error('Invalid attachment path') }
    }
    return safe(() => supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(storagePath, 60))
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

  getAll: async () => safe(() => fetchAll(() => supabase
      .from('quality_inspections')
      .select('id, qi_number, source_type, source_id, inspector, sample_size, overall_status, inspected_at, created_at')
      .order('inspected_at', { ascending: false })
  )),

  createInspection: async ({ source_type, source_id, inspector, sample_size, notes, request_id }) => {
    try {
      return await safe(() => supabase.rpc('create_quality_inspection_transactional', {
        p_payload: {
          source_type: source_type || 'manual',
          source_id: source_id || null,
          inspector: inspector || null,
          sample_size: sample_size || null,
          notes: notes || null,
        },
        p_request_id: request_id || crypto.randomUUID(),
      }))
    } catch (error) {
      return { data: null, error }
    }
  },

  submitResults: async ({ inspection_id, results, overall_status }) => {
    try {
      let finalStatus = overall_status
      if (!finalStatus) {
        const anyFail = (results || []).some(r => r.pass === false)
        const allPass = (results || []).length > 0 && (results || []).every(r => r.pass === true)
        finalStatus = anyFail ? 'failed' : allPass ? 'passed' : 'pending'
      }

      return await safe(() => supabase.rpc('submit_quality_results_transactional', {
        p_inspection_id: inspection_id,
        p_results: (results || []).map(r => ({
          parameter_id: r.parameter_id || null,
          parameter_name: r.parameter_name || null,
          measured_value: r.measured_value != null && r.measured_value !== '' ? Number(r.measured_value) : null,
          text_value: r.text_value || null,
          pass: r.pass ?? null,
          notes: r.notes || null,
        })),
        p_overall_status: finalStatus,
      }))
    } catch (error) {
      return { data: null, error }
    }
  },
}
