import SimpleMasterPage from './_SimpleMasterPage'
import { packagingTypes } from '../../lib/db'

export default function PackagingTypesPage() {
  return (
    <SimpleMasterPage
      title="Packaging Types"
      subtitle="packaging"
      api={packagingTypes}
      defaults={{ name: '', is_active: true }}
      fields={[
        { key: 'name', label: 'Name', required: true, placeholder: 'Polybag 12x18' },
        { key: 'weight_grams', label: 'Weight (g)', type: 'number' },
        { key: 'cost_per_unit', label: 'Cost ₹/unit', type: 'number' },
        { key: 'dimensions', label: 'Dimensions', placeholder: '12x18 inch' },
        { key: 'is_active', label: 'Active', type: 'checkbox', showInList: false },
      ]}
    />
  )
}
