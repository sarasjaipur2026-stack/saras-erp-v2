import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import OrdersPage from './modules/orders/OrdersPage'
import OrderForm from './modules/orders/OrderForm'
import OrderDetail from './modules/orders/OrderDetail'
import EnquiriesPage from './modules/enquiry/EnquiriesPage'
import EnquiryForm from './modules/enquiry/EnquiryForm'
import CalculatorPage from './modules/calculator/CalculatorPage'
import CustomersPage from './modules/masters/CustomersPage'
import ProductsPage from './modules/masters/ProductsPage'
import MaterialsPage from './modules/masters/MaterialsPage'
import MachinesPage from './modules/masters/MachinesPage'
import ColorsPage from './modules/masters/ColorsPage'
import SuppliersPage from './modules/masters/SuppliersPage'
import { PageLoader } from './components/ui'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <PageLoader />

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
      <Route path="/orders/new" element={<ProtectedRoute><OrderForm /></ProtectedRoute>} />
      <Route path="/orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
      <Route path="/orders/:id/edit" element={<ProtectedRoute><OrderForm /></ProtectedRoute>} />

      <Route path="/enquiries" element={<ProtectedRoute><EnquiriesPage /></ProtectedRoute>} />
      <Route path="/enquiries/new" element={<ProtectedRoute><EnquiryForm /></ProtectedRoute>} />

      <Route path="/calculator" element={<ProtectedRoute><CalculatorPage /></ProtectedRoute>} />

      <Route path="/masters/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
      <Route path="/masters/products" element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
      <Route path="/masters/materials" element={<ProtectedRoute><MaterialsPage /></ProtectedRoute>} />
      <Route path="/masters/machines" element={<ProtectedRoute><MachinesPage /></ProtectedRoute>} />
      <Route path="/masters/colors" element={<ProtectedRoute><ColorsPage /></ProtectedRoute>} />
      <Route path="/masters/suppliers" element={<ProtectedRoute><SuppliersPage /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
