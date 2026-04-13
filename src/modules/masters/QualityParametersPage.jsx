import SimpleMasterPage from './_SimpleMasterPage'
import { qualityParameters } from '../../lib/db'

export default function QualityParametersPage() {
  return (
    <SimpleMasterPage
      title="Quality Parameters"
      subtitle="QC checks"
      api={qualityParameters}
      defaults={{ name: '', is_mandatory: false, active: true }}
      fields={[
        { key: 'name', label: 'Parameter', required: true, placeholder: 'Tensile strength' },
        { key: 'unit', label: 'Unit', placeholder: 'N / kg / mm' },
        { key: 'min_value', label: 'Min Value', type: 'number' },
        { key: 'max_value', label: 'Max Value', type: 'number' },
        { key: 'test_method', label: 'Test Method', showInList: false },
        { key: 'is_mandatory', label: 'Mandatory', type: 'checkbox' },
        { key: 'active', label: 'Active', type: 'checkbox', showInList: false },
      ]}
    />
  )
}
