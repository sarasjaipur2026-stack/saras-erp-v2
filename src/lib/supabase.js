import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: { 'X-Client-Info': 'saras-erp' },
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

const processQueue = async () => {
  if (isProcessing || pendingQueue.length === 0) return
  isProcessing = true
  while (pendingQueue.length > 0) {
    const fn = pendingQueue[0]
    try {
      await fn()
      pendingQueue.shift()
    } catch {
      // Still offline, wait and retry
      await new Promise(r => setTimeout(r, 3000))
    }
  }
  isProcessing = false
}

// Auto-process when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', processQueue)
}

// ─── Storage helpers ───────────────────────────────────────
export const uploadPhoto = async (bucket, file, path) => {
  const ext = file.name.split('.').pop()
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
