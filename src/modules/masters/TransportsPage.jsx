import SimpleMasterPage from './_SimpleMasterPage'
import { transports } from '../../lib/db'

export default function TransportsPage() {
  return (
    <SimpleMasterPage
      title="Transports"
      subtitle="vehicles / transporters"
      api={transports}
      defaults={{ vehicle_type: 'tempo', is_active: true }}
      fields={[
        { key: 'vehicle_number', label: 'Vehicle Number', required: true, placeholder: 'RJ14-XX-1234' },
        { key: 'vehicle_type', label: 'Type', type: 'select', options: ['tempo','truck','courier','self','other'] },
        { key: 'transporter_name', label: 'Transporter Name' },
        { key: 'driver_name', label: 'Driver Name' },
        { key: 'driver_phone', label: 'Driver Phone' },
        { key: 'is_active', label: 'Active', type: 'checkbox', showInList: false },
      ]}
    />
  )
}
