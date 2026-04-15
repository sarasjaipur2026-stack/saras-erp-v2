import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, Component, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import { PageLoader } from './components/ui'
import CommandPalette from './components/CommandPalette'

// Prefetch top routes after first paint so navigation feels instant
const prefetchRoutes = () => {
  const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn) => setTimeout(fn, 300)
  idle(() => {
    import('./pages/Dashboard')
    import('./modules/orders/OrdersPage')
    import('./modules/enquiry/EnquiriesPage')
  })
}

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
    if (import.meta.env.DEV) console.error('[PageErrorBoundary]', error, info)
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
              {import.meta.env.DEV
                ? String(this.state.error?.stack || this.state.error?.message || this.state.error)
                : String(this.state.error?.message || 'An unexpected error occurred')}
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
const EnquiryDetail = lazy(() => import('./modules/enquiry/EnquiryDetail'))
const CalculatorPage = lazy(() => import('./modules/calculator/CalculatorPage'))
const ProductionPage = lazy(() => import('./modules/production/ProductionPage'))
const StockPage = lazy(() => import('./modules/stock/StockPage'))
const DispatchPage = lazy(() => import('./modules/dispatch/DispatchPage'))
const InvoicesPage = lazy(() => import('./modules/invoicing/InvoicesPage'))
const PaymentsPage = lazy(() => import('./modules/finance/PaymentsPage'))
const PurchasePage = lazy(() => import('./modules/purchase/PurchasePage'))
const ReportsPage = lazy(() => import('./modules/reports/ReportsPage'))
const JobworkPage = lazy(() => import('./modules/jobwork/JobworkPage'))
const QualityPage = lazy(() => import('./modules/quality/QualityPage'))
const NotificationsPage = lazy(() => import('./modules/notifications/NotificationsPage'))
const UsersPage = lazy(() => import('./modules/settings/UsersPage'))
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

// Access-denied fallback for permission-gated routes
const AccessDenied = () => (
  <div className="fade-in max-w-md mx-auto py-16 px-4 text-center">
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8">
      <h2 className="text-lg font-bold text-amber-900 mb-2">Access Denied</h2>
      <p className="text-sm text-amber-700">You don't have permission to view this page. Contact your admin.</p>
    </div>
  </div>
)

function ProtectedRoute({ children, perm, action }) {
  const { user, loading, hasPermission } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  if (perm && !hasPermission(perm, action)) return <Layout><RouteShell><AccessDenied /></RouteShell></Layout>
  return <Layout><RouteShell>{children}</RouteShell></Layout>
}

export default function App() {
  const { user, loading } = useAuth()

  // Prefetch common routes once auth resolves
  useEffect(() => { if (!loading && user) prefetchRoutes() }, [loading, user])

  if (loading) return <PageLoader />

  return (
    <>
      {/* Global Cmd+K search palette — only mounted when authenticated */}
      {user && <CommandPalette />}
      <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      {/* Dashboard */}
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

      {/* Orders */}
      <Route path="/orders" element={<ProtectedRoute perm="orders"><OrdersPage /></ProtectedRoute>} />
      <Route path="/orders/new" element={<ProtectedRoute perm="orders" action="create"><OrderForm /></ProtectedRoute>} />
      <Route path="/orders/:id" element={<ProtectedRoute perm="orders" action="view"><OrderDetail /></ProtectedRoute>} />
      <Route path="/orders/:id/edit" element={<ProtectedRoute perm="orders" action="edit"><OrderForm /></ProtectedRoute>} />

      {/* Enquiries */}
      <Route path="/enquiries" element={<ProtectedRoute perm="enquiries"><EnquiriesPage /></ProtectedRoute>} />
      <Route path="/enquiries/new" element={<ProtectedRoute perm="enquiries" action="create"><EnquiryForm /></ProtectedRoute>} />
      <Route path="/enquiries/:id" element={<ProtectedRoute perm="enquiries"><EnquiryDetail /></ProtectedRoute>} />
      <Route path="/enquiries/:id/edit" element={<ProtectedRoute perm="enquiries" action="edit"><EnquiryForm /></ProtectedRoute>} />

      {/* Calculator */}
      <Route path="/calculator" element={<ProtectedRoute perm="calculator"><CalculatorPage /></ProtectedRoute>} />
      <Route path="/production" element={<ProtectedRoute perm="production"><ProductionPage /></ProtectedRoute>} />
      <Route path="/stock" element={<ProtectedRoute perm="stock"><StockPage /></ProtectedRoute>} />
      <Route path="/dispatch" element={<ProtectedRoute perm="dispatch"><DispatchPage /></ProtectedRoute>} />
      <Route path="/invoices" element={<ProtectedRoute perm="invoices"><InvoicesPage /></ProtectedRoute>} />
      <Route path="/payments" element={<ProtectedRoute perm="payments"><PaymentsPage /></ProtectedRoute>} />
      <Route path="/purchase" element={<ProtectedRoute perm="purchase"><PurchasePage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute perm="reports"><ReportsPage /></ProtectedRoute>} />
      <Route path="/jobwork" element={<ProtectedRoute perm="jobwork"><JobworkPage /></ProtectedRoute>} />
      <Route path="/quality" element={<ProtectedRoute perm="quality"><QualityPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/settings/users" element={<ProtectedRoute perm="settings"><UsersPage /></ProtectedRoute>} />

      {/* Masters */}
      <Route path="/masters/customers" element={<ProtectedRoute perm="masters"><CustomersPage /></ProtectedRoute>} />
      <Route path="/masters/products" element={<ProtectedRoute perm="masters"><ProductsPage /></ProtectedRoute>} />
      <Route path="/masters/materials" element={<ProtectedRoute perm="masters"><MaterialsPage /></ProtectedRoute>} />
      <Route path="/masters/machines" element={<ProtectedRoute perm="masters"><MachinesPage /></ProtectedRoute>} />
      <Route path="/masters/colors" element={<ProtectedRoute perm="masters"><ColorsPage /></ProtectedRoute>} />
      <Route path="/masters/suppliers" element={<ProtectedRoute perm="masters"><SuppliersPage /></ProtectedRoute>} />
      <Route path="/masters/brokers" element={<ProtectedRoute perm="masters"><BrokersPage /></ProtectedRoute>} />
      <Route path="/masters/charge-types" element={<ProtectedRoute perm="masters"><ChargeTypesPage /></ProtectedRoute>} />
      <Route path="/masters/order-types" element={<ProtectedRoute perm="masters"><OrderTypesPage /></ProtectedRoute>} />
      <Route path="/masters/payment-terms" element={<ProtectedRoute perm="masters"><PaymentTermsPage /></ProtectedRoute>} />
      <Route path="/masters/warehouses" element={<ProtectedRoute perm="masters"><WarehousesPage /></ProtectedRoute>} />
      <Route path="/masters/banks" element={<ProtectedRoute perm="masters"><BanksPage /></ProtectedRoute>} />
      <Route path="/masters/staff" element={<ProtectedRoute perm="masters"><StaffPage /></ProtectedRoute>} />
      <Route path="/masters/hsn-codes" element={<ProtectedRoute perm="masters"><HsnCodesPage /></ProtectedRoute>} />
      <Route path="/masters/units" element={<ProtectedRoute perm="masters"><UnitsPage /></ProtectedRoute>} />
      <Route path="/masters/machine-types" element={<ProtectedRoute perm="masters"><MachineTypesPage /></ProtectedRoute>} />
      <Route path="/masters/product-types" element={<ProtectedRoute perm="masters"><ProductTypesPage /></ProtectedRoute>} />
      <Route path="/masters/yarn-types" element={<ProtectedRoute perm="masters"><YarnTypesPage /></ProtectedRoute>} />
      <Route path="/masters/process-types" element={<ProtectedRoute perm="masters"><ProcessTypesPage /></ProtectedRoute>} />
      <Route path="/masters/operators" element={<ProtectedRoute perm="masters"><OperatorsPage /></ProtectedRoute>} />
      <Route path="/masters/chaal-types" element={<ProtectedRoute perm="masters"><ChaalTypesPage /></ProtectedRoute>} />
      <Route path="/masters/packaging-types" element={<ProtectedRoute perm="masters"><PackagingTypesPage /></ProtectedRoute>} />
      <Route path="/masters/transports" element={<ProtectedRoute perm="masters"><TransportsPage /></ProtectedRoute>} />
      <Route path="/masters/quality-parameters" element={<ProtectedRoute perm="masters"><QualityParametersPage /></ProtectedRoute>} />

      {/* Settings & Import */}
      <Route path="/settings" element={<ProtectedRoute perm="settings"><SettingsPage /></ProtectedRoute>} />
      <Route path="/import" element={<ProtectedRoute perm="settings"><ImportPage /></ProtectedRoute>} />

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
