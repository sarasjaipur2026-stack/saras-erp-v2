import SimpleMasterPage from './_SimpleMasterPage'
import { chaalTypes } from '../../lib/db'

export default function ChaalTypesPage() {
  return (
    <SimpleMasterPage
      title="Chaal Types"
      subtitle="braid patterns"
      cacheKey="chaalTypes"
      api={chaalTypes}
      defaults={{ name: '', hindi_name: '', speed_factor: 1, is_active: true }}
      fields={[
        { key: 'name', label: 'Name', required: true, placeholder: 'Seedhi' },
        { key: 'hindi_name', label: 'Hindi Name', placeholder: 'सीधी' },
        { key: 'speed_factor', label: 'Speed Factor', type: 'number', placeholder: '1.0' },
        { key: 'description', label: 'Description', type: 'textarea', showInList: false },
        { key: 'is_active', label: 'Active', type: 'checkbox', showInList: false },
      ]}
    />
  )
}
