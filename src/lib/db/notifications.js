import { supabase } from '../supabase'
import { safe, createTable } from './core'

// ─── ACTIVITY LOG ──────────────────────────────────────────
export const activityLog = {
  ...createTable('activity_log', { orderBy: 'created_at', orderAsc: false, ownerFilter: false }),

  listByEntity: async (entityType, entityId) => safe(() =>
    supabase
      .from('activity_log')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(100)
  ),

  addComment: async (staffId, entityType, entityId, comment) => safe(() =>
    supabase
      .from('activity_log')
      .insert([{
        staff_id: staffId,
        entity_type: entityType,
        entity_id: entityId,
        action: 'comment',
        comment,
        created_at: new Date().toISOString(),
      }])
      .select()
      .single()
  ),
}

// ─── NOTIFICATIONS ────────────────────────────────────────
export const notifications = {
  ...createTable('notifications', { orderBy: 'created_at', orderAsc: false, ownerFilter: false }),

  getUnread: async (staffId) => safe(() =>
    supabase
      .from('notifications')
      .select('*')
      .eq('staff_id', staffId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
  ),

  listForUser: async (staffId) => safe(() =>
    supabase
      .from('notifications')
      .select('*')
      .or(`staff_id.eq.${staffId},staff_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(200)
  ),

  markAsRead: async (id) => safe(() =>
    supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
  ),

  markAllAsRead: async (staffId) => safe(() =>
    supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('staff_id', staffId)
      .is('read_at', null)
  ),

  emit: async (n) => {
    try {
      let userId = n.user_id || null
      if (!userId) {
        const { data: sess } = await supabase.auth.getSession()
        userId = sess?.session?.user?.id || null
      }
      if (!userId) {
        if (import.meta.env.DEV) console.warn('[notifications.emit] skipped — no authenticated user')
        return { data: null, error: new Error('no authenticated user') }
      }
      const row = {
        user_id: userId,
        type: n.type || 'general',
        title: n.title || 'Notification',
        message: n.message || '',
        entity_type: n.entity_type || null,
        entity_id: n.entity_id || null,
        staff_id: n.staff_id || null,
      }
      const { data, error } = await supabase.from('notifications').insert([row]).select().single()
      if (error) {
        if (import.meta.env.DEV) console.error('[notifications.emit] insert failed', error)
      }
      fireWebhook(row).catch(err => {
        if (import.meta.env.DEV) console.error('[notifications.emit] webhook failed', err)
      })
      return { data, error }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[notifications.emit] unexpected', err)
      return { data: null, error: err }
    }
  },
}

async function fireWebhook(notification) {
  try {
    const { data: rows, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['notifications.whatsapp_webhook_url', 'notifications.whatsapp_enabled'])
    if (error) return
    const cfg = {}
    for (const r of rows || []) cfg[r.key] = r.value || {}
    const enabled = cfg['notifications.whatsapp_enabled']?.enabled === true
    const url = cfg['notifications.whatsapp_webhook_url']?.url
    if (!enabled || !url) return
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      mode: 'no-cors',
      body: JSON.stringify({
        type: notification.type,
        title: notification.title,
        message: notification.message,
        entity_type: notification.entity_type,
        entity_id: notification.entity_id,
        text: `*${notification.title}*\n${notification.message}`,
        sent_at: new Date().toISOString(),
      }),
    })
  } catch {
    // Silent — webhook failures should never break business flows.
  }
}
