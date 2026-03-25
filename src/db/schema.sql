-- PostgreSQL Schema for SARAS ERP

-- Enums
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'partial_delivery', 'delivered', 'cancelled');
CREATE TYPE priority_level AS ENUM ('normal', 'high', 'urgent');
CREATE TYPE line_item_type AS ENUM ('production', 'trading', 'jobwork', 'stock');
CREATE TYPE enquiry_status AS ENUM ('new', 'follow_up', 'quoted', 'converted', 'lost');

-- Profiles Table (User information)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  firm_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Customers Table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  firm_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  city TEXT,
  address TEXT,
  gstin TEXT,
  pan TEXT,
  credit_limit DECIMAL(12, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, gstin)
);

-- Products Table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  hsn_code TEXT,
  gst_rate DECIMAL(5, 2),
  rate_unit TEXT NOT NULL CHECK (rate_unit IN ('per_meter', 'per_kg')),
  uses_filler BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, code)
);

-- Materials Table (Yarn/Fabric materials)
CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price_per_kg DECIMAL(10, 2),
  hsn_code TEXT,
  gst_rate DECIMAL(5, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, name)
);

-- Machines Table
CREATE TABLE machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_hi TEXT,
  spindles INTEGER,
  compatible_products TEXT[],
  machine_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, code)
);

-- Colors Table
CREATE TABLE colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hex_code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, name)
);

-- Orders Table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  order_number TEXT NOT NULL,
  nature TEXT NOT NULL CHECK (nature IN ('sample', 'full_production')),
  order_type TEXT NOT NULL CHECK (order_type IN ('standard', 'export')),
  priority priority_level DEFAULT 'normal',
  status order_status DEFAULT 'pending',
  delivery_date DATE,
  grand_total DECIMAL(12, 2),
  advance_paid DECIMAL(12, 2) DEFAULT 0,
  discount_amount DECIMAL(12, 2) DEFAULT 0,
  gst_amount DECIMAL(12, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, order_number)
);

-- Order Line Items Table
CREATE TABLE order_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line_type line_item_type NOT NULL,
  product_id UUID REFERENCES products(id),
  machine_id UUID REFERENCES machines(id),
  material_id UUID REFERENCES materials(id),
  color_id UUID REFERENCES colors(id),
  width_cm DECIMAL(8, 2),
  meters DECIMAL(12, 2),
  weight_kg DECIMAL(12, 2),
  rate_per_unit DECIMAL(10, 2),
  amount DECIMAL(12, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Deliveries Table
CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_date DATE NOT NULL,
  quantity_delivered DECIMAL(12, 2),
  delivery_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Jobwork Tracking Table
CREATE TABLE jobwork_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line_item_id UUID REFERENCES order_line_items(id) ON DELETE SET NULL,
  material_inward_date DATE,
  material_inward_qty DECIMAL(12, 2),
  material_return_date DATE,
  material_return_qty DECIMAL(12, 2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enquiries Table
CREATE TABLE enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  enquiry_number TEXT NOT NULL,
  products_required TEXT,
  quantity DECIMAL(12, 2),
  quoted_rate DECIMAL(10, 2),
  source TEXT,
  status enquiry_status DEFAULT 'new',
  followup_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, enquiry_number)
);

-- Calculator Profiles Table
CREATE TABLE calculator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  profile_name TEXT NOT NULL,
  machine_id UUID REFERENCES machines(id),
  product_id UUID REFERENCES products(id),
  chaal TEXT,
  sample_length_m DECIMAL(10, 2),
  sample_weight_kg DECIMAL(10, 2),
  grams_per_meter DECIMAL(10, 2),
  yarn_count TEXT,
  yarn_type TEXT,
  cover_count TEXT,
  filler_count TEXT,
  waste_percentage DECIMAL(5, 2),
  labor_cost_per_kg DECIMAL(10, 2),
  overhead_cost_percentage DECIMAL(5, 2),
  profit_margin_percentage DECIMAL(5, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, profile_name)
);

-- Stock Table
CREATE TABLE stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  quantity_kg DECIMAL(12, 2),
  location TEXT,
  batch_number TEXT,
  expiry_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Suppliers Table
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  firm TEXT,
  gstin TEXT,
  city TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, name)
);

-- Notifications Table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  type TEXT,
  related_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit Log Table
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Indexes for Performance
CREATE INDEX idx_customers_user_id ON customers(user_id);
CREATE INDEX idx_products_user_id ON products(user_id);
CREATE INDEX idx_materials_user_id ON materials(user_id);
CREATE INDEX idx_machines_user_id ON machines(user_id);
CREATE INDEX idx_colors_user_id ON colors(user_id);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX idx_order_line_items_order_id ON order_line_items(order_id);
CREATE INDEX idx_deliveries_order_id ON deliveries(order_id);
CREATE INDEX idx_jobwork_order_id ON jobwork_tracking(order_id);
CREATE INDEX idx_enquiries_user_id ON enquiries(user_id);
CREATE INDEX idx_enquiries_customer_id ON enquiries(customer_id);
CREATE INDEX idx_enquiries_status ON enquiries(status);
CREATE INDEX idx_calculator_profiles_user_id ON calculator_profiles(user_id);
CREATE INDEX idx_stock_user_id ON stock(user_id);
CREATE INDEX idx_stock_material_id ON stock(material_id);
CREATE INDEX idx_suppliers_user_id ON suppliers(user_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- Row Level Security (RLS) Policies
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobwork_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Customers
CREATE POLICY customers_select_policy ON customers
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY customers_insert_policy ON customers
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY customers_update_policy ON customers
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY customers_delete_policy ON customers
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Products
CREATE POLICY products_select_policy ON products
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY products_insert_policy ON products
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY products_update_policy ON products
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY products_delete_policy ON products
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Materials
CREATE POLICY materials_select_policy ON materials
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY materials_insert_policy ON materials
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY materials_update_policy ON materials
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY materials_delete_policy ON materials
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Machines
CREATE POLICY machines_select_policy ON machines
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY machines_insert_policy ON machines
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY machines_update_policy ON machines
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY machines_delete_policy ON machines
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Colors
CREATE POLICY colors_select_policy ON colors
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY colors_insert_policy ON colors
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY colors_update_policy ON colors
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY colors_delete_policy ON colors
  FOR DELETE USING (auth.uid() = user_id);
-- RLS Policies for Orders
CREATE POLICY orders_select_policy ON orders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY orders_insert_policy ON orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY orders_update_policy ON orders
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY orders_delete_policy ON orders
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Order Line Items
CREATE POLICY order_line_items_select_policy ON order_line_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_line_items.order_id AND auth.uid() = orders.user_id
  ));
CREATE POLICY order_line_items_insert_policy ON order_line_items
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_line_items.order_id AND auth.uid() = orders.user_id
  ));
CREATE POLICY order_line_items_update_policy ON order_line_items
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_line_items.order_id AND auth.uid() = orders.user_id
  ));
CREATE POLICY order_line_items_delete_policy ON order_line_items
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_line_items.order_id AND auth.uid() = orders.user_id
  ));

-- RLS Policies for Deliveries
CREATE POLICY deliveries_select_policy ON deliveries
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = deliveries.order_id AND auth.uid() = orders.user_id
  ));
CREATE POLICY deliveries_insert_policy ON deliveries
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = deliveries.order_id AND auth.uid() = orders.user_id
  ));
CREATE POLICY deliveries_update_policy ON deliveries
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = deliveries.order_id AND auth.uid() = orders.user_id
  ));
CREATE POLICY deliveries_delete_policy ON deliveries
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = deliveries.order_id AND auth.uid() = orders.user_id
  ));

-- RLS Policies for Jobwork Tracking
CREATE POLICY jobwork_select_policy ON jobwork_tracking
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = jobwork_tracking.order_id AND auth.uid() = orders.user_id
  ));
CREATE POLICY jobwork_insert_policy ON jobwork_tracking
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = jobwork_tracking.order_id AND auth.uid() = orders.user_id
  ));
CREATE POLICY jobwork_update_policy ON jobwork_tracking
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = jobwork_tracking.order_id AND auth.uid() = orders.user_id
  ));
CREATE POLICY jobwork_delete_policy ON jobwork_tracking
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = jobwork_tracking.order_id AND auth.uid() = orders.user_id
  ));

-- RLS Policies for Enquiries
CREATE POLICY enquiries_select_policy ON enquiries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY enquiries_insert_policy ON enquiries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY enquiries_update_policy ON enquiries
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY enquiries_delete_policy ON enquiries
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Calculator Profiles
CREATE POLICY calculator_profiles_select_policy ON calculator_profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY calculator_profiles_insert_policy ON calculator_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY calculator_profiles_update_policy ON calculator_profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY calculator_profiles_delete_policy ON calculator_profiles
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Stock
CREATE POLICY stock_select_policy ON stock
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY stock_insert_policy ON stock
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY stock_update_policy ON stock
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY stock_delete_policy ON stock
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Suppliers
CREATE POLICY suppliers_select_policy ON suppliers
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY suppliers_insert_policy ON suppliers
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY suppliers_update_policy ON suppliers
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY suppliers_delete_policy ON suppliers
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for Notifications
CREATE POLICY notifications_select_policy ON notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY notifications_insert_policy ON notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for Audit Log
CREATE POLICY audit_log_select_policy ON audit_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY audit_log_insert_policy ON audit_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Audit Triggers
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (user_id, table_name, record_id, action, old_values, new_values)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Create audit triggers for all main tables
CREATE TRIGGER audit_customers AFTER INSERT OR UPDATE OR DELETE ON customers FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_products AFTER INSERT OR UPDATE OR DELETE ON products FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_materials AFTER INSERT OR UPDATE OR DELETE ON materials FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE OR DELETE ON orders FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_enquiries AFTER INSERT OR UPDATE OR DELETE ON enquiries FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_deliveries AFTER INSERT OR UPDATE OR DELETE ON deliveries FOR EACH ROW EXECUTE FUNCTION audit_trigger();