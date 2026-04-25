import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { lazy, Suspense, Component, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import { PageLoader } from './components/ui'

// Prefetch top routes after first paint so navigation feels instant.
// Splits into two waves so we don't saturate the network on login.
const prefetchRoutes = () => {
  const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn) => setTimeout(fn, 300)
  idle(() => {
    // Wave 1 — immediately after dashboard paints (most likely next clicks)
    import('./pages/Dashboard')
    import('./modules/orders/OrdersPage')
    import('./modules/enquiry/EnquiriesPage')
    import('./modules/invoicing/InvoicesPage')
    import('./modules/finance/PaymentsPage')
    // Wave 2 — another idle slot out for less-common flows
    idle(() => {
      import('./modules/stock/StockPage')
      import('./modules/purchase/PurchasePage')
      import('./modules/reports/ReportsPage')
      import('./modules/jobwork/JobworkPage')
    })
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
      // Detect chunk-load failure: user has a stale SPA tab open after a
      // deploy changed the chunk hashes. Reload is the only real recovery.
      const msg = String(this.state.error?.message || this.state.error || '')
      const isChunkLoadFailure = /Loading (chunk|CSS chunk|module)|Failed to fetch dynamically imported module|ChunkLoadError/i.test(msg)

      return (
        <div className="fade-in max-w-3xl mx-auto py-12 px-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-red-900 mb-2">
              {isChunkLoadFailure ? 'A new version was deployed' : 'This page failed to render'}
            </h2>
            <p className="text-[13px] text-red-700 mb-4">
              {isChunkLoadFailure
                ? 'Your open tab is out of date. Click Reload to pick up the latest version.'
                : 'The rest of the app is still working — use the sidebar to navigate elsewhere.'}
            </p>
            {!isChunkLoadFailure && (
              <pre className="text-[11px] font-mono bg-white border border-red-100 rounded-lg p-3 text-red-800 overflow-auto max-h-64 whitespace-pre-wrap">
                {import.meta.env.DEV
                  ? String(this.state.error?.stack || this.state.error?.message || this.state.error)
                  : String(this.state.error?.message || 'An unexpected error occurred')}
              </pre>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => this.setState({ error: null })}
                className="px-3 py-1.5 text-[12px] font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Retry
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 text-[12px] font-semibold bg-white border border-red-200 text-red-700 rounded-lg hover:bg-red-100"
              >
                {isChunkLoadFailure ? 'Reload' : 'Reload page'}
              </button>
            </div>
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
const PurchaseReconcilePage = lazy(() => import('./modules/purchase/PurchaseReconcilePage'))
const ReportsPage = lazy(() => import('./modules/reports/ReportsPage'))
const JobworkPage = lazy(() => import('./modules/jobwork/JobworkPage'))
const JobworkBalancePage = lazy(() => import('./modules/jobwork/JobworkBalancePage'))
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

// Layout shell — mounts ONCE per session, then Outlet swaps page content on
// navigation. Previously each ProtectedRoute wrapped its own Layout, which
// meant Topbar, Sidebar, and CommandPalette unmounted/remounted on every
// route change → notification fetch stampede + masters re-init.
function LayoutShell() {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return (
    <Layout>
      <RouteShell>
        <Outlet />
      </RouteShell>
    </Layout>
  )
}

// Permission gate — runs INSIDE the persistent Layout, so denied access shows
// the AccessDenied panel without remounting Topbar/Sidebar.
function PermissionGate({ perm, action, children }) {
  const { hasPermission } = useAuth()
  if (perm && !hasPermission(perm, action)) return <AccessDenied />
  return children
}

export default function App() {
  const { user, loading } = useAuth()

  // Prefetch common routes once auth resolves
  useEffect(() => { if (!loading && user) prefetchRoutes() }, [loading, user])

  if (loading) return <PageLoader />

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      {/* All authenticated routes share a single persistent Layout. */}
      <Route element={<LayoutShell />}>
        <Route path="/" element={<Dashboard />} />

        {/* Orders */}
        <Route path="/orders" element={<PermissionGate perm="orders"><OrdersPage /></PermissionGate>} />
        <Route path="/orders/new" element={<PermissionGate perm="orders" action="create"><OrderForm /></PermissionGate>} />
        <Route path="/orders/:id" element={<PermissionGate perm="orders" action="view"><OrderDetail /></PermissionGate>} />
        <Route path="/orders/:id/edit" element={<PermissionGate perm="orders" action="edit"><OrderForm /></PermissionGate>} />

        {/* Enquiries */}
        <Route path="/enquiries" element={<PermissionGate perm="enquiries"><EnquiriesPage /></PermissionGate>} />
        <Route path="/enquiries/new" element={<PermissionGate perm="enquiries" action="create"><EnquiryForm /></PermissionGate>} />
        <Route path="/enquiries/:id" element={<PermissionGate perm="enquiries"><EnquiryForm /></PermissionGate>} />

        {/* Modules */}
        <Route path="/calculator" element={<PermissionGate perm="calculator"><CalculatorPage /></PermissionGate>} />
        <Route path="/production" element={<PermissionGate perm="production"><ProductionPage /></PermissionGate>} />
        <Route path="/stock" element={<PermissionGate perm="stock"><StockPage /></PermissionGate>} />
        <Route path="/dispatch" element={<PermissionGate perm="dispatch"><DispatchPage /></PermissionGate>} />
        <Route path="/invoices" element={<PermissionGate perm="invoices"><InvoicesPage /></PermissionGate>} />
        <Route path="/payments" element={<PermissionGate perm="payments"><PaymentsPage /></PermissionGate>} />
        <Route path="/purchase" element={<PermissionGate perm="purchase"><PurchasePage /></PermissionGate>} />
        <Route path="/purchase/reconcile" element={<PermissionGate perm="purchase"><PurchaseReconcilePage /></PermissionGate>} />
        <Route path="/reports" element={<PermissionGate perm="reports"><ReportsPage /></PermissionGate>} />
        <Route path="/jobwork" element={<PermissionGate perm="jobwork"><JobworkPage /></PermissionGate>} />
        <Route path="/jobwork/balance" element={<PermissionGate perm="jobwork"><JobworkBalancePage /></PermissionGate>} />
        <Route path="/quality" element={<PermissionGate perm="quality"><QualityPage /></PermissionGate>} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings/users" element={<PermissionGate perm="settings"><UsersPage /></PermissionGate>} />

        {/* Masters */}
        <Route path="/masters/customers" element={<PermissionGate perm="masters"><CustomersPage /></PermissionGate>} />
        <Route path="/masters/products" element={<PermissionGate perm="masters"><ProductsPage /></PermissionGate>} />
        <Route path="/masters/materials" element={<PermissionGate perm="masters"><MaterialsPage /></PermissionGate>} />
        <Route path="/masters/machines" element={<PermissionGate perm="masters"><MachinesPage /></PermissionGate>} />
        <Route path="/masters/colors" element={<PermissionGate perm="masters"><ColorsPage /></PermissionGate>} />
        <Route path="/masters/suppliers" element={<PermissionGate perm="masters"><SuppliersPage /></PermissionGate>} />
        <Route path="/masters/brokers" element={<PermissionGate perm="masters"><BrokersPage /></PermissionGate>} />
        <Route path="/masters/charge-types" element={<PermissionGate perm="masters"><ChargeTypesPage /></PermissionGate>} />
        <Route path="/masters/order-types" element={<PermissionGate perm="masters"><OrderTypesPage /></PermissionGate>} />
        <Route path="/masters/payment-terms" element={<PermissionGate perm="masters"><PaymentTermsPage /></PermissionGate>} />
        <Route path="/masters/warehouses" element={<PermissionGate perm="masters"><WarehousesPage /></PermissionGate>} />
        <Route path="/masters/banks" element={<PermissionGate perm="masters"><BanksPage /></PermissionGate>} />
        <Route path="/masters/staff" element={<PermissionGate perm="masters"><StaffPage /></PermissionGate>} />
        <Route path="/masters/hsn-codes" element={<PermissionGate perm="masters"><HsnCodesPage /></PermissionGate>} />
        <Route path="/masters/units" element={<PermissionGate perm="masters"><UnitsPage /></PermissionGate>} />
        <Route path="/masters/machine-types" element={<PermissionGate perm="masters"><MachineTypesPage /></PermissionGate>} />
        <Route path="/masters/product-types" element={<PermissionGate perm="masters"><ProductTypesPage /></PermissionGate>} />
        <Route path="/masters/yarn-types" element={<PermissionGate perm="masters"><YarnTypesPage /></PermissionGate>} />
        <Route path="/masters/process-types" element={<PermissionGate perm="masters"><ProcessTypesPage /></PermissionGate>} />
        <Route path="/masters/operators" element={<PermissionGate perm="masters"><OperatorsPage /></PermissionGate>} />
        <Route path="/masters/chaal-types" element={<PermissionGate perm="masters"><ChaalTypesPage /></PermissionGate>} />
        <Route path="/masters/packaging-types" element={<PermissionGate perm="masters"><PackagingTypesPage /></PermissionGate>} />
        <Route path="/masters/transports" element={<PermissionGate perm="masters"><TransportsPage /></PermissionGate>} />
        <Route path="/masters/quality-parameters" element={<PermissionGate perm="masters"><QualityParametersPage /></PermissionGate>} />

        {/* Settings & Import */}
        <Route path="/settings" element={<PermissionGate perm="settings"><SettingsPage /></PermissionGate>} />
        <Route path="/import" element={<PermissionGate perm="settings"><ImportPage /></PermissionGate>} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
