import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

const buildSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_GIT_COMMIT_SHA': JSON.stringify(buildSha),
  },
  resolve: {
    alias: { '@': '/src' }
  },
  build: {
    sourcemap: false,
    target: 'es2022',
    cssMinify: 'lightningcss',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/scheduler')) return 'vendor-react'
          if (id.includes('node_modules/react-router')) return 'vendor-router'
          if (id.includes('node_modules/@supabase')) return 'vendor-supabase'
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons'
        },
      },
    },
  },
})
