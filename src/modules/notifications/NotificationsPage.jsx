import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { notifications, appSettings } from '../../lib/db'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, Badge } from '../../components/ui'
import {
  Bell, Search, CheckCheck, ShoppingCart, CreditCard, Truck, MessageSquare,
  AlertCircle, RotateCw, Settings2, ChevronDown, ChevronUp, Send,
} from 'lucide-react'

const fmtRel = (iso) => {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

const TYPE_META = {
  order_created:    { icon: ShoppingCart, variant: 'info',    entityRoute: (id) => `/orders/${id}` },
  order_approved:   { icon: ShoppingCart, variant: 'success', entityRoute: (id) => `/orders/${id}` },
  order_rejected:   { icon: ShoppingCart, variant: 'danger',  entityRoute: (id) => `/orders/${id}` },
  status_changed:   { icon: RotateCw,     variant: 'primary', entityRoute: (id) => `/orders/${id}` },
  delivery_added:   { icon: Truck,        variant: 'info',    entityRoute: (id) => `/orders/${id}` },
  payment_received: { icon: CreditCard,   variant: 'success', entityRoute: (id) => `/orders/${id}` },
  comment_added:    { icon: MessageSquare,variant: 'default', entityRoute: (id) => `/orders/${id}` },
  general:          { icon: AlertCircle,  variant: 'default', entityRoute: null },
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | unread

  // Webhook config card state
  const [showConfig, setShowConfig] = useState(false)
  const [configLoading, setConfigLoading] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEnabled, setWebhookEnabled] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [testingWebhook, setTestingWebhook] = useState(false)

  const loadConfig = async () => {
    setConfigLoading(true)
    try {
      const { data } = await appSettings.getAll()
      const byKey = {}
      for (const r of data || []) byKey[r.key] = r.value || {}
      setWebhookUrl(byKey['notifications.whatsapp_webhook_url']?.url || '')
      setWebhookEnabled(byKey['notifications.whatsapp_enabled']?.enabled === true)
    } finally {
      setConfigLoading(false)
    }
  }
  useEffect(() => { loadConfig() }, [])

  const saveConfig = async () => {
    setSavingConfig(true)
    try {
      const [a, b] = await Promise.all([
        appSettings.set('notifications.whatsapp_webhook_url', { url: webhookUrl.trim() }, 'POST target for WhatsApp-style notifications'),
        appSettings.set('notifications.whatsapp_enabled', { enabled: !!webhookEnabled }, 'Master switch for WhatsApp forwarding'),
      ])
      if (a?.error || b?.error) {
        toast.error('Failed to save config')
        return
      }
      toast.success('Webhook config saved')
    } finally {
      setSavingConfig(false)
    }
  }

  const sendTest = async () => {
    setTestingWebhook(true)
    try {
      const { error } = await notifications.emit({
        type: 'general',
        title: 'Test notification',
        message: 'This is a test from sarasERP · if you see this in WhatsApp, the webhook is live.',
        entity_type: null,
        entity_id: null,
      })
      if (error) toast.error('Emit failed — check the config')
      else toast.success('Test sent — check the bell + your WhatsApp inbox')
      load()
    } finally {
      setTestingWebhook(false)
    }
  }

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setLoadError(null)
    try {
      const res = await notifications.listForUser(user.id)
      if (res?.error) throw res.error
      setList(res?.data || [])
    } catch (err) {
      setLoadError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [user?.id])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let rows = list
    if (filter === 'unread') rows = rows.filter(r => !r.read_at)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.message || '').toLowerCase().includes(q) ||
        (r.type || '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [list, filter, search])

  const counts = useMemo(() => ({
    all: list.length,
    unread: list.filter(r => !r.read_at).length,
  }), [list])

  const handleClick = async (n) => {
    if (!n.read_at) {
      await notifications.markAsRead(n.id)
      setList(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
    }
    const meta = TYPE_META[n.type] || TYPE_META.general
    if (meta.entityRoute && n.entity_id) {
      navigate(meta.entityRoute(n.entity_id))
    }
  }

  const markAllRead = async () => {
    if (!user?.id) return
    const { error } = await notifications.markAllAsRead(user.id)
    if (error) { toast.error('Failed to mark read'); return }
    toast.success(`${counts.unread} marked as read`)
    load()
  }

  return (
    <div className="fade-in max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Bell size={20} className="text-indigo-600" /> Notifications
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {loading ? 'Loading…' : `${counts.all} total · ${counts.unread} unread`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load}><RotateCw size={13} /> Refresh</Button>
          {counts.unread > 0 && (
            <Button size="sm" onClick={markAllRead}>
              <CheckCheck size={13} /> Mark all read
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700">
          <strong>Failed to load:</strong> {loadError}
        </div>
      )}

      {/* Webhook config — collapsible */}
      <div className="mb-4 bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <button
          onClick={() => setShowConfig(s => !s)}
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings2 size={14} className="text-slate-400" />
            <span className="text-[13px] font-semibold text-slate-700">WhatsApp webhook config</span>
            {webhookEnabled
              ? <Badge variant="success">Active</Badge>
              : <Badge variant="default">Disabled</Badge>}
          </div>
          {showConfig ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </button>
        {showConfig && (
          <div className="px-5 py-4 border-t border-slate-100 space-y-4">
            <div>
              <Input
                label="Webhook URL"
                placeholder="https://your-bridge.example.com/webhook"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                disabled={configLoading}
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                Every notification POSTs a JSON body with <code>type</code>, <code>title</code>, <code>message</code>, <code>entity_type</code>, <code>entity_id</code>, and a preformatted <code>text</code> field.
                Works with any bridge that accepts JSON: n8n, Zapier, Make.com, Baileys, Gupshup, Meta Cloud API, custom serverless.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={webhookEnabled}
                onChange={e => setWebhookEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300"
              />
              <span className="text-[13px] text-slate-600">Forward notifications to this webhook</span>
            </label>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveConfig} loading={savingConfig}>Save config</Button>
              <Button variant="secondary" size="sm" onClick={sendTest} loading={testingWebhook} disabled={!webhookEnabled || !webhookUrl.trim()}>
                <Send size={13} /> Send test
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {[
            { k: 'all', label: `All (${counts.all})` },
            { k: 'unread', label: `Unread (${counts.unread})` },
          ].map(t => (
            <button
              key={t.k}
              onClick={() => setFilter(t.k)}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition ${
                filter === t.k ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1">
          <Input icon={Search} placeholder="Search notifications…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        {filtered.length === 0 && !loading ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Bell size={24} className="text-slate-400" />
            </div>
            <p className="text-sm text-slate-400">
              {filter === 'unread' ? "You're all caught up." : 'No notifications yet.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(n => {
              const meta = TYPE_META[n.type] || TYPE_META.general
              const Icon = meta.icon
              const unread = !n.read_at
              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-5 py-4 hover:bg-slate-50/60 transition-colors flex gap-3 items-start ${unread ? 'bg-indigo-50/30' : ''}`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    meta.variant === 'success' ? 'bg-emerald-50 text-emerald-600' :
                    meta.variant === 'danger'  ? 'bg-red-50 text-red-600' :
                    meta.variant === 'warning' ? 'bg-amber-50 text-amber-600' :
                    meta.variant === 'info'    ? 'bg-blue-50 text-blue-600' :
                    meta.variant === 'primary' ? 'bg-indigo-50 text-indigo-600' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-semibold text-[13px] text-slate-800 truncate">{n.title}</div>
                      <div className="text-[11px] text-slate-400 font-mono shrink-0">{fmtRel(n.created_at)}</div>
                    </div>
                    <div className="text-[12px] text-slate-500 mt-0.5 line-clamp-2">{n.message}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant={meta.variant}>{n.type.replace(/_/g, ' ')}</Badge>
                      {unread && <Badge variant="primary">• unread</Badge>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
