import SimpleMasterPage from './_SimpleMasterPage'
import { machineTypes } from '../../lib/db'

export default function MachineTypesPage() {
  return (
    <SimpleMasterPage
      title="Machine Types"
      subtitle="machine types"
      api={machineTypes}
      defaults={{ name: '', machine_type: 'round', spindle_count: null, default_carriers: null, default_speed_m_per_min: null, hourly_cost: null, machine_count: 1, active: true }}
      fields={[
        { key: 'name', label: 'Name', required: true, placeholder: 'Round 24 carrier' },
        { key: 'custom_number', label: 'Tag / Number', placeholder: 'M-01' },
        { key: 'machine_type', label: 'Kind', type: 'select', options: ['round', 'flat', 'choti', 'rope', 'winder', 'other'] },
        { key: 'spindle_count', label: 'Spindles', type: 'number' },
        { key: 'default_carriers', label: 'Default Carriers', type: 'number' },
        { key: 'default_speed_m_per_min', label: 'Speed (m/min)', type: 'number' },
        { key: 'motor_power_hp', label: 'Motor HP', type: 'number', showInList: false },
        { key: 'machine_width_mm', label: 'Width (mm)', type: 'number', showInList: false },
        { key: 'rpm_min', label: 'RPM Min', type: 'number', showInList: false },
        { key: 'rpm_max', label: 'RPM Max', type: 'number', showInList: false },
        { key: 'hourly_cost', label: 'Hourly Cost ₹', type: 'number', showInList: false },
        { key: 'machine_count', label: 'Qty of Machines', type: 'number', showInList: false },
        { key: 'active', label: 'Active', type: 'checkbox', showInList: false },
      ]}
    />
  )
}
