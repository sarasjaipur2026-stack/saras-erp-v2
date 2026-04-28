// Shared nav item registry. Consumed by Sidebar for the main menu and by
// CommandPalette (Ctrl+K) for jump-to-page navigation. Keeping labels + perms
// in one place means the palette automatically inherits new modules as the
// sidebar grows.
import {
  LayoutDashboard, ShoppingCart, MessageSquare, Calculator, Users,
  Package, Settings, Truck, Box, Palette, BarChart3, FileText,
  CreditCard, Briefcase, DollarSign, Building2, Archive,
  Hash, Ruler, Cog, Layers, Workflow, UserCog, Sparkles, PackageOpen,
  ShieldCheck, Factory, ShoppingBag, Bell, Store,
} from 'lucide-react'

export const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, category: 'main' },
  { path: '/pos', label: 'POS', icon: Store, category: 'main', perm: 'pos' },
  { path: '/orders', label: 'Orders', icon: ShoppingCart, category: 'main', badge: true, perm: 'orders' },
  { path: '/enquiries', label: 'Enquiries', icon: MessageSquare, category: 'main', perm: 'orders' },
  { path: '/calculator', label: 'Calculator', icon: Calculator, category: 'production', perm: 'calculator' },
  { path: '/production', label: 'Production', icon: Factory, category: 'production', perm: 'production' },
  { path: '/jobwork', label: 'Jobwork', icon: Briefcase, category: 'production', perm: 'jobwork' },
  { path: '/jobwork/balance', label: 'Jobwork Balance', icon: Briefcase, category: 'production', perm: 'jobwork' },
  { path: '/quality', label: 'Quality Check', icon: ShieldCheck, category: 'production', perm: 'quality' },
  { path: '/masters/customers', label: 'Customers', icon: Users, category: 'masters', perm: 'masters' },
  { path: '/masters/products', label: 'Products', icon: Package, category: 'masters', perm: 'masters' },
  { path: '/masters/materials', label: 'Materials', icon: Box, category: 'masters', perm: 'masters' },
  { path: '/masters/machines', label: 'Machines', icon: Settings, category: 'masters', perm: 'masters' },
  { path: '/masters/colors', label: 'Colors', icon: Palette, category: 'masters', perm: 'masters' },
  { path: '/masters/suppliers', label: 'Suppliers', icon: Truck, category: 'masters', perm: 'masters' },
  { path: '/masters/brokers', label: 'Brokers', icon: Briefcase, category: 'masters', perm: 'masters' },
  { path: '/masters/charge-types', label: 'Charge Types', icon: DollarSign, category: 'masters', perm: 'masters' },
  { path: '/masters/order-types', label: 'Order Types', icon: Archive, category: 'masters', perm: 'masters' },
  { path: '/masters/payment-terms', label: 'Payment Terms', icon: CreditCard, category: 'masters', perm: 'masters' },
  { path: '/masters/warehouses', label: 'Warehouses', icon: Building2, category: 'masters', perm: 'masters' },
  { path: '/masters/banks', label: 'Banks', icon: Building2, category: 'masters', perm: 'masters' },
  { path: '/masters/staff', label: 'Staff', icon: Users, category: 'masters', perm: 'masters' },
  { path: '/masters/product-types', label: 'Product Types', icon: Layers, category: 'masters', perm: 'masters' },
  { path: '/masters/yarn-types', label: 'Yarn Types', icon: Sparkles, category: 'masters', perm: 'masters' },
  { path: '/masters/machine-types', label: 'Machine Types', icon: Cog, category: 'masters', perm: 'masters' },
  { path: '/masters/chaal-types', label: 'Chaal Types', icon: Workflow, category: 'masters', perm: 'masters' },
  { path: '/masters/process-types', label: 'Process Types', icon: Workflow, category: 'masters', perm: 'masters' },
  { path: '/masters/operators', label: 'Operators', icon: UserCog, category: 'masters', perm: 'masters' },
  { path: '/masters/hsn-codes', label: 'HSN Codes', icon: Hash, category: 'masters', perm: 'masters' },
  { path: '/masters/units', label: 'Units', icon: Ruler, category: 'masters', perm: 'masters' },
  { path: '/masters/packaging-types', label: 'Packaging', icon: PackageOpen, category: 'masters', perm: 'masters' },
  { path: '/masters/transports', label: 'Transports', icon: Truck, category: 'masters', perm: 'masters' },
  { path: '/masters/quality-parameters', label: 'Quality Params', icon: ShieldCheck, category: 'masters', perm: 'masters' },
  { path: '/purchase', label: 'Purchase', icon: ShoppingBag, category: 'inventory', perm: 'purchase' },
  { path: '/purchase/reconcile', label: 'PO Reconcile', icon: ShoppingBag, category: 'inventory', perm: 'purchase' },
  { path: '/stock', label: 'Stock', icon: BarChart3, category: 'inventory', perm: 'stock' },
  { path: '/dispatch', label: 'Dispatch', icon: Truck, category: 'inventory', perm: 'dispatch' },
  { path: '/invoices', label: 'Invoices', icon: FileText, category: 'finance', perm: 'invoices' },
  { path: '/payments', label: 'Payments', icon: CreditCard, category: 'finance', perm: 'payments' },
  { path: '/reports', label: 'Reports', icon: BarChart3, category: 'finance', perm: 'reports' },
]

export const SYSTEM_ITEMS = [
  { path: '/notifications', label: 'Notifications', icon: Bell, category: 'system' },
  { path: '/settings', label: 'Settings', icon: Settings, category: 'system', perm: 'settings' },
  { path: '/settings/users', label: 'Users & Roles', icon: UserCog, category: 'system', adminOnly: true },
  { path: '/import', label: 'Import Data', icon: Archive, category: 'system', adminOnly: true },
]

export const CATEGORIES = [
  { key: 'main', label: '', collapsible: false },
  { key: 'production', label: 'Production', collapsible: false },
  { key: 'masters', label: 'Masters', collapsible: true },
  { key: 'inventory', label: 'Inventory', collapsible: false },
  { key: 'finance', label: 'Finance', collapsible: false },
  { key: 'system', label: 'System', collapsible: false },
]
