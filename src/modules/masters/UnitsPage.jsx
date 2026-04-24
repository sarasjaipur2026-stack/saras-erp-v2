import SimpleMasterPage from './_SimpleMasterPage'
import { units } from '../../lib/db'

export default function UnitsPage() {
  return (
    <SimpleMasterPage
      title="Units"
      subtitle="units of measure"
      cacheKey="units"
      api={units}
      defaults={{ name: '', symbol: '', unit_type: 'length', conversion_factor: 1, is_base_unit: false, is_active: true }}
      fields={[
        { key: 'name', label: 'Name', required: true, placeholder: 'Meter' },
        { key: 'symbol', label: 'Symbol', required: true, placeholder: 'm' },
        { key: 'unit_type', label: 'Type', type: 'select', required: true, options: ['length', 'weight', 'quantity'] },
        { key: 'conversion_factor', label: 'Conversion Factor', type: 'number', placeholder: '1.0' },
        { key: 'is_base_unit', label: 'Base unit', type: 'checkbox' },
        { key: 'is_active', label: 'Active', type: 'checkbox', showInList: false },
      ]}
    />
  )
}
