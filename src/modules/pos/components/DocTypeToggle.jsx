/**
 * DocTypeToggle — flips between Tax Invoice and Bill of Supply.
 * Walk-in defaults to Bill of Supply; registered defaults to Tax Invoice.
 * Cashier can override per sale.
 */

export default function DocTypeToggle({ value, onChange, customer }) {
  const isTax = value === 'tax_invoice'
  return (
    <div className="text-[10px] flex items-center gap-1.5">
      <span className="text-slate-400">Doc:</span>
      <button
        onClick={() => onChange(isTax ? 'bill_of_supply' : 'tax_invoice')}
        className={`px-2 py-0.5 rounded-md font-semibold transition-colors ${isTax ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'}`}
        title="Click to flip"
      >
        {isTax ? 'Tax Invoice' : 'Bill of Supply'}
      </button>
      {!customer?.gstin && isTax && (
        <span className="text-[9px] text-amber-600">(no GSTIN on customer)</span>
      )}
    </div>
  )
}
