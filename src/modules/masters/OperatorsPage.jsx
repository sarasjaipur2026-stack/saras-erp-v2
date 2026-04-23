import SimpleMasterPage from './_SimpleMasterPage'
import { operators } from '../../lib/db'

export default function OperatorsPage() {
  return (
    <SimpleMasterPage
      title="Operators"
      subtitle="shop-floor operators"
      api={operators}
      defaults={{ name: '', role: 'operator', shift: 'day', is_active: true }}
      fields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'phone', label: 'Phone' },
        { key: 'role', label: 'Role', type: 'select', options: ['operator', 'helper', 'supervisor'] },
        { key: 'shift', label: 'Shift', type: 'select', options: ['day', 'night', 'both'] },
        { key: 'daily_wage', label: 'Daily Wage ₹', type: 'number' },
        { key: 'joining_date', label: 'Joining Date', type: 'date', showInList: false },
        { key: 'is_active', label: 'Active', type: 'checkbox', showInList: false },
      ]}
    />
  )
}
