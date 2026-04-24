import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Modal, Input, Badge } from '../../components/ui'
import {
  Users, Shield, UserCog, Eye, Edit, RotateCw, Search, Check,
} from 'lucide-react'

// Permission matrix — drives both the admin UI checklist AND the
// preset shapes below. Kept in sync with hasPermission() in AuthContext.
const PERMISSION_MODULES = [
  { key: 'orders',     label: 'Orders',       actions: ['view', 'create', 'edit', 'approve', 'delete'] },
  { key: 'calculator', label: 'Calculator',   actions: ['view'] },
  { key: 'production', label: 'Production',   actions: ['view', 'manage'] },
  { key: 'purchase',   label: 'Purchase',     actions: ['view', 'create', 'receive'] },
  { key: 'stock',      label: 'Stock',        actions: ['view', 'adjust'] },
  { key: 'dispatch',   label: 'Dispatch',     actions: ['view', 'create'] },
  { key: 'invoices',   label: 'Invoices',     actions: ['view', 'create'] },
  { key: 'payments',   label: 'Payments',     actions: ['view', 'record'] },
  { key: 'jobwork',    label: 'Jobwork',      actions: ['view', 'manage'] },
  { key: 'quality',    label: 'Quality',      actions: ['view', 'inspect'] },
  { key: 'reports',    label: 'Reports',      actions: ['view'] },
  { key: 'masters',    label: 'Masters',      actions: ['view', 'manage'] },
  { key: 'settings',   label: 'Settings',     actions: ['view', 'manage'] },
]

const ROLE_META = {
  admin:  { variant: 'primary', label: 'Admin',  icon: Shield },
  staff:  { variant: 'info',    label: 'Staff',  icon: UserCog },
  viewer: { variant: 'default', label: 'Viewer', icon: Eye },
}

const emptyPermissions = () => {
  const p = {}
  for (const m of PERMISSION_MODULES) {
    p[m.key] = {}
    for (const a of m.actions) p[m.key][a] = false
  }
  return p
}

const fullPermissions = () => {
  const p = {}
  for (const m of PERMISSION_MODULES) {
    p[m.key] = {}
    for (const a of m.actions) p[m.key][a] = true
  }
  return p
}

const viewerPermissions = () => {
  const p = {}
  for (const m of PERMISSION_MODULES) {
    p[m.key] = {}
    for (const a of m.actions) p[m.key][a] = a === 'view'
  }
  return p
}

export default function UsersPage() {
  const { isAdmin, user: currentUser } = useAuth()
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [search, setSearch] = useState('')

  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      setList(data || [])
    } catch (err) {
      setLoadError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(p =>
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.role || '').toLowerCase().includes(q)
    )
  }, [list, search])

  const counts = useMemo(() => ({
    total: list.length,
    admin: list.filter(p => p.role === 'admin').length,
    staff: list.filter(p => p.role === 'staff').length,
    viewer: list.filter(p => p.role === 'viewer').length,
  }), [list])

  const openEdit = (profile) => {
    setEditing(profile)
    setEditForm({
      role: profile.role || 'staff',
      permissions: profile.permissions && Object.keys(profile.permissions).length > 0
        ? profile.permissions
        : profile.role === 'admin' ? fullPermissions()
          : profile.role === 'viewer' ? viewerPermissions()
            : emptyPermissions(),
    })
  }

  const setRole = (role) => {
    // H20 — block an admin from demoting themselves (prevents lockout and
    // last-admin scenarios). The account owner must ask a peer admin to change it.
    if (editing?.id === currentUser?.id && editing?.role === 'admin' && role !== 'admin') {
      toast.error("You can't change your own admin role. Ask another admin.")
      return
    }
    setEditForm(f => ({
      ...f,
      role,
      // Auto-apply preset permissions when role switches
      permissions:
        role === 'admin'  ? fullPermissions()   :
        role === 'viewer' ? viewerPermissions() :
        f.permissions, // staff keeps current perms (operator fine-tunes)
    }))
  }

  const togglePerm = (moduleKey, action) => {
    setEditForm(f => ({
      ...f,
      permissions: {
        ...f.permissions,
        [moduleKey]: {
          ...f.permissions[moduleKey],
          [action]: !f.permissions[moduleKey]?.[action],
        },
      },
    }))
  }

  const toggleModuleAll = (moduleKey, actions) => {
    const cur = editForm.permissions[moduleKey] || {}
    const allOn = actions.every(a => cur[a])
    const next = {}
    for (const a of actions) next[a] = !allOn
    setEditForm(f => ({
      ...f,
      permissions: { ...f.permissions, [moduleKey]: next },
    }))
  }

  const applyPreset = (preset) => {
    const perms =
      preset === 'full'    ? fullPermissions()   :
      preset === 'viewer'  ? viewerPermissions() :
      emptyPermissions()
    setEditForm(f => ({ ...f, permissions: perms }))
  }

  const submit = async () => {
    if (!editing || !editForm) return
    // H20 — defensive server-gate: block self-demote on submit too
    if (editing.id === currentUser?.id && editing.role === 'admin' && editForm.role !== 'admin') {
      toast.error("You can't change your own admin role. Ask another admin.")
      return
    }
    // Maintain at least one admin — prevent last-admin demotion
    if (editing.role === 'admin' && editForm.role !== 'admin' && counts.admin <= 1) {
      toast.error('At least one admin must remain. Promote another user first.')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          role: editForm.role,
          permissions: editForm.permissions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editing.id)
      if (error) {
        toast.error(error.message || 'Failed to save')
        return
      }
      toast.success('User permissions updated')
      setEditing(null)
      setEditForm(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="fade-in max-w-2xl mx-auto mt-12">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <Shield size={32} className="mx-auto mb-3 text-red-400" />
          <h2 className="text-lg font-bold text-red-900 mb-1">Admin access required</h2>
          <p className="text-[13px] text-red-700">Only users with the admin role can manage other users.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users size={20} className="text-indigo-600" /> Users &amp; Permissions
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {loading ? 'Loading…' : `${counts.total} users · ${counts.admin} admin · ${counts.staff} staff · ${counts.viewer} viewer`}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load}><RotateCw size={13} /> Refresh</Button>
      </div>

      {loadError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700">
          <strong>Failed to load:</strong> {loadError}
        </div>
      )}

      <Input icon={Search} placeholder="Search by name, email, role…" value={search} onChange={e => setSearch(e.target.value)} className="mb-4" />

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr>
              {['Name', 'Email', 'Role', 'Last Updated', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const meta = ROLE_META[p.role] || ROLE_META.staff
              const Icon = meta.icon
              const isMe = p.id === currentUser?.id
              return (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-700">
                    {p.full_name || '—'}
                    {isMe && <span className="ml-2 text-[11px] text-indigo-500 font-mono">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{p.email || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={meta.variant}><Icon size={11} /> {meta.label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">
                    {p.updated_at ? new Date(p.updated_at).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(p)}
                      className="text-[12px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 ml-auto"
                    >
                      <Edit size={13} /> Manage
                    </button>
                  </td>
                </tr>
              )
            })}
            {!filtered.length && !loading && (
              <tr><td colSpan={5} className="text-center py-12 text-sm text-slate-400">No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* EDIT MODAL */}
      <Modal
        isOpen={!!editing}
        onClose={() => { setEditing(null); setEditForm(null) }}
        title={editing ? `Permissions · ${editing.full_name || editing.email}` : ''}
        size="2xl"
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => { setEditing(null); setEditForm(null) }}>Cancel</Button>
          <Button size="sm" onClick={submit} loading={saving}>Save</Button>
        </>}
      >
        {editing && editForm && (
          <div className="space-y-5">
            {/* Role switcher */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-2">Role</label>
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                {Object.entries(ROLE_META).map(([k, m]) => {
                  const Icon = m.icon
                  return (
                    <button
                      key={k}
                      onClick={() => setRole(k)}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-[12px] font-semibold rounded-md transition ${
                        editForm.role === k ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                      }`}
                    >
                      <Icon size={13} /> {m.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                {editForm.role === 'admin' && 'Admins bypass all checks and see every module.'}
                {editForm.role === 'staff' && 'Staff access is driven by the permission checklist below.'}
                {editForm.role === 'viewer' && 'Viewers can only read — all non-view actions are disabled regardless of the checklist.'}
              </p>
            </div>

            {/* Presets */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-2">Presets</label>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => applyPreset('full')}>Full Access</Button>
                <Button variant="secondary" size="sm" onClick={() => applyPreset('viewer')}>View Only</Button>
                <Button variant="secondary" size="sm" onClick={() => applyPreset('none')}>None</Button>
              </div>
            </div>

            {/* Permission matrix */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-2">Permissions</label>
              <div className="bg-slate-50/60 rounded-xl border border-slate-100 divide-y divide-slate-100">
                {PERMISSION_MODULES.map(m => {
                  const modPerms = editForm.permissions[m.key] || {}
                  const allOn = m.actions.every(a => modPerms[a])
                  const someOn = m.actions.some(a => modPerms[a])
                  return (
                    <div key={m.key} className="px-3 py-2.5 flex items-center gap-2">
                      <button
                        onClick={() => toggleModuleAll(m.key, m.actions)}
                        className="text-[13px] font-semibold text-slate-700 w-32 text-left flex items-center gap-1.5 hover:text-indigo-600"
                      >
                        <span className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center ${
                          allOn ? 'bg-indigo-600 border-indigo-600' :
                          someOn ? 'bg-indigo-100 border-indigo-400' :
                          'border-slate-300'
                        }`}>
                          {allOn && <Check size={9} className="text-white" strokeWidth={3} />}
                        </span>
                        {m.label}
                      </button>
                      <div className="flex gap-1 flex-wrap flex-1">
                        {m.actions.map(a => {
                          const active = modPerms[a]
                          return (
                            <button
                              key={a}
                              onClick={() => togglePerm(m.key, a)}
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition ${
                                active
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {active && <Check size={10} className="inline -mt-0.5 mr-0.5" />}
                              {a}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Click a module name to toggle all its actions at once. Permissions have no effect for Admins (always yes) or Viewers (view-only).
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
