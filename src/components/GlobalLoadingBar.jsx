import { useEffect, useState } from 'react'

// Thin 2 px indigo bar pinned to the top of the viewport. Fades in when any
// `fetch()` is in flight and out when all requests complete — gives the user
// a subtle cue that something's happening without blocking interaction.
//
// Uses a wrapper around window.fetch that counts outstanding requests.
// Harmless if other parts of the app already intercept fetch — wrapper just
// passes through.

let pending = 0
const listeners = new Set()
const notify = () => listeners.forEach((l) => l(pending > 0))

// Install once, at module load — idempotent.
if (typeof window !== 'undefined' && !window.__sarasFetchInstrumented) {
  const origFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    // Skip instrumentation for same-origin HTML / asset requests (already
    // covered by the browser's own loading indicator).
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || ''
      const remote = url.startsWith('http') && !url.startsWith(window.location.origin)
      if (remote) { pending++; notify() }
      const res = await origFetch(...args)
      if (remote) { pending = Math.max(0, pending - 1); notify() }
      return res
    } catch (err) {
      if (pending > 0) { pending = Math.max(0, pending - 1); notify() }
      throw err
    }
  }
  window.__sarasFetchInstrumented = true
}

export default function GlobalLoadingBar() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const onChange = (v) => setActive(v)
    listeners.add(onChange)
    return () => { listeners.delete(onChange) }
  }, [])

  return (
    <div
      aria-hidden="true"
      className={`fixed top-0 left-0 right-0 h-[2px] pointer-events-none z-[60] transition-opacity duration-200 ${
        active ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div
        className="h-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-indigo-600"
        style={{ animation: active ? 'gloadbar-sweep 1.2s linear infinite' : 'none' }}
      />
      <style>{`
        @keyframes gloadbar-sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}
