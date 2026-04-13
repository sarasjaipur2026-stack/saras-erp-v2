import { useApp } from '../../contexts/AppContext'
import { DataTable, Badge } from '../../components/ui'

export default function MachinesPage() {
  const { machines } = useApp()

  const columns = [
    { key: 'code', label: 'Code', render: v => <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-semibold">{v}</span> },
    { key: 'name', label: 'Name', render: (_, r) => <div><div className="font-medium text-slate-700 text-[13px]">{r.name}</div>{r.name_hi && <div className="text-[11px] text-slate-400 mt-0.5">{r.name_hi}</div>}</div> },
    { key: 'spindles', label: 'Spindles', render: v => <Badge variant="primary">{v}</Badge> },
    { key: 'products', label: 'Products', render: v => <div className="flex flex-wrap gap-1">{(v || []).map(p => <Badge key={p} variant="default">{p}</Badge>)}</div> },
    { key: 'count', label: 'Count', render: v => v || 1 },
  ]

  return (
    <div className="fade-in max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Machines</h1>
        <p className="text-[13px] text-slate-400 mt-0.5">{machines.length} machine types configured</p>
      </div>
      <DataTable columns={columns} data={machines} emptyMessage="No machines" />
    </div>
  )
}
