import { useApp } from '../../contexts/AppContext'
import SimpleMasterPage from './_SimpleMasterPage'
import { productTypes } from '../../lib/db'

export default function ProductTypesPage() {
  const { chaalTypes, hsnCodes, units } = useApp()
  return (
    <SimpleMasterPage
      title="Product Types"
      subtitle="product types"
      api={productTypes}
      defaults={{ name: '', code: '', category: 'round_cord', requires_filler: false, default_waste_pct: 5, is_active: true }}
      fields={[
        { key: 'name', label: 'Name', required: true, placeholder: 'Round Cord 5mm' },
        { key: 'code', label: 'Code', placeholder: 'RC-5' },
        { key: 'category', label: 'Category', type: 'select', options: ['hollow_cord','round_cord','flat_elastic','round_elastic','braided_tape','choti','drawcord','rope','khajuri','paracord','shoelace','custom'] },
        { key: 'requires_filler', label: 'Requires filler', type: 'checkbox' },
        { key: 'default_chaal_id', label: 'Default Chaal', type: 'select', options: (chaalTypes || []).map(c => ({ value: c.id, label: c.name })) },
        { key: 'default_waste_pct', label: 'Default Waste %', type: 'number' },
        { key: 'hsn_code_id', label: 'HSN Code', type: 'select', options: (hsnCodes || []).map(h => ({ value: h.id, label: `${h.code} — ${h.description || ''}` })), showInList: false },
        { key: 'default_unit_id', label: 'Default Unit', type: 'select', options: (units || []).map(u => ({ value: u.id, label: `${u.name} (${u.symbol})` })), showInList: false },
        { key: 'description', label: 'Description', type: 'textarea', showInList: false },
        { key: 'is_active', label: 'Active', type: 'checkbox', showInList: false },
      ]}
    />
  )
}
