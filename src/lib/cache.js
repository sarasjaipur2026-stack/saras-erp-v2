const APP_CACHE_PREFIXES = ['saras_', 'saras.']

const isAppCacheKey = (key) => APP_CACHE_PREFIXES.some(prefix => key.startsWith(prefix))

const clearStorage = (storage) => {
  if (!storage) return
  for (const key of Object.keys(storage)) {
    if (isAppCacheKey(key)) storage.removeItem(key)
  }
}

export const clearAppCaches = () => {
  if (typeof window === 'undefined') return
  clearStorage(window.localStorage)
  clearStorage(window.sessionStorage)
}

export const scopedCacheKey = (base, userId) => userId ? `${base}_${userId}` : null
