import SimpleMasterPage from './_SimpleMasterPage'
import { hsnCodes } from '../../lib/db'

export default function HsnCodesPage() {
  return (
    <SimpleMasterPage
      title="HSN Codes"
      subtitle="tax codes"
      api={hsnCodes}
      defaults={{ code: '', description: '', cgst_pct: 0, sgst_pct: 0, igst_pct: 0, cess_pct: 0, category: '', is_active: true }}
      fields={[
        { key: 'code', label: 'HSN Code', required: true, placeholder: '5607' },
        { key: 'category', label: 'Category', placeholder: 'cordage / yarn / elastic' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'cgst_pct', label: 'CGST %', type: 'number' },
        { key: 'sgst_pct', label: 'SGST %', type: 'number' },
        { key: 'igst_pct', label: 'IGST %', type: 'number' },
        { key: 'cess_pct', label: 'Cess %', type: 'number', showInList: false },
        { key: 'is_active', label: 'Active', type: 'checkbox', colSpan: 2, showInList: false },
      ]}
    />
  )
}
