import { supabase, withRetry } from './supabase';

// CUSTOMERS
export const customers = {
  list: async (userId) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('customers')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  get: async (id) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('customers')
          .select('*')
          .eq('id', id)
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  create: async (customer) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('customers')
          .insert([customer])
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  update: async (id, updates) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('customers')
          .update(updates)
          .eq('id', id)
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  delete: async (id) => {
    try {
      const { error } = await withRetry(() =>
        supabase
          .from('customers')
          .delete()
          .eq('id', id)
      );
      return { error };
    } catch (error) {
      return { error };
    }
  },
};
// PRODUCTS
export const products = {
  getAll: async () => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  list: async (userId) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('products')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  get: async (id) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  create: async (product) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('products')
          .insert([product])
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  update: async (id, updates) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('products')
          .update(updates)
          .eq('id', id)
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  delete: async (id) => {
    try {
      const { error } = await withRetry(() =>
        supabase
          .from('products')
          .delete()
          .eq('id', id)
      );
      return { error };
    } catch (error) {
      return { error };
    }
  },
};
// MATERIALS
export const materials = {
  getAll: async () => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('materials')
          .select('*')
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  list: async (userId) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('materials')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  get: async (id) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('materials')
          .select('*')
          .eq('id', id)
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  create: async (material) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('materials')
          .insert([material])
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  update: async (id, updates) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('materials')
          .update(updates)
          .eq('id', id)
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  delete: async (id) => {
    try {
      const { error } = await withRetry(() =>
        supabase
          .from('materials')
          .delete()
          .eq('id', id)
      );
      return { error };
    } catch (error) {
      return { error };
    }
  },
};
// MACHINES
export const machines = {
  getAll: async () => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('machines')
          .select('*')
          .order('code', { ascending: true })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  list: async (userId) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('machines')
          .select('*')
          .eq('user_id', userId)
          .order('code', { ascending: true })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  get: async (id) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('machines')
          .select('*')
          .eq('id', id)
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },
};

// COLORS
export const colors = {
  getAll: async () => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('colors')
          .select('*')
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  list: async (userId) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('colors')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  get: async (id) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('colors')
          .select('*')
          .eq('id', id)
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  create: async (color) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('colors')
          .insert([color])
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  update: async (id, updates) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('colors')
          .update(updates)
          .eq('id', id)
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  delete: async (id) => {
    try {
      const { error } = await withRetry(() =>
        supabase
          .from('colors')
          .delete()
          .eq('id', id)
      );
      return { error };
    } catch (error) {
      return { error };
    }
  },
};
// ORDERS
const generateOrderNumber = (lastOrderNumber) => {
  if (!lastOrderNumber) return 'ORD001';
  const num = parseInt(lastOrderNumber.replace('ORD', '')) + 1;
  return `ORD${String(num).padStart(3, '0')}`;
};

export const orders = {
  list: async (userId) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('orders')
          .select('*, customers(*), order_line_items(*)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  get: async (id) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('orders')
          .select('*, customers(*), order_line_items(*, products(*), materials(*), machines(*), colors(*))')
          .eq('id', id)
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  create: async (order) => {
    try {
      const { data: lastOrder } = await supabase
        .from('orders')
        .select('order_number')
        .eq('user_id', order.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const orderNumber = generateOrderNumber(lastOrder?.order_number);

      const { data, error } = await withRetry(() =>
        supabase
          .from('orders')
          .insert([{ ...order, order_number: orderNumber }])
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  update: async (id, updates) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('orders')
          .update(updates)
          .eq('id', id)
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  duplicate: async (id) => {
    try {
      const { data: order, error: getError } = await this.get(id);
      if (getError || !order) return { data: null, error: getError };

      const { order_line_items, ...orderData } = order;
      const { id: _, order_number: __, ...newOrder } = orderData;

      const { data: createdOrder, error: createError } = await this.create(newOrder);
      if (createError || !createdOrder) return { data: null, error: createError };

      const lineItems = order_line_items.map(item => {
        const { id: _, order_id: __, ...newItem } = item;
        return { ...newItem, order_id: createdOrder.id };
      });

      const { error: lineError } = await lineItems.create(lineItems);
      return { data: createdOrder, error: lineError };
    } catch (error) {
      return { data: null, error };
    }
  },

  convertSampleToFull: async (id) => {
    try {
      const { data, error } = await this.update(id, { nature: 'full_production' });
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },
};
// LINE ITEMS
export const lineItems = {
  create: async (items) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('order_line_items')
          .insert(items)
          .select()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  update: async (id, updates) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('order_line_items')
          .update(updates)
          .eq('id', id)
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  delete: async (id) => {
    try {
      const { error } = await withRetry(() =>
        supabase
          .from('order_line_items')
          .delete()
          .eq('id', id)
      );
      return { error };
    } catch (error) {
      return { error };
    }
  },
};

// JOBWORK
export const jobwork = {
  list: async (orderId) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('jobwork_tracking')
          .select('*')
          .eq('order_id', orderId)
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  create: async (jobworkData) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('jobwork_tracking')
          .insert([jobworkData])
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  update: async (id, updates) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('jobwork_tracking')
          .update(updates)
          .eq('id', id)
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },
};
// DELIVERIES
export const deliveries = {
  list: async (orderId) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('deliveries')
          .select('*')
          .eq('order_id', orderId)
          .order('created_at', { ascending: true })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  create: async (deliveryData) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('deliveries')
          .insert([deliveryData])
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  update: async (id, updates) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('deliveries')
          .update(updates)
          .eq('id', id)
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  delete: async (id) => {
    try {
      const { error } = await withRetry(() =>
        supabase
          .from('deliveries')
          .delete()
          .eq('id', id)
      );
      return { error };
    } catch (error) {
      return { error };
    }
  },
};

// ENQUIRIES
export const enquiries = {
  list: async (userId) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('enquiries')
          .select('*, customers(*)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  get: async (id) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('enquiries')
          .select('*, customers(*)')
          .eq('id', id)
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  create: async (enquiry) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('enquiries')
          .insert([enquiry])
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  update: async (id, updates) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('enquiries')
          .update(updates)
          .eq('id', id)
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  convertToOrder: async (enquiryId) => {
    try {
      const { data: enquiry, error: getError } = await this.get(enquiryId);
      if (getError || !enquiry) return { data: null, error: getError };

      const newOrder = {
        customer_id: enquiry.customer_id,
        nature: 'full_production',
        order_type: 'standard',
        priority: 'normal',
        delivery_date: enquiry.followup_date,
        user_id: enquiry.user_id,
      };

      const { data: order, error: createError } = await orders.create(newOrder);
      if (createError || !order) return { data: null, error: createError };

      const { error: updateError } = await this.update(enquiryId, { status: 'converted' });
      return { data: order, error: updateError };
    } catch (error) {
      return { data: null, error };
    }
  },
};
// CALCULATOR PROFILES
export const calculatorProfiles = {
  list: async (userId) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('calculator_profiles')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  create: async (profile) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('calculator_profiles')
          .insert([profile])
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  update: async (id, updates) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('calculator_profiles')
          .update(updates)
          .eq('id', id)
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  delete: async (id) => {
    try {
      const { error } = await withRetry(() =>
        supabase
          .from('calculator_profiles')
          .delete()
          .eq('id', id)
      );
      return { error };
    } catch (error) {
      return { error };
    }
  },
};

// STOCK
export const stock = {
  list: async (userId) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('stock')
          .select('*, materials(*)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  create: async (stockData) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('stock')
          .insert([stockData])
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  update: async (id, updates) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('stock')
          .update(updates)
          .eq('id', id)
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  delete: async (id) => {
    try {
      const { error } = await withRetry(() =>
        supabase
          .from('stock')
          .delete()
          .eq('id', id)
      );
      return { error };
    } catch (error) {
      return { error };
    }
  },
};
// SUPPLIERS
export const suppliers = {
  getAll: async () => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('suppliers')
          .select('*')
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  list: async (userId) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('suppliers')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  get: async (id) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('suppliers')
          .select('*')
          .eq('id', id)
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  create: async (supplier) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('suppliers')
          .insert([supplier])
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  update: async (id, updates) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('suppliers')
          .update(updates)
          .eq('id', id)
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  delete: async (id) => {
    try {
      const { error } = await withRetry(() =>
        supabase
          .from('suppliers')
          .delete()
          .eq('id', id)
      );
      return { error };
    } catch (error) {
      return { error };
    }
  },
};

// NOTIFICATIONS
export const notifications = {
  list: async (userId) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  create: async (notification) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('notifications')
          .insert([notification])
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  markAsRead: async (id) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },
};

// AUDIT LOG
export const auditLog = {
  create: async (logData) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('audit_log')
          .insert([logData])
          .select()
          .single()
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  list: async (userId) => {
    try {
      const { data, error } = await withRetry(() =>
        supabase
          .from('audit_log')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },
};

// STATS & ANALYTICS
export const stats = {
  getDashboard: async (userId) => {
    try {
      const [orders, enquiries, customers] = await Promise.all([
        supabase.from('orders').select('id, status').eq('user_id', userId),
        supabase.from('enquiries').select('id, status').eq('user_id', userId),
        supabase.from('customers').select('id').eq('user_id', userId),
      ]);

      return {
        data: {
          totalOrders: orders.data?.length || 0,
          newEnquiries: enquiries.data?.filter(e => e.status === 'new').length || 0,
          pendingOrders: orders.data?.filter(o => o.status !== 'delivered').length || 0,
          totalCustomers: customers.data?.length || 0,
        },
        error: null,
      };
    } catch (error) {
      return { data: null, error };
    }
  },
};