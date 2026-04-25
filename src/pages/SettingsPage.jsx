import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Button, Input, Select, Textarea, PhotoUpload, Tabs } from '../components/ui'
import { supabase, uploadPhoto, deletePhoto } from '../lib/supabase'
import { safe } from '../lib/db'
import { Settings, Building2, Package, Printer, Percent } from 'lucide-react'

export default function SettingsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [activeTab, setActiveTab] = useState(0)

  // Company Profile
  const [companyName, setCompanyName] = useState('')
  const [gstin, setGstin] = useState('')
  const [pan, setPan] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [logoUrl, setLogoUrl] = useState('')

  // Order Settings
  const [defaultOrderType, setDefaultOrderType] = useState('standard')
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState('net30')
  const [orderNumberFormat, setOrderNumberFormat] = useState('ORD-YYYY-MM-[SEQ]')

  // Price Summary Config
  const [priceSummaryFields, setPriceSummaryFields] = useState({
    subtotal: true,
    charges: true,
    itemDiscount: true,
    orderDiscount: true,
    taxable: true,
    cgst: true,
    sgst: true,
    igst: true,
    total: true,
  })

  // Print Settings
  const [printLetterhead, setPrintLetterhead] = useState(true)
  const [printTermsConditions, setPrintTermsConditions] = useState('')

  // GST Settings
  const [gstCompanyStateCode, setGstCompanyStateCode] = useState('')
  const [defaultCgstRate, setDefaultCgstRate] = useState('9')
  const [defaultSgstRate, setDefaultSgstRate] = useState('9')
  const [defaultIgstRate, setDefaultIgstRate] = useState('18')
  const [autoSplitGst, setAutoSplitGst] = useState(true)

  useEffect(() => {
    if (user?.id) fetchProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const fetchProfile = async () => {
    setIsLoading(true)
    try {
      // Wrap with safe() so this respects the 30s timeout + authGate
      // pre-warm. Without it, a stalled Postgres connection blocks the
      // entire page on Loading… forever.
      const { data, error } = await safe(() =>
        supabase.from('profiles').select('*').eq('id', user.id).single()
      )

      if (error) throw error

      if (data) {
        setCompanyName(data.company_name || '')
        setGstin(data.gstin || '')
        setPan(data.pan || '')
        setAddress(data.address || '')
        setCity(data.city || '')
        setState(data.state || '')
        setStateCode(data.state_code || '')
        setPhone(data.phone || '')
        setEmail(data.email || '')
        setLogoUrl(data.logo_url || '')
        setDefaultOrderType(data.default_order_type || 'standard')
        setDefaultPaymentTerms(data.default_payment_terms || 'net30')
        setOrderNumberFormat(data.order_number_format || 'ORD-YYYY-MM-[SEQ]')
        setPriceSummaryFields(data.price_summary_fields || priceSummaryFields)
        setPrintLetterhead(data.print_letterhead !== false)
        setPrintTermsConditions(data.print_terms_conditions || '')
        setGstCompanyStateCode(data.gst_company_state_code || '')
        setDefaultCgstRate(data.default_cgst_rate || '9')
        setDefaultSgstRate(data.default_sgst_rate || '9')
        setDefaultIgstRate(data.default_igst_rate || '18')
        setAutoSplitGst(data.auto_split_gst !== false)
      }
    } catch (err) {
      toast.error('Failed to load settings')
      if (import.meta.env.DEV) console.error(err)
    }
    setIsLoading(false)
  }

  const handleLogoUpload = async (file) => {
    setIsUploadingLogo(true)
    try {
      // Delete old logo if exists
      if (logoUrl) {
        const oldPath = logoUrl.split('/').pop()
        await deletePhoto('company-logos', `${user.id}/${oldPath}`).catch(() => {})
      }

      // Upload new logo
      const url = await uploadPhoto('company-logos', file, user.id)
      setLogoUrl(url)
      toast.success('Logo uploaded')
    } catch (err) {
      toast.error('Failed to upload logo')
      if (import.meta.env.DEV) console.error(err)
    }
    setIsUploadingLogo(false)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const { error } = await safe(() =>
        supabase.from('profiles').update({
          company_name: companyName,
          gstin,
          pan,
          address,
          city,
          state,
          state_code: stateCode,
          phone,
          email,
          logo_url: logoUrl,
          default_order_type: defaultOrderType,
          default_payment_terms: defaultPaymentTerms,
          order_number_format: orderNumberFormat,
          price_summary_fields: priceSummaryFields,
          print_letterhead: printLetterhead,
          print_terms_conditions: printTermsConditions,
          gst_company_state_code: gstCompanyStateCode,
          default_cgst_rate: defaultCgstRate,
          default_sgst_rate: defaultSgstRate,
          default_igst_rate: defaultIgstRate,
          auto_split_gst: autoSplitGst,
        }).eq('id', user.id)
      )

      if (error) throw error
      toast.success('Settings saved')
    } catch (err) {
      toast.error('Failed to save settings')
      if (import.meta.env.DEV) console.error(err)
    }
    setIsSaving(false)
  }

  const togglePriceSummaryField = (field) => {
    setPriceSummaryFields(prev => ({ ...prev, [field]: !prev[field] }))
  }

  const indian_states = [
    { value: '', label: '— Select State —' },
    { value: 'AN', label: 'Andaman and Nicobar Islands (AN)' },
    { value: 'AP', label: 'Andhra Pradesh (AP)' },
    { value: 'AR', label: 'Arunachal Pradesh (AR)' },
    { value: 'AS', label: 'Assam (AS)' },
    { value: 'BR', label: 'Bihar (BR)' },
    { value: 'CG', label: 'Chhattisgarh (CG)' },
    { value: 'CH', label: 'Chandigarh (CH)' },
    { value: 'DL', label: 'Delhi (DL)' },
    { value: 'GA', label: 'Goa (GA)' },
    { value: 'GJ', label: 'Gujarat (GJ)' },
    { value: 'HR', label: 'Haryana (HR)' },
    { value: 'HP', label: 'Himachal Pradesh (HP)' },
    { value: 'JK', label: 'Jammu and Kashmir (JK)' },
    { value: 'JH', label: 'Jharkhand (JH)' },
    { value: 'KA', label: 'Karnataka (KA)' },
    { value: 'KL', label: 'Kerala (KL)' },
    { value: 'LD', label: 'Laddakh (LD)' },
    { value: 'MP', label: 'Madhya Pradesh (MP)' },
    { value: 'MH', label: 'Maharashtra (MH)' },
    { value: 'MN', label: 'Manipur (MN)' },
    { value: 'ML', label: 'Meghalaya (ML)' },
    { value: 'MZ', label: 'Mizoram (MZ)' },
    { value: 'NL', label: 'Nagaland (NL)' },
    { value: 'OD', label: 'Odisha (OD)' },
    { value: 'PY', label: 'Puducherry (PY)' },
    { value: 'PB', label: 'Punjab (PB)' },
    { value: 'RJ', label: 'Rajasthan (RJ)' },
    { value: 'SK', label: 'Sikkim (SK)' },
    { value: 'TN', label: 'Tamil Nadu (TN)' },
    { value: 'TR', label: 'Tripura (TR)' },
    { value: 'UP', label: 'Uttar Pradesh (UP)' },
    { value: 'UT', label: 'Uttarakhand (UT)' },
    { value: 'WB', label: 'West Bengal (WB)' },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-100 border-t-indigo-600 rounded-full mx-auto" style={{ animation: 'spin 0.6s linear infinite' }} />
          <p className="mt-3 text-sm text-slate-400 font-medium">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Settings size={24} className="text-indigo-600" /> Settings
          </h1>
          <p className="text-sm text-slate-500 mt-1">Configure company profile, orders, pricing, and GST settings</p>
        </div>
        <Button onClick={handleSave} loading={isSaving}>Save Changes</Button>
      </div>

      <Tabs
        tabs={[
          {
            label: 'Company Profile',
            content: (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Company Name" required value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g., Saras Textiles" />
                  <Input label="GSTIN" value={gstin} onChange={e => setGstin(e.target.value)} placeholder="27XXXXX0000X1Z5" />
                  <Input label="PAN" value={pan} onChange={e => setPan(e.target.value)} placeholder="AAAPL0000A" />
                  <Select label="State" options={indian_states} value={stateCode} onChange={e => setStateCode(e.target.value)} />
                </div>

                <Textarea label="Address" value={address} onChange={e => setAddress(e.target.value)} placeholder="Street address" rows={3} />

                <div className="grid grid-cols-3 gap-4">
                  <Input label="City" value={city} onChange={e => setCity(e.target.value)} placeholder="e.g., Surat" />
                  <Input label="Phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 9999999999" />
                  <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="info@company.com" />
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <label className="text-[13px] font-medium text-slate-600 block mb-3">Company Logo</label>
                  {logoUrl && (
                    <div className="mb-4 relative w-24 h-24 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                      <img src={logoUrl} alt="Company logo" className="w-full h-full object-contain p-2" />
                      <button
                        onClick={() => setLogoUrl('')}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  <PhotoUpload onUpload={handleLogoUpload} isLoading={isUploadingLogo} />
                </div>
              </div>
            ),
          },
          {
            label: 'Order Settings',
            content: (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="Default Order Type"
                    options={[
                      { value: 'standard', label: 'Standard' },
                      { value: 'rush', label: 'Rush' },
                      { value: 'sample', label: 'Sample' },
                    ]}
                    value={defaultOrderType}
                    onChange={e => setDefaultOrderType(e.target.value)}
                  />
                  <Select
                    label="Default Payment Terms"
                    options={[
                      { value: 'net30', label: 'Net 30' },
                      { value: 'net60', label: 'Net 60' },
                      { value: 'cod', label: 'Cash on Delivery' },
                      { value: 'advance', label: 'Full Advance' },
                    ]}
                    value={defaultPaymentTerms}
                    onChange={e => setDefaultPaymentTerms(e.target.value)}
                  />
                </div>

                <Input
                  label="Order Number Format"
                  value={orderNumberFormat}
                  onChange={e => setOrderNumberFormat(e.target.value)}
                  placeholder="e.g., ORD-YYYY-MM-[SEQ]"
                />
                <p className="text-xs text-slate-400">Use [SEQ] for sequential numbering, YYYY/MM/DD for date patterns</p>

                <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4">
                  <p className="text-sm font-medium text-slate-700 mb-2">Preview:</p>
                  <p className="font-mono text-sm text-indigo-600">ORD-2026-04-00001</p>
                </div>
              </div>
            ),
          },
          {
            label: 'Price Summary',
            content: (
              <div className="space-y-4">
                <p className="text-sm text-slate-600 mb-4">Choose which fields to display in the price summary</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: 'subtotal', label: 'Subtotal' },
                    { key: 'charges', label: 'Charges' },
                    { key: 'itemDiscount', label: 'Item Discount' },
                    { key: 'orderDiscount', label: 'Order Discount' },
                    { key: 'taxable', label: 'Taxable Amount' },
                    { key: 'cgst', label: 'CGST' },
                    { key: 'sgst', label: 'SGST' },
                    { key: 'igst', label: 'IGST' },
                    { key: 'total', label: 'Total' },
                  ].map(field => (
                    <label key={field.key} className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-slate-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={priceSummaryFields[field.key]}
                        onChange={() => togglePriceSummaryField(field.key)}
                        className="w-4 h-4 rounded border-slate-200 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm font-medium text-slate-600">{field.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ),
          },
          {
            label: 'Print Settings',
            content: (
              <div className="space-y-5">
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-slate-50 transition-colors border border-slate-100">
                  <input
                    type="checkbox"
                    checked={printLetterhead}
                    onChange={e => setPrintLetterhead(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-200 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-700">Print Letterhead</p>
                    <p className="text-xs text-slate-400 mt-0.5">Include company header on printed documents</p>
                  </div>
                </label>

                <Textarea
                  label="Terms & Conditions"
                  value={printTermsConditions}
                  onChange={e => setPrintTermsConditions(e.target.value)}
                  placeholder="Enter your standard terms and conditions..."
                  rows={6}
                />

                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4">
                  <p className="text-xs font-medium text-amber-700 uppercase tracking-wider">Note</p>
                  <p className="text-xs text-amber-600 mt-1">Logo from Company Profile section will be used for print</p>
                </div>
              </div>
            ),
          },
          {
            label: 'GST Settings',
            content: (
              <div className="space-y-5">
                <Select
                  label="Company State (for GST)"
                  options={indian_states}
                  value={gstCompanyStateCode}
                  onChange={e => setGstCompanyStateCode(e.target.value)}
                />

                <div className="grid grid-cols-3 gap-4">
                  <Input
                    label="Default CGST Rate (%)"
                    type="number"
                    step="0.01"
                    value={defaultCgstRate}
                    onChange={e => setDefaultCgstRate(e.target.value)}
                  />
                  <Input
                    label="Default SGST Rate (%)"
                    type="number"
                    step="0.01"
                    value={defaultSgstRate}
                    onChange={e => setDefaultSgstRate(e.target.value)}
                  />
                  <Input
                    label="Default IGST Rate (%)"
                    type="number"
                    step="0.01"
                    value={defaultIgstRate}
                    onChange={e => setDefaultIgstRate(e.target.value)}
                  />
                </div>

                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-slate-50 transition-colors border border-slate-100">
                  <input
                    type="checkbox"
                    checked={autoSplitGst}
                    onChange={e => setAutoSplitGst(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-200 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-700">Auto-Split GST</p>
                    <p className="text-xs text-slate-400 mt-0.5">Automatically split CGST/SGST for same state, use IGST for inter-state</p>
                  </div>
                </label>

                <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4">
                  <p className="text-xs font-medium text-blue-700 uppercase tracking-wider">GST Configuration</p>
                  <div className="text-xs text-blue-600 mt-2 space-y-1">
                    <p>State Code: {gstCompanyStateCode || '-'}</p>
                    <p>CGST: {defaultCgstRate}% | SGST: {defaultSgstRate}% | IGST: {defaultIgstRate}%</p>
                  </div>
                </div>
              </div>
            ),
          },
        ]}
        defaultTab={activeTab}
        onChange={setActiveTab}
      />
    </div>
  )
}
