import { useApp } from '../../contexts/AppContext'
import { DataTable, Badge } from '../../components/ui'

export default function MachinesPage() {
  const { machines } = useApp()

  const columns = [
    { key: 'code', label: 'Code', render: v => <span className="font-mono font-medium">{v}</span> },
    { key: 'name', label: 'Name', render: (_, r) => <div><div>{r.name}</div>{r.name_hi && <div className="text-xs text-slate-400">{r.name_hi}</div>}</div> },
    { key: 'spindles', label: 'Spindles', render: v => <Badge variant="primary">{v}</Badge> },
    { key: 'products', label: 'Products', render: v => <div className="flex flex-wrap gap-1">{(v||[]).map(p => <Badge key={p} variant="default" size="xs">{p}</Badge>)}</div> },
    { key: 'count', label: 'Count', render: v => v || 1 },
  ]

  return (
    <div className="fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Machines</h1>
        <p className="text-sm text-slate-500">{machines.length} machine types configured</p>
      </div>
      <DataTable columns={columns} data={machines} emptyTitle="No machines" />
    </div>
  )
}