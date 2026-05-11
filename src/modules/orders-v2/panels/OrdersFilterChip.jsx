/**
 * <OrdersFilterChip> — reusable toggle chip for the Orders V2 navRail.
 *
 * Looks like a pill. Renders three visual states:
 *   - default (inactive)
 *   - active   (selected — indigo fill)
 *   - count    (active + numeric badge on the right)
 *
 * Why not a generic `<Chip>` in `components/ui`? Because the filter chips
 * sit close to the surrounding shell visual language and need to stay light.
 * If a second module wants the same chip shape later, lift it then.
 */

import { X } from 'lucide-react'

/**
 * @param {object} props
 * @param {boolean} [props.active]
 * @param {() => void} props.onClick
 * @param {number|string} [props.count]
 * @param {() => void} [props.onRemove]   — when set, shows an `×` button at the right
 * @param {React.ReactNode} props.children
 * @param {string} [props.title]
 */
export default function OrdersFilterChip({
  active = false,
  onClick,
  count,
  onRemove,
  children,
  title,
}) {
  const base = 'group inline-flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition'
  const variants = active
    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700'
    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 active:bg-slate-200'

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`${base} ${variants}`}
    >
      <span className="truncate text-left">{children}</span>
      <span className="flex items-center gap-1 shrink-0">
        {count != null && (
          <span
            className={
              active
                ? 'rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums'
                : 'rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600'
            }
          >
            {count}
          </span>
        )}
        {onRemove && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Remove"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onRemove()
              }
            }}
            className={
              active
                ? 'rounded p-0.5 text-white/70 hover:bg-white/15 hover:text-white cursor-pointer'
                : 'rounded p-0.5 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-200 hover:text-slate-700 cursor-pointer'
            }
          >
            <X size={11} />
          </span>
        )}
      </span>
    </button>
  )
}
