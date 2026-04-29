/**
 * Phone-first product photo wizard.
 *
 * Flow: pick a product (search or "next without photo") → take photo →
 * preview → save (auto-marks primary on first photo, becomes the POS tile)
 * → "Save & next" loops to next product without a photo.
 *
 * Mounted under PosLayout so it's full-screen on phone with no Topbar/Sidebar.
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §5.3
 */

import { useEffect, useMemo, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useApp } from '../../contexts/AppContext'
import { useToast } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Camera, Search, Check, X, Loader2, ImageIcon, ChevronRight, Trash2 } from 'lucide-react'

const BUCKET = 'product-images'
const MAX_EDGE = 1200
const QUALITY = 0.82

async function resizeImage(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })
  const ratio = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const w = Math.round(img.width * ratio)
  const h = Math.round(img.height * ratio)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(img, 0, 0, w, h)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', QUALITY))
}

function publicUrl(path) {
  if (!path) return null
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export default function ProductPhotoWizard() {
  const { user } = useAuth()
  const { products = [], primeMasters } = useApp()
  const toast = useToast()
  const navigate = useNavigate()

  useEffect(() => { primeMasters?.() }, [primeMasters])

  // Load existing primary images so we know which products lack a photo
  const [imageMap, setImageMap] = useState(new Map()) // product_id → image row
  const [imagesLoading, setImagesLoading] = useState(true)

  const refreshImages = async () => {
    setImagesLoading(true)
    const { data, error } = await supabase
      .from('product_images')
      .select('product_id, storage_path, is_primary, id')
      .eq('is_primary', true)
    setImagesLoading(false)
    if (error) { toast.error(error.message); return }
    const m = new Map()
    for (const img of data || []) m.set(img.product_id, img)
    setImageMap(m)
  }
  useEffect(() => { refreshImages() }, [])

  const [pickedId, setPickedId] = useState(null)
  const picked = useMemo(() => products.find(p => p.id === pickedId) || null, [products, pickedId])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('without_photo') // 'all' | 'without_photo' | 'with_photo'

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.filter(p => {
      if (filter === 'without_photo' && imageMap.has(p.id)) return false
      if (filter === 'with_photo' && !imageMap.has(p.id)) return false
      if (!term) return true
      return (p.code || '').toLowerCase().includes(term) || (p.name || '').toLowerCase().includes(term)
    }).slice(0, 200)
  }, [products, search, filter, imageMap])

  const stats = useMemo(() => ({
    total: products.length,
    withPhoto: products.filter(p => imageMap.has(p.id)).length,
  }), [products, imageMap])

  // ---- Photo step ----
  const fileInputRef = useRef(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewBlob, setPreviewBlob] = useState(null)
  const [busy, setBusy] = useState(false)

  const onFileChosen = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const blob = await resizeImage(file)
      if (blob.size > 524288) {
        toast.error('Still > 512KB after resize. Try a different photo.')
        setBusy(false)
        return
      }
      setPreviewBlob(blob)
      setPreviewUrl(URL.createObjectURL(blob))
    } catch (err) {
      toast.error('Could not load photo: ' + (err.message || err))
    }
    setBusy(false)
  }

  const discardPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPreviewBlob(null)
  }

  const savePhoto = async ({ andNext }) => {
    if (!previewBlob || !picked || !user?.id) return
    setBusy(true)
    try {
      const key = `${user.id}/${picked.id}/${crypto.randomUUID()}.jpg`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, previewBlob, { contentType: 'image/jpeg', upsert: false })
      if (upErr) throw upErr
      const existing = imageMap.get(picked.id)
      // First photo for this product → mark primary. Replace existing primary if user is overwriting.
      if (existing) {
        // Update existing primary to point at new path
        await supabase.from('product_images').update({ storage_path: key, uploaded_at: new Date().toISOString() }).eq('id', existing.id)
        // Best-effort delete of the old object
        await supabase.storage.from(BUCKET).remove([existing.storage_path])
      } else {
        await supabase.from('product_images').insert({
          user_id: user.id,
          product_id: picked.id,
          storage_path: key,
          is_primary: true,
          sort_order: 0,
        })
      }
      toast.success(`Saved · ${picked.name}`)
      discardPreview()
      await refreshImages()

      if (andNext) {
        // Find the next product without a photo
        const nextWithout = products.find(p => p.id !== picked.id && !imageMap.has(p.id))
        if (nextWithout) {
          setPickedId(nextWithout.id)
        } else {
          setPickedId(null)
          toast.success('All products in view have photos')
        }
      } else {
        setPickedId(null)
      }
    } catch (err) {
      toast.error('Save failed: ' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const removeExisting = async () => {
    const existing = picked && imageMap.get(picked.id)
    if (!existing) return
    if (!confirm(`Delete the photo for ${picked.name}?`)) return
    setBusy(true)
    await supabase.storage.from(BUCKET).remove([existing.storage_path])
    await supabase.from('product_images').delete().eq('id', existing.id)
    setBusy(false)
    toast.success('Photo deleted')
    refreshImages()
  }

  // ---- Render ----
  // Step 1: list (no product picked)
  if (!picked) {
    return (
      <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0">
          <Link to="/dashboard" className="p-1.5 text-slate-500 hover:text-indigo-600"><ArrowLeft size={20} /></Link>
          <div className="flex-1">
            <div className="text-base font-bold text-slate-800 leading-tight">Photo Wizard</div>
            <div className="text-[11px] text-slate-500">{stats.withPhoto} of {stats.total} products have photos</div>
          </div>
        </header>

        <div className="px-3 py-2 bg-white border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by code or name…"
              className="w-full pl-9 pr-3 py-2.5 text-[14px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:bg-white"
            />
          </div>
          <div className="flex gap-1.5 mt-2">
            {[
              { k: 'without_photo', label: `No photo (${stats.total - stats.withPhoto})` },
              { k: 'with_photo', label: `Has photo (${stats.withPhoto})` },
              { k: 'all', label: `All (${stats.total})` },
            ].map(t => (
              <button
                key={t.k}
                onClick={() => setFilter(t.k)}
                className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${filter === t.k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {imagesLoading ? (
            <div className="text-center py-12 text-slate-400 text-sm"><Loader2 className="inline animate-spin mr-2" size={14} /> Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">No products match</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(p => {
                const img = imageMap.get(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => setPickedId(p.id)}
                    className="w-full px-3 py-2.5 flex items-center gap-3 active:bg-slate-100 text-left"
                  >
                    <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                      {img ? (
                        <img src={publicUrl(img.storage_path)} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <ImageIcon size={18} className="text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-slate-700 truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{p.code}</div>
                    </div>
                    {img ? (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">PHOTO</span>
                    ) : (
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">add</span>
                    )}
                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Step 2: photo for the picked product
  const existing = imageMap.get(picked.id)
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => { discardPreview(); setPickedId(null) }} className="p-1.5 text-slate-500 hover:text-indigo-600"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold text-slate-800 leading-tight truncate">{picked.name}</div>
          <div className="text-[11px] text-slate-400 font-mono">{picked.code}</div>
        </div>
      </header>

      <div className="p-4 max-w-md mx-auto">
        {/* Big preview area */}
        <div className="aspect-square bg-white rounded-2xl border-2 border-dashed border-slate-200 overflow-hidden flex items-center justify-center mb-4">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="w-full h-full object-cover" />
          ) : existing ? (
            <img src={publicUrl(existing.storage_path)} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center text-slate-300">
              <Camera size={48} className="mx-auto mb-2" />
              <div className="text-sm font-semibold">No photo yet</div>
              <div className="text-[11px]">Tap below to capture</div>
            </div>
          )}
        </div>

        {/* Hidden input — capture="environment" tells phones to open the rear camera */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFileChosen}
          className="hidden"
        />

        {!previewUrl ? (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="w-full py-4 bg-indigo-600 text-white text-[15px] font-bold rounded-2xl shadow-md shadow-indigo-600/30 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 mb-2"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
              {existing ? 'Replace photo' : 'Take photo / Choose from gallery'}
            </button>
            {existing && (
              <button onClick={removeExisting} disabled={busy} className="w-full py-3 text-[13px] text-red-600 bg-white border border-red-200 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50">
                <Trash2 size={14} /> Delete photo
              </button>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => savePhoto({ andNext: true })}
              disabled={busy}
              className="w-full py-4 bg-indigo-600 text-white text-[15px] font-bold rounded-2xl shadow-md shadow-indigo-600/30 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              Save & next product
            </button>
            <button
              onClick={() => savePhoto({ andNext: false })}
              disabled={busy}
              className="w-full py-3 bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Check size={14} /> Save & back to list
            </button>
            <button
              onClick={discardPreview}
              disabled={busy}
              className="w-full py-3 bg-white border border-slate-200 text-[13px] font-semibold text-slate-500 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <X size={14} /> Retake
            </button>
          </div>
        )}

        <button
          onClick={() => navigate('/pos')}
          className="w-full py-2.5 mt-6 text-[12px] text-slate-400"
        >
          Done — go to POS →
        </button>
      </div>
    </div>
  )
}
