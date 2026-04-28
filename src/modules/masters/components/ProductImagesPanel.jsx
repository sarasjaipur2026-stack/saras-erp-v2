/**
 * Product Images Panel — multi-image gallery for a single SKU.
 * Lives inside the Product edit modal.
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §5.3
 * Plan: docs/specs/2026-04-28-pos-system-plan.md §Phase 3
 *
 * Storage layout:
 *   product-images/{user_id}/{product_id}/{uuid}.{ext}
 *   product-images/{user_id}/{product_id}/{uuid}_thumb.{ext}
 *
 * Compression: client-side canvas resize to 800px longest edge,
 * JPEG quality 0.82 → typically <500KB. Bucket itself enforces 512KB cap.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { productImages as productImagesDb } from '../../../lib/db'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { Upload, Star, Trash2, Loader2 } from 'lucide-react'

const BUCKET = 'product-images'
const MAX_EDGE = 800
const QUALITY = 0.82

/**
 * Resize an image File to MAX_EDGE px longest side, JPEG quality 0.82.
 * Returns a new Blob.
 */
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
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', QUALITY))
}

function publicUrl(path) {
  if (!path) return null
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export default function ProductImagesPanel({ productId }) {
  const { user } = useAuth()
  const toast = useToast()
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const refresh = useCallback(async () => {
    if (!productId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('product_images')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true })
    if (!error) setImages(data || [])
    setLoading(false)
  }, [productId])

  useEffect(() => { refresh() }, [refresh])

  const onSelectFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length || !productId || !user?.id) return

    setUploading(true)
    for (const file of files) {
      try {
        const blob = await resizeImage(file)
        if (blob.size > 524288) { toast.error(`Skipped ${file.name} — still > 512KB after resize`); continue }
        const ext = 'jpg'
        const key = `${user.id}/${productId}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, blob, { contentType: 'image/jpeg', upsert: false })
        if (upErr) throw upErr
        const isPrimary = images.length === 0
        const { error: insErr } = await productImagesDb.create({
          user_id: user.id,
          product_id: productId,
          storage_path: key,
          is_primary: isPrimary,
          sort_order: images.length,
        })
        if (insErr) throw insErr
      } catch (err) {
        toast.error(`Upload failed: ${err.message || err}`)
      }
    }
    setUploading(false)
    refresh()
  }

  const setPrimary = async (id) => {
    // Clear any existing primary first to honour the partial unique index
    await supabase.from('product_images').update({ is_primary: false }).eq('product_id', productId).eq('is_primary', true)
    const { error } = await productImagesDb.update(id, { is_primary: true })
    if (error) toast.error(error.message); else refresh()
  }

  const remove = async (img) => {
    if (!confirm('Delete this image?')) return
    await supabase.storage.from(BUCKET).remove([img.storage_path])
    if (img.thumb_path) await supabase.storage.from(BUCKET).remove([img.thumb_path])
    const { error } = await productImagesDb.delete(img.id)
    if (error) { toast.error(error.message); return }
    // If the deleted image was primary, promote the next one
    const remaining = images.filter(i => i.id !== img.id)
    if (img.is_primary && remaining.length > 0) {
      await productImagesDb.update(remaining[0].id, { is_primary: true })
    }
    refresh()
  }

  if (!productId) {
    return <div className="text-xs text-slate-400 italic py-4">Save the product first to upload images.</div>
  }

  return (
    <div className="border-t border-slate-100 pt-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">Images</div>
          <div className="text-[11px] text-slate-400">First image is the POS tile. Click ⭐ to make any image primary.</div>
        </div>
        <label className={`inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-sm shadow-indigo-600/20 cursor-pointer ${uploading ? 'opacity-50 cursor-wait' : ''}`}>
          <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={onSelectFiles} className="hidden" disabled={uploading} />
          {uploading ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : <><Upload size={14} /> Add Images</>}
        </label>
      </div>

      {loading ? (
        <div className="text-xs text-slate-400 py-4">Loading…</div>
      ) : images.length === 0 ? (
        <div className="text-xs text-slate-400 italic py-6 text-center border-2 border-dashed border-slate-200 rounded-lg">
          No images yet. Click "Add Images" — JPEG/PNG/WebP, auto-resized to ≤500KB.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {images.map((img) => (
            <div key={img.id} className={`relative group rounded-lg overflow-hidden border-2 ${img.is_primary ? 'border-indigo-500' : 'border-transparent'}`}>
              <img src={publicUrl(img.storage_path)} alt="" className="w-full aspect-square object-cover bg-slate-100" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {!img.is_primary && (
                  <button onClick={() => setPrimary(img.id)} className="p-2 bg-white rounded-full text-amber-500 hover:bg-amber-50" title="Set as primary">
                    <Star size={14} />
                  </button>
                )}
                <button onClick={() => remove(img)} className="p-2 bg-white rounded-full text-red-500 hover:bg-red-50" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
              {img.is_primary && (
                <div className="absolute top-1 left-1 bg-indigo-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">PRIMARY</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
