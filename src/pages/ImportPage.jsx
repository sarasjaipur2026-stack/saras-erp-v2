import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Button, Modal, Input, Select, DataTable, Spinner } from '../components/ui'
import { supabase } from '../lib/supabase'
import { Upload, FileText, Users, Package, Boxes, Palette, Truck, UserCheck, Calendar, Eye, AlertCircle } from 'lucide-react'
import * as Papa from 'papaparse'
// XLSX is lazy-loaded on first use to avoid 360KB in the initial bundle

const IMPORT_TYPES = [
  { id: 'customers', label: 'Customers', icon: Users, color: 'indigo' },
  { id: 'products', label: 'Products', icon: Package, color: 'blue' },
  { id: 'materials', label: 'Materials', icon: Boxes, color: 'amber' },
  { id: 'machines', label: 'Machines', icon: Boxes, color: 'purple' },
  { id: 'colors', label: 'Colors', icon: Palette, color: 'pink' },
  { id: 'suppliers', label: 'Suppliers', icon: Truck, color: 'green' },
  { id: 'brokers', label: 'Brokers', icon: UserCheck, color: 'cyan' },
]

const COLOR_MAP = {
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-600', icon: 'bg-indigo-100' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-600', icon: 'bg-blue-100' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-600', icon: 'bg-amber-100' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-100', text: 'text-purple-600', icon: 'bg-purple-100' },
  pink: { bg: 'bg-pink-50', border: 'border-pink-100', text: 'text-pink-600', icon: 'bg-pink-100' },
  green: { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-600', icon: 'bg-emerald-100' },
  cyan: { bg: 'bg-cyan-50', border: 'border-cyan-100', text: 'text-cyan-600', icon: 'bg-cyan-100' },
}

const TABLE_SCHEMAS = {
  customers: ['firm_name', 'contact_name', 'phone', 'email', 'city', 'address', 'gstin', 'pan', 'state_code', 'shipping_addresses', 'requires_advance', 'busy_code'],
  products: ['name', 'code', 'hsn_code', 'unit', 'default_rate', 'gst_rate', 'description', 'busy_code'],
  materials: ['name', 'code', 'unit', 'description', 'busy_code'],
  machines: ['name', 'code', 'description'],
  colors: ['name', 'code'],
  suppliers: ['firm_name', 'contact_name', 'phone', 'email', 'city', 'address', 'gstin', 'pan', 'busy_code'],
  brokers: ['name', 'phone', 'email', 'commission_rate', 'city'],
}

const BUSY_WIN_DEFAULTS = {
  customers: {
    'Party Name': 'firm_name',
    'Contact': 'contact_name',
    'Mobile': 'phone',
    'Email': 'email',
    'City': 'city',
    'GSTIN': 'gstin',
    'PAN': 'pan',
    'Address': 'address',
  },
  products: {
    'Item Name': 'name',
    'Item Code': 'code',
    'HSN': 'hsn_code',
    'Unit': 'unit',
    'Rate': 'default_rate',
    'GST%': 'gst_rate',
  },
  materials: {
    'Item Name': 'name',
    'Item Code': 'code',
    'Unit': 'unit',
  },
  suppliers: {
    'Party Name': 'firm_name',
    'Contact': 'contact_name',
    'Mobile': 'phone',
    'City': 'city',
    'GSTIN': 'gstin',
  },
}

// Sanitize a string value: trim, limit length, strip control chars
const sanitizeString = (val, maxLen = 500) => {
  if (typeof val !== 'string') return val
  return val.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').slice(0, maxLen)
}

export default function ImportPage() {
  const { user, isAdmin } = useAuth()
  const toast = useToast()

  // Admin-only gate
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8">
          <h2 className="text-lg font-bold text-amber-900 mb-2">Admin Only</h2>
          <p className="text-sm text-amber-700">Only administrators can import data. Contact your admin for access.</p>
        </div>
      </div>
    )
  }

  // Import flow state
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedType, setSelectedType] = useState(null)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [fullParsedData, setFullParsedData] = useState([])
  const [sourceHeaders, setSourceHeaders] = useState([])
  const [previewData, setPreviewData] = useState([])
  const [columnMapping, setColumnMapping] = useState({})
  const [showMapping, setShowMapping] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importLogs, setImportLogs] = useState([])
  const [recordCounts, setRecordCounts] = useState({})

  useEffect(() => {
    if (user?.id) {
      fetchImportLogs()
      fetchRecordCounts()
    }
  }, [user?.id])

  const fetchRecordCounts = async () => {
    try {
      const counts = {}
      const tableNames = Object.keys(TABLE_SCHEMAS)

      for (const tableName of tableNames) {
        const { count, error } = await supabase
          .from(tableName)
          .select('id', { count: 'exact', head: true })

        if (error) {
          if (import.meta.env.DEV) console.error(`Failed to fetch count for ${tableName}:`, error)
          counts[tableName] = 0
        } else {
          counts[tableName] = count || 0
        }
      }

      setRecordCounts(counts)
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to fetch record counts:', err)
    }
  }

  const fetchImportLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('import_log')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      setImportLogs(data || [])
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to fetch import logs:', err)
    }
  }

  const parseFile = async (file) => {
    return new Promise((resolve, reject) => {
      if (file.name.endsWith('.csv')) {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            resolve(results.data || [])
          },
          error: (error) => {
            reject(new Error(`CSV parsing error: ${error.message}`))
          },
        })
      } else if (file.name.endsWith('.xlsx')) {
        const reader = new FileReader()
        reader.onload = async (e) => {
          try {
            const XLSX = await import('xlsx')
            const data = new Uint8Array(e.target.result)
            const workbook = XLSX.read(data, { type: 'array' })
            const sheetName = workbook.SheetNames[0]
            const worksheet = workbook.Sheets[sheetName]
            const rows = XLSX.utils.sheet_to_json(worksheet)
            resolve(rows || [])
          } catch (error) {
            reject(new Error(`XLSX parsing error: ${error.message}`))
          }
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsArrayBuffer(file)
      } else {
        reject(new Error('Unsupported file format'))
      }
    })
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isValidType = file.name.endsWith('.csv') || file.name.endsWith('.xlsx')
    if (!isValidType) {
      toast.error('Please select a CSV or XLSX file')
      return
    }

    try {
      const parsed = await parseFile(file)
      if (parsed.length === 0) {
        toast.error('File is empty')
        return
      }

      const headers = Object.keys(parsed[0] || {})
      setUploadedFile(file)
      setFullParsedData(parsed)
      setSourceHeaders(headers)

      // Initialize column mapping by matching names
      const initialMapping = {}
      const targetColumns = TABLE_SCHEMAS[selectedType] || []

      targetColumns.forEach(targetCol => {
        const matched = headers.find(h => h.toLowerCase().trim() === targetCol.toLowerCase().trim())
        initialMapping[targetCol] = matched || ''
      })

      setColumnMapping(initialMapping)
      setShowMapping(true)
    } catch (err) {
      toast.error('Failed to parse file: ' + err.message)
      if (import.meta.env.DEV) console.error(err)
    }
  }

  const applyBusyWinDefaults = () => {
    const defaults = BUSY_WIN_DEFAULTS[selectedType] || {}
    const newMapping = { ...columnMapping }

    Object.entries(defaults).forEach(([busyWinName, dbColumn]) => {
      const matched = sourceHeaders.find(h => h === busyWinName)
      if (matched) {
        newMapping[dbColumn] = matched
      }
    })

    setColumnMapping(newMapping)
    toast.success('Busy Win defaults applied')
  }

  const handleProceedToPreview = () => {
    // Validate that at least one mapping is selected
    const hasAnyMapping = Object.values(columnMapping).some(v => v !== '')
    if (!hasAnyMapping) {
      toast.error('Please map at least one column')
      return
    }

    // Map the data using the column mapping
    const mappedRows = fullParsedData.map(row => {
      const mappedRow = {}
      Object.entries(columnMapping).forEach(([dbCol, sourceCol]) => {
        if (sourceCol !== '') {
          mappedRow[dbCol] = row[sourceCol] || ''
        }
      })
      return mappedRow
    })

    setPreviewData(mappedRows.slice(0, 5))
    setShowMapping(false)
    setShowPreview(true)
  }

  const handleConfirmImport = async () => {
    if (!uploadedFile || !selectedType || fullParsedData.length === 0) {
      toast.error('Please select a file and complete column mapping')
      return
    }

    setIsImporting(true)
    try {
      // Map all rows using column mapping
      const mappedRows = fullParsedData.map(row => {
        const mappedRow = {}
        Object.entries(columnMapping).forEach(([dbCol, sourceCol]) => {
          if (sourceCol !== '') {
            let value = row[sourceCol] || ''
            // Type conversion for specific fields
            if ((dbCol === 'default_rate' || dbCol === 'gst_rate' || dbCol === 'commission_rate') && value) {
              value = parseFloat(value) || value
            }
            if (dbCol === 'requires_advance' && typeof value === 'string') {
              value = value.toLowerCase() === 'true' || value === '1' || value === 'yes'
            }
            mappedRow[dbCol] = typeof value === 'string' ? sanitizeString(value) : value
          }
        })
        return mappedRow
      })

      // Clean up empty rows and remove fields with no mapping
      const cleanedRows = mappedRows.filter(row => {
        return Object.values(row).some(v => v !== '' && v !== null && v !== undefined)
      })

      // Guard: max 1000 rows per import to prevent abuse
      if (cleanedRows.length > 1000) {
        toast.error('Too many rows (max 1000 per import). Split your file and try again.')
        setIsImporting(false)
        return
      }

      if (cleanedRows.length === 0) {
        toast.error('No valid rows to import')
        setIsImporting(false)
        return
      }

      // Bulk insert into the target table
      const { error: insertError } = await supabase
        .from(selectedType)
        .insert(cleanedRows)

      if (insertError) throw insertError

      // Create import log entry
      const { error: logError } = await supabase
        .from('import_log')
        .insert({
          user_id: user.id,
          import_type: selectedType,
          filename: uploadedFile.name,
          record_count: cleanedRows.length,
          status: 'completed',
          created_at: new Date().toISOString(),
        })

      if (logError && import.meta.env.DEV) console.error('Failed to create import log:', logError)

      toast.success(`Successfully imported ${cleanedRows.length} ${selectedType}`)
      resetImportFlow()
      fetchImportLogs()
      fetchRecordCounts()
    } catch (err) {
      toast.error('Import failed: ' + err.message)
      if (import.meta.env.DEV) console.error(err)
    }
    setIsImporting(false)
  }

  const resetImportFlow = () => {
    setShowUploadModal(false)
    setUploadedFile(null)
    setFullParsedData([])
    setSourceHeaders([])
    setPreviewData([])
    setColumnMapping({})
    setShowMapping(false)
    setShowPreview(false)
    setSelectedType(null)
  }

  const handleOpenUpload = (typeId) => {
    setSelectedType(typeId)
    setUploadedFile(null)
    setFullParsedData([])
    setSourceHeaders([])
    setPreviewData([])
    setColumnMapping({})
    setShowMapping(false)
    setShowPreview(false)
    setShowUploadModal(true)
  }

  const getLastImportDate = (typeId) => {
    const log = importLogs.find(l => l.import_type === typeId)
    if (!log) return 'Never'
    return new Date(log.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <div className="fade-in max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Upload size={24} className="text-indigo-600" /> Import Data
        </h1>
        <p className="text-sm text-slate-500 mt-1">Import master data from Busy Win accounting software (.csv or .xlsx files)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {IMPORT_TYPES.map(type => {
          const Icon = type.icon
          const colors = COLOR_MAP[type.color]
          const count = recordCounts[type.id] || 0
          const lastImport = getLastImportDate(type.id)

          return (
            <div
              key={type.id}
              className={`${colors.bg} border ${colors.border} rounded-2xl p-5 transition-all duration-200 hover:shadow-md`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`${colors.icon} rounded-xl p-3`}>
                  <Icon size={20} className={colors.text} />
                </div>
                <button
                  onClick={() => handleOpenUpload(type.id)}
                  className={`px-3 py-1.5 rounded-lg ${colors.bg} border ${colors.border} hover:shadow-sm transition-all text-sm font-medium ${colors.text}`}
                >
                  Upload
                </button>
              </div>

              <h3 className="font-semibold text-slate-900 mb-3">{type.label}</h3>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <Calendar size={14} className="text-slate-400" />
                  <span>Last import: <span className="font-medium">{lastImport}</span></span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <FileText size={14} className="text-slate-400" />
                  <span>Records: <span className="font-medium">{count}</span></span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-6">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-base font-semibold text-slate-900">Recent Imports</h2>
        </div>

        {importLogs.length === 0 ? (
          <div className="py-12 text-center">
            <Upload size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-medium">No imports yet</p>
            <p className="text-xs text-slate-300 mt-1">Start by uploading your first data file</p>
          </div>
        ) : (
          <DataTable
            columns={[
              { key: 'import_type', label: 'Type', render: v => (
                <span className="font-medium text-slate-700 capitalize">{v}</span>
              )},
              { key: 'filename', label: 'Filename', render: v => (
                <span className="text-slate-600 font-mono text-[12px]">{v}</span>
              )},
              { key: 'record_count', label: 'Records', render: v => (
                <span className="font-medium text-indigo-600">{v || 0}</span>
              )},
              { key: 'status', label: 'Status', render: v => (
                <span className={`text-[12px] font-medium px-2 py-1 rounded-lg ${
                  v === 'completed'
                    ? 'bg-emerald-100 text-emerald-700'
                    : v === 'failed'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                }`}>
                  {v === 'completed' ? 'Completed' : v === 'failed' ? 'Failed' : 'Processing'}
                </span>
              )},
              { key: 'created_at', label: 'Date', render: v => (
                <span className="text-slate-600 text-[13px]">
                  {new Date(v).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )},
            ]}
            data={importLogs}
            emptyMessage="No imports found"
          />
        )}
      </div>

      <Modal
        isOpen={showUploadModal}
        onClose={resetImportFlow}
        title={`Import ${IMPORT_TYPES.find(t => t.id === selectedType)?.label || 'Data'}`}
        size="2xl"
        footer={
          showPreview ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowPreview(false)
                  setShowMapping(true)
                }}
              >
                Back
              </Button>
              <Button
                onClick={handleConfirmImport}
                loading={isImporting}
              >
                Confirm Import
              </Button>
            </>
          ) : showMapping ? (
            <>
              <Button
                variant="secondary"
                onClick={() => setShowMapping(false)}
              >
                Back
              </Button>
              <Button
                onClick={handleProceedToPreview}
              >
                Preview Data
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={resetImportFlow}>Cancel</Button>
          )
        }
      >
        {!showMapping && !showPreview ? (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-[13px] text-blue-700">
                <span className="font-semibold">Supported formats:</span> CSV and XLSX files exported from Busy Win accounting software
              </p>
            </div>

            <div
              onDragEnter={e => e.preventDefault()}
              onDragLeave={e => e.preventDefault()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                if (e.dataTransfer.files?.[0]) {
                  handleFileSelect({ target: { files: e.dataTransfer.files } })
                }
              }}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
                ${uploadedFile ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <input
                id="file-upload"
                type="file"
                onChange={handleFileSelect}
                accept=".csv,.xlsx"
                className="hidden"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload size={28} className="text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">
                  {uploadedFile ? uploadedFile.name : 'Drop file here or click to select'}
                </p>
                <p className="text-xs text-slate-400 mt-1">.csv or .xlsx files up to 50MB</p>
              </label>
            </div>
          </div>
        ) : showMapping ? (
          <div className="space-y-4">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <p className="text-[13px] text-indigo-700">
                <span className="font-semibold">Map columns:</span> Match your file columns to the database fields
              </p>
            </div>

            <Button
              variant="secondary"
              onClick={applyBusyWinDefaults}
              className="w-full mb-4"
            >
              Auto-map Busy Win Defaults
            </Button>

            <div className="space-y-3 max-h-96 overflow-auto">
              {(TABLE_SCHEMAS[selectedType] || []).map(dbColumn => (
                <div key={dbColumn} className="flex items-center gap-3">
                  <label className="flex-1 text-sm font-medium text-slate-700 min-w-[140px]">
                    {dbColumn}
                  </label>
                  <select
                    value={columnMapping[dbColumn] || ''}
                    onChange={(e) => setColumnMapping({
                      ...columnMapping,
                      [dbColumn]: e.target.value
                    })}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Not mapped --</option>
                    {sourceHeaders.map(header => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <div className="flex gap-2">
                <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-700">
                  Mapped columns will be used to import data. Unmapped columns will be skipped.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <p className="text-[13px] text-amber-700">
                <span className="font-semibold">Preview:</span> First 5 rows of {fullParsedData.length} total records
              </p>
            </div>

            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {Object.entries(columnMapping).filter(([, v]) => v !== '').map(([dbCol]) => (
                      <th key={dbCol} className="text-left py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">
                        {dbCol}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      {Object.entries(columnMapping).filter(([, v]) => v !== '').map(([dbCol]) => {
                        const value = row[dbCol]
                        const isEmpty = value === '' || value === null || value === undefined
                        return (
                          <td key={dbCol} className={`py-2 px-3 text-slate-600 ${isEmpty ? 'bg-red-50 text-red-500' : ''}`}>
                            {isEmpty ? '--' : String(value).substring(0, 50)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <p className="text-[13px] text-indigo-700">
                Total {fullParsedData.length} records will be imported
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
