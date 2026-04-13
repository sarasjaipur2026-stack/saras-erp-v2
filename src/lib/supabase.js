import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  // Surfacing this loudly so a misconfigured Vercel build is obvious in the console
  console.error('[sarasERP] Supabase env vars missing at build time', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey })
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // password-only auth — skip PKCE/implicit URL detection
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'sb-kcnujpvzewtuttfcrtyz-auth-token',
    // Disable the navigator.locks-based lock — it can hang in some browser
    // contexts and there is no benefit for a single-tab SPA. Without this,
    // every supabase call waits for a lock that never resolves.
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
  global: {
    headers: { 'X-Client-Info': 'sarasERP' },
  },
})

// ─── Retry with exponential backoff ────────────────────────
export const withRetry = async (fn, retries = 3, delay = 800) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i === retries - 1) throw err
      await new Promise(r => setTimeout(r, delay * (i + 1)))
    }
  }
}

// ─── Offline queue ─────────────────────────────────────────
// Queues failed writes and replays them when back online
const pendingQueue = []
let isProcessing = false

export const queueOfflineWrite = (fn) => {
  pendingQueue.push(fn)
  processQueue()
}

const MAX_QUEUE_RETRIES = 5

const processQueue = async () => {
  if (isProcessing || pendingQueue.length === 0) return
  isProcessing = true
  while (pendingQueue.length > 0) {
    const fn = pendingQueue[0]
    let attempts = 0
    let success = false
    while (attempts < MAX_QUEUE_RETRIES) {
      try {
        await fn()
        success = true
        break
      } catch {
        attempts++
        if (attempts >= MAX_QUEUE_RETRIES) break
        await new Promise(r => setTimeout(r, 3000 * attempts))
      }
    }
    pendingQueue.shift()
    if (!success && import.meta.env.DEV) {
      console.error('[sarasERP] Queued write dropped after', MAX_QUEUE_RETRIES, 'retries')
    }
  }
  isProcessing = false
}

// Auto-process when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', processQueue)
}

// ─── Storage helpers ───────────────────────────────────────
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

export const uploadPhoto = async (bucket, file, path) => {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error(`File type "${file.type}" not allowed. Accepted: JPEG, PNG, WebP, GIF, PDF`)
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 5 MB`)
  }
  const ext = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '')
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`
  const filePath = `${path}/${name}`
  const { error } = await supabase.storage.from(bucket).upload(filePath, file)
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl
}

export const deletePhoto = async (bucket, path) => {
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
}
