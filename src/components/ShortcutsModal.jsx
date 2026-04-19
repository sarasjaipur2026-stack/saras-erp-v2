import { useEffect, useState } from 'react'
import { Modal } from './ui'

// Global keyboard cheatsheet. Pops up on Ctrl+/ (or Cmd+/ on Mac).

const SHORTCUTS = [
  { group: 'Search & navigation', items: [
    { keys: ['Ctrl', 'K'], desc: 'Open global search' },
    { keys: ['Ctrl', 'F'], desc: 'Focus current page search / filter' },
    { keys: ['Ctrl', '/'], desc: 'Show this cheatsheet' },
    { keys: ['Esc'],       desc: 'Close any open modal / dialog' },
    { keys: ['↑', '↓'],    desc: 'Move selection in Cmd+K results' },
    { keys: ['⏎'],         desc: 'Open the selected record' },
  ]},
  { group: 'Create new', items: [
    { keys: ['Ctrl', 'N'],          desc: 'New order (from Cmd+K empty state)' },
    { keys: ['Ctrl', 'Shift', 'N'], desc: 'New enquiry' },
  ]},
  { group: 'Cmd+K shortcuts', items: [
    { keys: ['ord 0412'],  desc: 'Jump to ORD-0412' },
    { keys: ['inv 0203'],  desc: 'Jump to INV-0203' },
    { keys: ['enq 0034'],  desc: 'Jump to ENQ-0034' },
    { keys: ['chn 0089'],  desc: 'Jump to CHN-0089 (challan)' },
    { keys: ['pay 0067'],  desc: 'Jump to PAY-0067' },
    { keys: ['overdue'],   desc: 'Overdue orders' },
    { keys: ['pending payment'], desc: 'Orders with unpaid balance' },
    { keys: ['due today'], desc: 'Orders due today' },
  ]},
]

const Kbd = ({ children }) => (
  <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 text-[11px] font-semibold font-mono bg-white border border-slate-200 rounded-md shadow-sm text-slate-700">
    {children}
  </kbd>
)

export default function ShortcutsModal() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e) => {
      // Ctrl+/ or Cmd+/ — opens the cheatsheet
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts" size="lg">
      <div className="space-y-5">
        {SHORTCUTS.map((g) => (
          <section key={g.group}>
            <h3 className="text-[11px] font-bold tracking-wider uppercase text-slate-400 mb-2">{g.group}</h3>
            <ul className="space-y-1.5">
              {g.items.map((it, i) => (
                <li key={i} className="flex items-center justify-between py-1">
                  <span className="text-[13px] text-slate-700">{it.desc}</span>
                  <span className="flex items-center gap-1">
                    {it.keys.map((k, j) => (<Kbd key={j}>{k}</Kbd>))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-[11px] text-slate-400 pt-3 border-t border-slate-100">
          Tip: <Kbd>Ctrl</Kbd>+<Kbd>/</Kbd> toggles this cheatsheet any time.
        </p>
      </div>
    </Modal>
  )
}
