import { useApp } from '../../contexts/AppContext'
import SimpleMasterPage from './_SimpleMasterPage'
import { processTypes } from '../../lib/db'

export default function ProcessTypesPage() {
  const { machineTypes } = useApp()
  return (
    <SimpleMasterPage
      title="Process Types"
      subtitle="process steps"
      api={processTypes}
      defaults={{ name: '', hindi_name: '', sequence_order: 0, requires_machine: true, is_optional: false, is_active: true }}
      fields={[
        { key: 'name', label: 'Name', required: true, placeholder: 'Braiding' },
        { key: 'hindi_name', label: 'Hindi Name', placeholder: 'ब्रेडिंग' },
        { key: 'sequence_order', label: 'Sequence #', type: 'number', required: true },
        { key: 'default_duration_per_kg_mins', label: 'Default min/kg', type: 'number' },
        { key: 'default_machine_type_id', label: 'Default Machine', type: 'select', options: (machineTypes || []).map(m => ({ value: m.id, label: m.name })), showInList: false },
        { key: 'requires_machine', label: 'Requires machine', type: 'checkbox' },
        { key: 'is_optional', label: 'Optional step', type: 'checkbox' },
        { key: 'description', label: 'Description', type: 'textarea', showInList: false },
        { key: 'is_active', label: 'Active', type: 'checkbox', showInList: false },
      ]}
    />
  )
}
