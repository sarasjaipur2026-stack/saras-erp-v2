import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { enquiries } from '../../lib/db'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, DataTable, Tabs, StatusBadge } from '../../components/ui'
import { Plus, CheckCircle, XCircle, MessageSquare } from 'lucide-react'

export default function EnquiriesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { if (user?.id) fetchData() }, [user?.id])

  const fetchData = async () => {
    setIsLoading(true)
    const { data, error } = await enquiries.list(user.id)
    if (error) toast.error('Failed to load enquiries')
    else setList(data || [])
    setIsLoading(false)
  }

  const handleConvert = async (e, row) => {
    e.stopPropagation()
    const { error } = await enquiries.convertToOrder(row.id)
    if (error) toast.error('Failed to convert')
    else { toast.success('Converted to order'); fetchData() }
  }

  const handleMarkLost = async (e, id) => {
    e.stopPropagation()
    const { error } = await enquiries.update(id, { status: 'lost' })
    if (error) toast.error('Failed to update')
    else { toast.success('Marked as lost'); fetchData() }
  }

  const filtered = statusFilter === 'all' ? list : list.filter(e => e.status === statusFilter)

  const columns = [
    { key: 'enquiry_number', label: 'Enquiry #', render: v => <span className="font-mono font-semibold text-indigo-600">{v || '-'}</span> },
    { key: 'customer', label: 'Customer', render: (_, row) => (
      <div>
        <div className="font-medium text-slate-800">{row.customers?.contact_name || '-'}</div>
        <div className="text-xs text-slate-400">{row.customers?.firm_name}</div>
      </div>
    )},
    { key: 'products_required', label: 'Products', render: v => <span className="text-sm text-slate-600 truncate max-w-[200px] block">{v || '-'}</span> },
    { key: 'quoted_rate', label: 'Rate', render: v => v ? `₹${v}` : '-' },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'actions', label: '', render: (_, row) => (
      row.status !== 'converted' && row.status !== 'lost' ? (
        <div className="flex gap-1">
          <button onClick={(e) => handleConvert(e, row)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors" title="Convert to Order">
            <CheckCircle size={16} />
          </button>
          <button onClick={(e) => handleMarkLost(e, row.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Mark Lost">
            <XCircle size={16} />
          </button>
        </div>
      ) : null
    )},
  ]

  return (
    <div className="fade-in max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Enquiries</h1>
          <p className="text-sm text-slate-500">{list.length} total enquiries</p>
        </div>
        <Button onClick={() => navigate('/enquiries/new')}>
          <Plus size={16} /> New Enquiry
        </Button>
      </div>

      <Tabs
        tabs={[{ label: 'All' }, { label: 'New' }, { label: 'Follow Up' }, { label: 'Quoted' }]}
        defaultTab={0}
        onChange={(idx) => setStatusFilter({ 0: 'all', 1: 'new', 2: 'follow_up', 3: 'quoted' }[idx])}
      />

      <div className="mt-4">
        <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No enquiries found" />
      </div>
    </div>
  )
}
