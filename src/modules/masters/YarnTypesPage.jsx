import { useApp } from '../../contexts/AppContext'
import SimpleMasterPage from './_SimpleMasterPage'
import { yarnTypes } from '../../lib/db'

export default function YarnTypesPage() {
  const { hsnCodes, colors } = useApp()
  return (
    <SimpleMasterPage
      title="Yarn Types"
      subtitle="yarn types"
      api={yarnTypes}
      defaults={{ name: '', yarn_category: 'polyester_dty', usage_type: 'both', active: true }}
      fields={[
        { key: 'name', label: 'Name', required: true, placeholder: '150/48 Polyester DTY' },
        { key: 'yarn_category', label: 'Category', type: 'select', required: true, options: ['cotton','polycotton','polyester_dty','spun_polyester','spun_viscose','shoddy','filler','elastic','nylon','pp','custom'] },
        { key: 'count_or_denier', label: 'Count / Denier', placeholder: '150D or 30s' },
        { key: 'usage_type', label: 'Usage', type: 'select', options: ['covering','filler','both'] },
        { key: 'default_rate_per_kg', label: 'Default ₹/kg', type: 'number' },
        { key: 'min_order_qty', label: 'MOQ (kg)', type: 'number', showInList: false },
        { key: 'hsn_code_id', label: 'HSN', type: 'select', options: (hsnCodes || []).map(h => ({ value: h.id, label: h.code })), showInList: false },
        { key: 'color_id', label: 'Default Color', type: 'select', options: (colors || []).map(c => ({ value: c.id, label: c.name })), showInList: false },
        { key: 'active', label: 'Active', type: 'checkbox', showInList: false },
      ]}
    />
  )
}
