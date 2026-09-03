import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabaseAuthStorageKey = (() => {
  try {
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
    return projectRef ? `sb-${projectRef}-auth-token` : 'saras-auth-token'
  } catch {
    return 'saras-auth-token'
  }
})()

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
    storageKey: supabaseAuthStorageKey,
    // Disable the navigator.locks-based lock — it can hang in some browser
    // contexts and there is no benefit for a single-tab SPA. Without this,
    // every supabase call waits for a lock that never resolves.
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
  global: {
    headers: { 'X-Client-Info': 'sarasERP' },
  },
})

// ─── Storage helpers ───────────────────────────────────────
const IMAGE_EXTENSIONS = new Map([
  ['image/jpeg', new Set(['jpg', 'jpeg'])],
  ['image/png', new Set(['png'])],
  ['image/webp', new Set(['webp'])],
  ['image/gif', new Set(['gif'])],
])
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

export const uploadPhoto = async (bucket, file, path) => {
  const ext = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '')
  const allowedExtensions = IMAGE_EXTENSIONS.get(file.type)
  if (!allowedExtensions?.has(ext)) throw new Error('Only JPEG, PNG, WebP, and GIF images are allowed')
  if (!file.size) throw new Error('The selected image is empty')
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 5 MB`)
  }
  const name = `${crypto.randomUUID()}.${ext}`
  const filePath = `${path}/${name}`
  const { error } = await supabase.storage.from(bucket).upload(filePath, file)
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl
}

export const deletePhoto = async (bucket, path) => {
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
}
