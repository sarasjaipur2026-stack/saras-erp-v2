import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request as httpsRequest } from 'node:https'

export function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const [a,b,c] = address.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
  }
  if (isIP(address) === 6) {
    return /^[23][0-9a-f]{3}:/i.test(address) && !/^2002:/i.test(address) &&
      !/^2001:(?:db8|0|2|10|20):/i.test(address)
  }
  return false
}

export async function postWebhook(destination, payload, resolve = lookup, send = httpsRequest) {
  const url = new URL(destination)
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Webhook must use HTTPS on port 443 without URL credentials')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const records = isIP(host) ? [{ address: host, family: isIP(host) }] : await resolve(host, { all: true })
  if (!records.length || records.some(r => !isPublicAddress(r.address))) throw new Error('Webhook destination is not public')
  const body = JSON.stringify(payload)
  // Pin the checked DNS result for this socket; redirects are never followed.
  await new Promise((done, reject) => {
    const req = send(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      agent: false,
      lookup: (_host, options, callback) => options?.all
        ? callback(null, records) : callback(null, records[0].address, records[0].family),
    }, response => {
      response.resume()
      if (response.statusCode >= 200 && response.statusCode < 300) done()
      else reject(new Error('Webhook destination rejected delivery'))
    })
    req.on('error', reject)
    req.setTimeout(8000, () => req.destroy(new Error('Webhook timed out')))
    req.end(body)
  })
}

export function createWebhookHandler({ env = process.env, request = fetch, forward = postWebhook } = {}) {
  return async incoming => {
    const reply = (status, value) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
    if (incoming.method !== 'POST') return reply(405, { error: 'POST required' })
    const authorization = incoming.headers.get('authorization') || ''
    if (!/^Bearer \S+$/.test(authorization)) return reply(401, { error: 'Authentication required' })
    const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
    const secret = env.SUPABASE_SERVICE_ROLE_KEY
    if (!base || !anon || !secret) return reply(503, { error: 'Webhook server configuration missing' })
    let id
    let claimed = false
    let forwarded = false
    const call = async (path, privileged = false, body) => {
      const key = privileged ? secret : anon
      const response = await request(`${base.replace(/\/$/,'')}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { apikey: key, Authorization: privileged ? `Bearer ${secret}` : authorization, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) throw new Error('Supabase webhook request failed')
      const text = await response.text()
      return text ? JSON.parse(text) : null
    }
    try {
      const text = await incoming.text()
      if (text.length > 1024) return reply(413, { error: 'Request too large' })
      try { id = JSON.parse(text).notificationId } catch { return reply(400, { error: 'Invalid request' }) }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) return reply(400, { error: 'Invalid notification ID' })
      const user = await call('/auth/v1/user')
      const rows = await call(`/rest/v1/notifications?id=eq.${id}&select=id,user_id,type,title,message,entity_type,entity_id`)
      const notification = rows[0]
      if (!user.id || !notification || notification.user_id !== user.id) return reply(403, { error: 'Notification access denied' })
      const settings = await call('/rest/v1/app_settings?key=in.(notifications.whatsapp_enabled,notifications.whatsapp_webhook_url)&select=key,value', true)
      const config = Object.fromEntries(settings.map(row => [row.key,row.value]))
      if (config['notifications.whatsapp_enabled']?.enabled !== true) return reply(200, { status: 'disabled' })
      const destination = config['notifications.whatsapp_webhook_url']?.url
      if (!destination) return reply(503, { error: 'Webhook destination missing' })
      claimed = await call('/rest/v1/rpc/claim_notification_webhook', false, { p_id: id })
      if (!claimed) return reply(200, { status: 'already_claimed' })
      await forward(destination, {
        notification_id: id, type: notification.type, title: notification.title, message: notification.message,
        entity_type: notification.entity_type, entity_id: notification.entity_id,
        text: `*${notification.title}*\n${notification.message}`, sent_at: new Date().toISOString(),
      })
      forwarded = true
      await call('/rest/v1/rpc/finish_notification_webhook', true, { p_id: id, p_success: true })
      return reply(200, { status: 'delivered' })
    } catch {
      if (claimed && !forwarded) {
        try { await call('/rest/v1/rpc/finish_notification_webhook', true, { p_id: id, p_success: false }) } catch { /* preserve original failure */ }
      }
      return reply(502, { error: 'Webhook delivery failed' })
    }
  }
}
