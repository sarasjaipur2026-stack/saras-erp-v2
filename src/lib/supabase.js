import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Custom storage adapter compatible with all supabase-js versions
const customStorage = {
  getItem: (key) => {
    if (typeof window === 'undefined') return null;
    return globalThis.localStorage.getItem(key);
  },
  setItem: (key, value) => {
    if (typeof window === 'undefined') return;
    globalThis.localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (typeof window === 'undefined') return;
    globalThis.localStorage.removeItem(key);
  },
  getAll: () => {
    if (typeof window === 'undefined') return [];
    const items = [];
    for (let i = 0; i < globalThis.localStorage.length; i++) {
      const key = globalThis.localStorage.key(i);
      items.push({ name: key, value: globalThis.localStorage.getItem(key) });
    }
    return items;
  },
  setAll: (items) => {
    if (typeof window === 'undefined') return;
    items.forEach(({ name, value }) => globalThis.localStorage.setItem(name, value));
  },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: customStorage,
  },
  global: {
    headers: {
      'X-Client-Info': 'saras-erp',
    },
  },
});

// Retry logic for network resilience
export const withRetry = async (fn, maxRetries = 3, delayMs = 1000) => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }
  throw lastError;
};

// Upload photo to Supabase Storage
export const uploadPhoto = async (bucket, file, path) => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
  const filePath = `${path}/${fileName}`;

  const { error } = await supabase.storage.from(bucket).upload(filePath, file);

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
};

// Delete photo from Supabase Storage
export const deletePhoto = async (bucket, path) => {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
};
