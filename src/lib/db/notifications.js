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

  getUnread: () => safe(() => supabase.rpc('list_user_notifications', { p_unread: true, p_limit: 50 })),
  listForUser: () => safe(() => supabase.rpc('list_user_notifications', { p_unread: false, p_limit: 200 })),
  markAsRead: (id) => safe(() => supabase.rpc('mark_notifications_read', { p_id: id })),
  markAllAsRead: () => safe(() => supabase.rpc('mark_notifications_read', { p_id: null })),

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
      if (!error && data?.id) {
        if (n.waitForWebhook) {
          try { await fireWebhook(data.id) }
          catch (webhookError) { return { data, error: webhookError } }
        } else fireWebhook(data.id).catch(err => {
          if (import.meta.env.DEV) console.error('[notifications.emit] webhook failed', err)
        })
      }
      return { data, error }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[notifications.emit] unexpected', err)
      return { data: null, error: err }
    }
  },
}

async function fireWebhook(notificationId) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return
  const response = await fetch('/api/notification-webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify({ notificationId }), signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('Notification webhook delivery failed')
  const result = await response.json()
  if (result.status === 'disabled') throw new Error('Webhook is disabled')
  return result
}
