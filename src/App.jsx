import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, Component } from 'react'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import { PageLoader } from './components/ui'

// Per-route error boundary so a single broken page does not blank the whole app.
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[PageErrorBoundary]', error, info)
  }
  componentDidUpdate(prevProps) {
    if (prevProps.locationKey !== this.props.locationKey && this.state.error) {
      this.setState({ error: null })
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="fade-in max-w-3xl mx-auto py-12 px-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-red-900 mb-2">This page failed to render</h2>
            <p className="text-[13px] text-red-700 mb-4">
              The rest of the app is still working — use the sidebar to navigate elsewhere.
            </p>
            <pre className="text-[11px] font-mono bg-white border border-red-100 rounded-lg p-3 text-red-800 overflow-auto max-h-64 whitespace-pre-wrap">
              {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 px-3 py-1.5 text-[12px] font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function RouteShell({ children }) {
  const location = useLocation()
  return (
    <PageErrorBoundary locationKey={location.key}>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </PageErrorBoundary>
  )
}

// Lazy-loaded page imports
const Dashboard = lazy(() => import('./pages/Dashboard'))
const OrdersPage = lazy(() => import('./modules/orders/OrdersPage'))
const OrderForm = lazy(() => import('./modules/orders/OrderForm'))
const OrderDetail = lazy(() => import('./modules/orders/OrderDetail'))
const EnquiriesPage = lazy(() => import('./modules/enquiry/EnquiriesPage'))
const EnquiryForm = lazy(() => import('./modules/enquiry/EnquiryForm'))
const CalculatorPage = lazy(() => import('./modules/calculator/CalculatorPage'))
const ProductionPage = lazy(() => import('./modules/production/ProductionPage'))
const StockPage = lazy(() => import('./modules/stock/StockPage'))
const DispatchPage = lazy(() => import('./modules/dispatch/DispatchPage'))
const InvoicesPage = lazy(() => import('./modules/invoicing/InvoicesPage'))
const PaymentsPage = lazy(() => import('./modules/finance/PaymentsPage'))
const PurchasePage = lazy(() => import('./modules/purchase/PurchasePage'))
const ReportsPage = lazy(() => import('./modules/reports/ReportsPage'))
const CustomersPage = lazy(() => import('./modules/masters/CustomersPage'))
const ProductsPage = lazy(() => import('./modules/masters/ProductsPage'))
const MaterialsPage = lazy(() => import('./modules/masters/MaterialsPage'))
const MachinesPage = lazy(() => import('./modules/masters/MachinesPage'))
const ColorsPage = lazy(() => import('./modules/masters/ColorsPage'))
const SuppliersPage = lazy(() => import('./modules/masters/SuppliersPage'))
const BrokersPage = lazy(() => import('./modules/masters/BrokersPage'))
const ChargeTypesPage = lazy(() => import('./modules/masters/ChargeTypesPage'))
const OrderTypesPage = lazy(() => import('./modules/masters/OrderTypesPage'))
const PaymentTermsPage = lazy(() => import('./modules/masters/PaymentTermsPage'))
const WarehousesPage = lazy(() => import('./modules/masters/WarehousesPage'))
const BanksPage = lazy(() => import('./modules/masters/BanksPage'))
const StaffPage = lazy(() => import('./modules/masters/StaffPage'))
const HsnCodesPage = lazy(() => import('./modules/masters/HsnCodesPage'))
const UnitsPage = lazy(() => import('./modules/masters/UnitsPage'))
const MachineTypesPage = lazy(() => import('./modules/masters/MachineTypesPage'))
const ProductTypesPage = lazy(() => import('./modules/masters/ProductTypesPage'))
const YarnTypesPage = lazy(() => import('./modules/masters/YarnTypesPage'))
const ProcessTypesPage = lazy(() => import('./modules/masters/ProcessTypesPage'))
const OperatorsPage = lazy(() => import('./modules/masters/OperatorsPage'))
const ChaalTypesPage = lazy(() => import('./modules/masters/ChaalTypesPage'))
const PackagingTypesPage = lazy(() => import('./modules/masters/PackagingTypesPage'))
const TransportsPage = lazy(() => import('./modules/masters/TransportsPage'))
const QualityParametersPage = lazy(() => import('./modules/masters/QualityParametersPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const ImportPage = lazy(() => import('./pages/ImportPage'))

// Placeholder components for pages that don't exist yet
const PlaceholderPage = ({ name }) => (
  <div style={{ padding: '2rem', textAlign: 'center' }}>
    <h1>{name}</h1>
    <p>This page is coming soon.</p>
  </div>
)

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return <Layout><RouteShell>{children}</RouteShell></Layout>
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <PageLoader />

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      {/* Dashboard */}
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

      {/* Orders */}
      <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
      <Route path="/orders/new" element={<ProtectedRoute><OrderForm /></ProtectedRoute>} />
      <Route path="/orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
      <Route path="/orders/:id/edit" element={<ProtectedRoute><OrderForm /></ProtectedRoute>} />

      {/* Enquiries */}
      <Route path="/enquiries" element={<ProtectedRoute><EnquiriesPage /></ProtectedRoute>} />
      <Route path="/enquiries/new" element={<ProtectedRoute><EnquiryForm /></ProtectedRoute>} />
      <Route path="/enquiries/:id" element={<ProtectedRoute><EnquiryForm /></ProtectedRoute>} />

      {/* Calculator */}
      <Route path="/calculator" element={<ProtectedRoute><CalculatorPage /></ProtectedRoute>} />
      <Route path="/production" element={<ProtectedRoute><ProductionPage /></ProtectedRoute>} />
      <Route path="/stock" element={<ProtectedRoute><StockPage /></ProtectedRoute>} />
      <Route path="/dispatch" element={<ProtectedRoute><DispatchPage /></ProtectedRoute>} />
      <Route path="/invoices" element={<ProtectedRoute><InvoicesPage /></ProtectedRoute>} />
      <Route path="/payments" element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />
      <Route path="/purchase" element={<ProtectedRoute><PurchasePage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />

      {/* Masters */}
      <Route path="/masters/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
      <Route path="/masters/products" element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
      <Route path="/masters/materials" element={<ProtectedRoute><MaterialsPage /></ProtectedRoute>} />
      <Route path="/masters/machines" element={<ProtectedRoute><MachinesPage /></ProtectedRoute>} />
      <Route path="/masters/colors" element={<ProtectedRoute><ColorsPage /></ProtectedRoute>} />
      <Route path="/masters/suppliers" element={<ProtectedRoute><SuppliersPage /></ProtectedRoute>} />
      <Route path="/masters/brokers" element={<ProtectedRoute><BrokersPage /></ProtectedRoute>} />
      <Route path="/masters/charge-types" element={<ProtectedRoute><ChargeTypesPage /></ProtectedRoute>} />
      <Route path="/masters/order-types" element={<ProtectedRoute><OrderTypesPage /></ProtectedRoute>} />
      <Route path="/masters/payment-terms" element={<ProtectedRoute><PaymentTermsPage /></ProtectedRoute>} />
      <Route path="/masters/warehouses" element={<ProtectedRoute><WarehousesPage /></ProtectedRoute>} />
      <Route path="/masters/banks" element={<ProtectedRoute><BanksPage /></ProtectedRoute>} />
      <Route path="/masters/staff" element={<ProtectedRoute><StaffPage /></ProtectedRoute>} />
      <Route path="/masters/hsn-codes" element={<ProtectedRoute><HsnCodesPage /></ProtectedRoute>} />
      <Route path="/masters/units" element={<ProtectedRoute><UnitsPage /></ProtectedRoute>} />
      <Route path="/masters/machine-types" element={<ProtectedRoute><MachineTypesPage /></ProtectedRoute>} />
      <Route path="/masters/product-types" element={<ProtectedRoute><ProductTypesPage /></ProtectedRoute>} />
      <Route path="/masters/yarn-types" element={<ProtectedRoute><YarnTypesPage /></ProtectedRoute>} />
      <Route path="/masters/process-types" element={<ProtectedRoute><ProcessTypesPage /></ProtectedRoute>} />
      <Route path="/masters/operators" element={<ProtectedRoute><OperatorsPage /></ProtectedRoute>} />
      <Route path="/masters/chaal-types" element={<ProtectedRoute><ChaalTypesPage /></ProtectedRoute>} />
      <Route path="/masters/packaging-types" element={<ProtectedRoute><PackagingTypesPage /></ProtectedRoute>} />
      <Route path="/masters/transports" element={<ProtectedRoute><TransportsPage /></ProtectedRoute>} />
      <Route path="/masters/quality-parameters" element={<ProtectedRoute><QualityParametersPage /></ProtectedRoute>} />

      {/* Settings & Import */}
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/import" element={<ProtectedRoute><ImportPage /></ProtectedRoute>} />

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
