// Levants Dairy Admin Dashboard - Mock Data

export interface Product {
  id: string;
  name: string;
  category: 'Milk' | 'Milkshakes' | 'Cream' | 'Honey' | 'Butter' | 'Cheese';
  description: string;
  longDescription: string;
  price: number;
  images: string[];
  variants?: { id: string; name: string; price: number }[];
  stock: {
    inStock: boolean;
    quantity: number;
    lowStockThreshold: number;
  };
  sku?: string;
  status: 'active' | 'draft' | 'archived';
  badges: ('Farm Fresh' | 'Bestseller' | 'Limited')[];
  allergens: string[];
  ingredients: string[];
  storageNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  variant?: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
  deliveryAddress: {
    line1: string;
    line2?: string;
    city: string;
    postcode: string;
  };
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentStatus: 'unpaid' | 'paid' | 'refunded' | 'partially_refunded';
  fulfillmentStatus: 'new' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled';
  deliverySlot: {
    date: string;
    timeWindow: string;
  };
  deliveryType: 'local_delivery';
  customerNotes?: string;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
  history: { status: string; timestamp: string; user: string }[];
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  addresses: {
    id: string;
    line1: string;
    line2?: string;
    city: string;
    postcode: string;
    isDefault: boolean;
  }[];
  orderCount: number;
  totalSpent: number;
  marketingOptIn: boolean;
  tags: string[];
  notes?: string;
  createdAt: string;
  lastOrderAt?: string;
}

export interface DeliverySlot {
  id: string;
  timeWindow: string;
  capacity: number;
  bookedCount: number;
  cutoffHours: number;
  isActive: boolean;
}

export interface DeliveryRoute {
  id: string;
  date: string;
  timeWindow: string;
  driver?: string;
  stops: {
    orderId: string;
    address: string;
    customerName: string;
    phone: string;
    status: 'pending' | 'delivered' | 'failed';
    order: number;
  }[];
  status: 'planned' | 'in_progress' | 'completed';
}

export type PromotionType = 'banner' | 'sitewide_discount' | 'product_discount' | 'free_shipping' | 'promo_code';
export type PromotionPlacement = 'homepage' | 'navbar' | 'checkout' | 'product_page' | 'all';
export type DiscountKind = 'percent' | 'fixed' | 'free_shipping' | 'none';
export type AppliesTo = 'all_products' | 'collections' | 'products';
export type PromotionStatus = 'active' | 'archived';

export interface Promotion {
  id: string;
  name: string;
  slug: string;
  
  // Type + placement
  type: PromotionType;
  placement: PromotionPlacement;
  
  // Content
  headline?: string;
  message?: string;
  imageUrl?: string;
  videoUrl?: string;
  ctaText?: string;
  ctaUrl?: string;
  
  // Discount config
  discountKind: DiscountKind;
  discountValue?: number;
  currency: string;
  minOrderValue?: number;
  maxDiscountValue?: number;
  
  // Targeting
  appliesTo: AppliesTo;
  productIds?: string[];
  productSkus?: string[];
  collectionIds?: string[];
  excludeProductIds?: string[];
  
  // Promo code fields (for type="promo_code")
  code?: string;
  usageLimit?: number;
  usageCount: number;
  perCustomerLimit?: number;
  
  // Scheduling + status
  isEnabled: boolean;
  status: PromotionStatus;
  startAt?: string;
  endAt?: string;
  priority: number;
  
  createdAt: string;
  updatedAt: string;
}

export interface ContentBlock {
  id: string;
  type: 'hero' | 'announcement' | 'testimonial' | 'faq';
  title: string;
  content: string;
  isActive: boolean;
  order: number;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'staff' | 'driver';
  avatar?: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  timestamp: string;
}

// Seed Products
export const products: Product[] = [
  {
    id: 'prod_001',
    name: 'Farm Fresh Milk',
    category: 'Milk',
    description: 'Pure, fresh whole milk from our local farm',
    longDescription: 'Our farm fresh milk comes directly from grass-fed cows raised on local farms. Rich in calcium and protein, this whole milk is perfect for drinking, cooking, or adding to your morning coffee. No artificial hormones or additives.',
    price: 2.49,
    images: ['/placeholder.svg'],
    variants: [
      { id: 'v1', name: '1 Litre', price: 2.49 },
      { id: 'v2', name: '2 Litres', price: 4.49 },
      { id: 'v3', name: '4 Pints', price: 3.99 }
    ],
    stock: { inStock: true, quantity: 150, lowStockThreshold: 30 },
    sku: 'MILK-001',
    status: 'active',
    badges: ['Farm Fresh', 'Bestseller'],
    allergens: ['Milk'],
    ingredients: ['Whole Milk'],
    storageNotes: 'Keep refrigerated at 1-5°C. Use within 5 days of opening.',
    createdAt: '2024-01-15T09:00:00Z',
    updatedAt: '2024-12-15T14:30:00Z'
  },
  {
    id: 'prod_002',
    name: 'Farm Fresh Milkshake',
    category: 'Milkshakes',
    description: 'Creamy, indulgent milkshakes in delicious flavours',
    longDescription: 'Made with our farm fresh milk and natural flavourings, our milkshakes are a delicious treat. Available in Chocolate, Strawberry, and Vanilla.',
    price: 3.29,
    images: ['/placeholder.svg'],
    variants: [
      { id: 'v1', name: 'Chocolate', price: 3.29 },
      { id: 'v2', name: 'Strawberry', price: 3.29 },
      { id: 'v3', name: 'Vanilla', price: 3.29 }
    ],
    stock: { inStock: true, quantity: 85, lowStockThreshold: 20 },
    sku: 'SHAKE-001',
    status: 'active',
    badges: ['Bestseller'],
    allergens: ['Milk'],
    ingredients: ['Whole Milk', 'Natural Flavourings', 'Sugar'],
    storageNotes: 'Keep refrigerated. Best consumed within 3 days of purchase.',
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-12-10T11:00:00Z'
  },
  {
    id: 'prod_003',
    name: 'Fresh Double Cream',
    category: 'Cream',
    description: 'Rich, thick double cream for cooking and desserts',
    longDescription: 'Our luxurious double cream has a minimum 48% fat content, making it perfect for whipping, pouring, or cooking. Sourced from local dairy farms.',
    price: 2.99,
    images: ['/placeholder.svg'],
    variants: [
      { id: 'v1', name: '300ml', price: 2.99 },
      { id: 'v2', name: '600ml', price: 5.49 }
    ],
    stock: { inStock: true, quantity: 65, lowStockThreshold: 15 },
    sku: 'CREAM-001',
    status: 'active',
    badges: ['Farm Fresh'],
    allergens: ['Milk'],
    ingredients: ['Double Cream'],
    storageNotes: 'Keep refrigerated at 1-5°C. Use within 3 days of opening.',
    createdAt: '2024-02-01T09:00:00Z',
    updatedAt: '2024-12-12T16:00:00Z'
  },
  {
    id: 'prod_004',
    name: 'Local Honey',
    category: 'Honey',
    description: 'Pure, raw honey from local beekeepers',
    longDescription: 'Our honey is sourced from local beekeepers and is 100% raw and unprocessed. Perfect for spreading, cooking, or adding natural sweetness to your drinks.',
    price: 6.99,
    images: ['/placeholder.svg'],
    variants: [
      { id: 'v1', name: '340g Jar', price: 6.99 },
      { id: 'v2', name: '680g Jar', price: 12.99 }
    ],
    stock: { inStock: true, quantity: 42, lowStockThreshold: 10 },
    sku: 'HONEY-001',
    status: 'active',
    badges: ['Farm Fresh', 'Limited'],
    allergens: [],
    ingredients: ['Raw Honey'],
    storageNotes: 'Store in a cool, dry place. Do not refrigerate.',
    createdAt: '2024-03-10T11:00:00Z',
    updatedAt: '2024-12-08T09:30:00Z'
  },
  {
    id: 'prod_005',
    name: 'Farm Butter',
    category: 'Butter',
    description: 'Traditional churned butter with rich, creamy taste',
    longDescription: 'Our butter is made using traditional churning methods from the finest cream. Available in salted and unsalted varieties.',
    price: 3.49,
    images: ['/placeholder.svg'],
    variants: [
      { id: 'v1', name: 'Salted 250g', price: 3.49 },
      { id: 'v2', name: 'Unsalted 250g', price: 3.49 }
    ],
    stock: { inStock: true, quantity: 95, lowStockThreshold: 25 },
    sku: 'BUTTER-001',
    status: 'active',
    badges: ['Farm Fresh'],
    allergens: ['Milk'],
    ingredients: ['Cream', 'Salt (salted variety only)'],
    storageNotes: 'Keep refrigerated. Can be frozen for up to 3 months.',
    createdAt: '2024-01-25T08:00:00Z',
    updatedAt: '2024-12-14T10:15:00Z'
  },
  {
    id: 'prod_006',
    name: 'Mature Cheddar',
    category: 'Cheese',
    description: 'Award-winning mature cheddar, aged 12 months',
    longDescription: 'Our mature cheddar is aged for a minimum of 12 months to develop a rich, complex flavour with a crumbly texture. Perfect for cheese boards or cooking.',
    price: 5.99,
    images: ['/placeholder.svg'],
    variants: [
      { id: 'v1', name: '200g Block', price: 5.99 },
      { id: 'v2', name: '400g Block', price: 10.99 }
    ],
    stock: { inStock: true, quantity: 38, lowStockThreshold: 10 },
    sku: 'CHEESE-001',
    status: 'active',
    badges: ['Bestseller'],
    allergens: ['Milk'],
    ingredients: ['Milk', 'Salt', 'Rennet', 'Starter Culture'],
    storageNotes: 'Keep refrigerated. Once opened, wrap tightly and use within 2 weeks.',
    createdAt: '2024-02-15T14:00:00Z',
    updatedAt: '2024-12-11T13:45:00Z'
  },
  {
    id: 'prod_007',
    name: 'Red Leicester',
    category: 'Cheese',
    description: 'Traditional Red Leicester with a nutty, sweet flavour',
    longDescription: 'Our Red Leicester cheese has a distinctive orange colour and a mild, nutty flavour with a slightly sweet finish. Made using annatto for natural colouring.',
    price: 5.49,
    images: ['/placeholder.svg'],
    variants: [
      { id: 'v1', name: '200g Block', price: 5.49 },
      { id: 'v2', name: '400g Block', price: 9.99 }
    ],
    stock: { inStock: true, quantity: 12, lowStockThreshold: 15 },
    sku: 'CHEESE-002',
    status: 'active',
    badges: ['Farm Fresh'],
    allergens: ['Milk'],
    ingredients: ['Milk', 'Salt', 'Rennet', 'Starter Culture', 'Annatto'],
    storageNotes: 'Keep refrigerated. Once opened, wrap tightly and use within 2 weeks.',
    createdAt: '2024-02-20T15:30:00Z',
    updatedAt: '2024-12-13T08:20:00Z'
  }
];

// Seed Customers
export const customers: Customer[] = [
  {
    id: 'cust_001',
    name: 'Sarah Johnson',
    email: 'sarah.johnson@email.com',
    phone: '07700 900123',
    addresses: [
      { id: 'addr_001', line1: '42 Oak Lane', city: 'Cambridge', postcode: 'CB1 2AB', isDefault: true }
    ],
    orderCount: 15,
    totalSpent: 187.45,
    marketingOptIn: true,
    tags: ['VIP', 'Regular'],
    createdAt: '2024-03-15T10:00:00Z',
    lastOrderAt: '2024-12-17T14:30:00Z'
  },
  {
    id: 'cust_002',
    name: 'Michael Chen',
    email: 'mchen@email.com',
    phone: '07700 900456',
    addresses: [
      { id: 'addr_002', line1: '15 High Street', line2: 'Flat 3', city: 'Cambridge', postcode: 'CB2 3CD', isDefault: true }
    ],
    orderCount: 8,
    totalSpent: 94.20,
    marketingOptIn: false,
    tags: [],
    createdAt: '2024-06-20T11:30:00Z',
    lastOrderAt: '2024-12-15T09:00:00Z'
  },
  {
    id: 'cust_003',
    name: 'Emma Williams',
    email: 'emma.w@email.com',
    phone: '07700 900789',
    addresses: [
      { id: 'addr_003', line1: '8 Mill Road', city: 'Cambridge', postcode: 'CB1 4EF', isDefault: true }
    ],
    orderCount: 22,
    totalSpent: 312.80,
    marketingOptIn: true,
    tags: ['VIP', 'Frequent Buyer'],
    notes: 'Prefers morning deliveries',
    createdAt: '2024-01-10T09:00:00Z',
    lastOrderAt: '2024-12-18T16:45:00Z'
  },
  {
    id: 'cust_004',
    name: 'James Brown',
    email: 'jbrown@email.com',
    phone: '07700 900321',
    addresses: [
      { id: 'addr_004', line1: '27 Church Street', city: 'Ely', postcode: 'CB7 5GH', isDefault: true }
    ],
    orderCount: 3,
    totalSpent: 42.50,
    marketingOptIn: true,
    tags: [],
    createdAt: '2024-10-05T14:00:00Z',
    lastOrderAt: '2024-12-10T11:20:00Z'
  }
];

// Seed Orders
export const orders: Order[] = [
  {
    id: 'ord_001',
    orderNumber: 'LD-2024-001247',
    customer: { id: 'cust_001', name: 'Sarah Johnson', email: 'sarah.johnson@email.com', phone: '07700 900123' },
    deliveryAddress: { line1: '42 Oak Lane', city: 'Cambridge', postcode: 'CB1 2AB' },
    items: [
      { productId: 'prod_001', name: 'Farm Fresh Milk', variant: '2 Litres', quantity: 2, unitPrice: 4.49 },
      { productId: 'prod_005', name: 'Farm Butter', variant: 'Salted 250g', quantity: 1, unitPrice: 3.49 }
    ],
    subtotal: 12.47,
    deliveryFee: 2.99,
    discount: 0,
    total: 15.46,
    paymentStatus: 'paid',
    fulfillmentStatus: 'new',
    deliverySlot: { date: '2024-12-19', timeWindow: '9:00 AM - 12:00 PM' },
    deliveryType: 'local_delivery',
    createdAt: '2024-12-18T10:30:00Z',
    updatedAt: '2024-12-18T10:30:00Z',
    history: [{ status: 'new', timestamp: '2024-12-18T10:30:00Z', user: 'System' }]
  },
  {
    id: 'ord_002',
    orderNumber: 'LD-2024-001246',
    customer: { id: 'cust_003', name: 'Emma Williams', email: 'emma.w@email.com', phone: '07700 900789' },
    deliveryAddress: { line1: '8 Mill Road', city: 'Cambridge', postcode: 'CB1 4EF' },
    items: [
      { productId: 'prod_006', name: 'Mature Cheddar', variant: '400g Block', quantity: 1, unitPrice: 10.99 },
      { productId: 'prod_003', name: 'Fresh Double Cream', variant: '300ml', quantity: 2, unitPrice: 2.99 },
      { productId: 'prod_004', name: 'Local Honey', variant: '340g Jar', quantity: 1, unitPrice: 6.99 }
    ],
    subtotal: 23.96,
    deliveryFee: 2.99,
    discount: 2.00,
    total: 24.95,
    paymentStatus: 'paid',
    fulfillmentStatus: 'preparing',
    deliverySlot: { date: '2024-12-19', timeWindow: '12:00 PM - 3:00 PM' },
    deliveryType: 'local_delivery',
    customerNotes: 'Please leave with neighbour if not home',
    createdAt: '2024-12-17T16:45:00Z',
    updatedAt: '2024-12-18T08:00:00Z',
    history: [
      { status: 'new', timestamp: '2024-12-17T16:45:00Z', user: 'System' },
      { status: 'confirmed', timestamp: '2024-12-17T17:00:00Z', user: 'Admin' },
      { status: 'preparing', timestamp: '2024-12-18T08:00:00Z', user: 'Staff' }
    ]
  },
  {
    id: 'ord_003',
    orderNumber: 'LD-2024-001245',
    customer: { id: 'cust_002', name: 'Michael Chen', email: 'mchen@email.com', phone: '07700 900456' },
    deliveryAddress: { line1: '15 High Street', line2: 'Flat 3', city: 'Cambridge', postcode: 'CB2 3CD' },
    items: [
      { productId: 'prod_002', name: 'Farm Fresh Milkshake', variant: 'Chocolate', quantity: 3, unitPrice: 3.29 },
      { productId: 'prod_001', name: 'Farm Fresh Milk', variant: '1 Litre', quantity: 2, unitPrice: 2.49 }
    ],
    subtotal: 14.85,
    deliveryFee: 2.99,
    discount: 0,
    total: 17.84,
    paymentStatus: 'paid',
    fulfillmentStatus: 'out_for_delivery',
    deliverySlot: { date: '2024-12-19', timeWindow: '9:00 AM - 12:00 PM' },
    deliveryType: 'local_delivery',
    createdAt: '2024-12-17T09:15:00Z',
    updatedAt: '2024-12-18T09:30:00Z',
    history: [
      { status: 'new', timestamp: '2024-12-17T09:15:00Z', user: 'System' },
      { status: 'confirmed', timestamp: '2024-12-17T09:30:00Z', user: 'Admin' },
      { status: 'preparing', timestamp: '2024-12-18T07:00:00Z', user: 'Staff' },
      { status: 'out_for_delivery', timestamp: '2024-12-18T09:30:00Z', user: 'Driver' }
    ]
  },
  {
    id: 'ord_004',
    orderNumber: 'LD-2024-001244',
    customer: { id: 'cust_004', name: 'James Brown', email: 'jbrown@email.com', phone: '07700 900321' },
    deliveryAddress: { line1: '27 Church Street', city: 'Ely', postcode: 'CB7 5GH' },
    items: [
      { productId: 'prod_007', name: 'Red Leicester', variant: '200g Block', quantity: 2, unitPrice: 5.49 }
    ],
    subtotal: 10.98,
    deliveryFee: 3.99,
    discount: 0,
    total: 14.97,
    paymentStatus: 'paid',
    fulfillmentStatus: 'delivered',
    deliverySlot: { date: '2024-12-18', timeWindow: '3:00 PM - 6:00 PM' },
    deliveryType: 'local_delivery',
    createdAt: '2024-12-16T14:20:00Z',
    updatedAt: '2024-12-18T16:45:00Z',
    history: [
      { status: 'new', timestamp: '2024-12-16T14:20:00Z', user: 'System' },
      { status: 'confirmed', timestamp: '2024-12-16T15:00:00Z', user: 'Admin' },
      { status: 'preparing', timestamp: '2024-12-17T08:00:00Z', user: 'Staff' },
      { status: 'out_for_delivery', timestamp: '2024-12-18T14:00:00Z', user: 'Driver' },
      { status: 'delivered', timestamp: '2024-12-18T16:45:00Z', user: 'Driver' }
    ]
  },
  {
    id: 'ord_005',
    orderNumber: 'LD-2024-001243',
    customer: { id: 'cust_001', name: 'Sarah Johnson', email: 'sarah.johnson@email.com', phone: '07700 900123' },
    deliveryAddress: { line1: '42 Oak Lane', city: 'Cambridge', postcode: 'CB1 2AB' },
    items: [
      { productId: 'prod_001', name: 'Farm Fresh Milk', variant: '4 Pints', quantity: 1, unitPrice: 3.99 }
    ],
    subtotal: 3.99,
    deliveryFee: 2.99,
    discount: 0,
    total: 6.98,
    paymentStatus: 'refunded',
    fulfillmentStatus: 'cancelled',
    deliverySlot: { date: '2024-12-17', timeWindow: '9:00 AM - 12:00 PM' },
    deliveryType: 'local_delivery',
    internalNotes: 'Customer requested cancellation - duplicate order',
    createdAt: '2024-12-15T11:00:00Z',
    updatedAt: '2024-12-15T12:30:00Z',
    history: [
      { status: 'new', timestamp: '2024-12-15T11:00:00Z', user: 'System' },
      { status: 'cancelled', timestamp: '2024-12-15T12:30:00Z', user: 'Admin' }
    ]
  }
];

// Delivery Slots
export const deliverySlots: DeliverySlot[] = [
  { id: 'slot_001', timeWindow: '9:00 AM - 12:00 PM', capacity: 20, bookedCount: 12, cutoffHours: 14, isActive: true },
  { id: 'slot_002', timeWindow: '12:00 PM - 3:00 PM', capacity: 20, bookedCount: 8, cutoffHours: 14, isActive: true },
  { id: 'slot_003', timeWindow: '3:00 PM - 6:00 PM', capacity: 15, bookedCount: 15, cutoffHours: 14, isActive: true },
  { id: 'slot_004', timeWindow: '6:00 PM - 8:00 PM', capacity: 10, bookedCount: 3, cutoffHours: 14, isActive: false }
];

// Delivery Routes
export const deliveryRoutes: DeliveryRoute[] = [
  {
    id: 'route_001',
    date: '2024-12-19',
    timeWindow: '9:00 AM - 12:00 PM',
    driver: 'Tom Wilson',
    stops: [
      { orderId: 'ord_001', address: '42 Oak Lane, Cambridge CB1 2AB', customerName: 'Sarah Johnson', phone: '07700 900123', status: 'pending', order: 1 },
      { orderId: 'ord_003', address: '15 High Street, Flat 3, Cambridge CB2 3CD', customerName: 'Michael Chen', phone: '07700 900456', status: 'pending', order: 2 }
    ],
    status: 'planned'
  }
];

// Promotions
export const promotions: Promotion[] = [
  {
    id: 'promo_001',
    name: 'Welcome 10% Off',
    slug: 'welcome-10-off',
    type: 'promo_code',
    placement: 'checkout',
    headline: 'Welcome to Levants Dairy!',
    message: 'Use this code on your first order to get 10% off.',
    discountKind: 'percent',
    discountValue: 10,
    currency: 'GBP',
    appliesTo: 'all_products',
    code: 'WELCOME10',
    usageLimit: 1000,
    usageCount: 247,
    perCustomerLimit: 1,
    isEnabled: true,
    status: 'active',
    startAt: '2024-01-01T00:00:00Z',
    endAt: '2024-12-31T23:59:59Z',
    priority: 10,
    createdAt: '2024-01-01T09:00:00Z',
    updatedAt: '2024-12-15T14:30:00Z'
  },
  {
    id: 'promo_002',
    name: 'Free Holiday Delivery',
    slug: 'free-holiday-delivery',
    type: 'free_shipping',
    placement: 'all',
    headline: 'Free Delivery This Christmas!',
    message: 'Enjoy free delivery on all orders over £15 during the holiday season.',
    discountKind: 'free_shipping',
    currency: 'GBP',
    minOrderValue: 15,
    appliesTo: 'all_products',
    usageLimit: 500,
    usageCount: 89,
    isEnabled: true,
    status: 'active',
    startAt: '2024-12-01T00:00:00Z',
    endAt: '2024-12-25T23:59:59Z',
    priority: 20,
    createdAt: '2024-12-01T09:00:00Z',
    updatedAt: '2024-12-10T11:00:00Z'
  },
  {
    id: 'promo_003',
    name: 'Save £5',
    slug: 'save-5',
    type: 'promo_code',
    placement: 'checkout',
    message: 'Get £5 off orders over £25.',
    discountKind: 'fixed',
    discountValue: 5,
    currency: 'GBP',
    minOrderValue: 25,
    appliesTo: 'all_products',
    code: 'SAVE5',
    usageCount: 156,
    isEnabled: false,
    status: 'archived',
    startAt: '2024-11-01T00:00:00Z',
    endAt: '2024-11-30T23:59:59Z',
    priority: 5,
    createdAt: '2024-10-25T10:00:00Z',
    updatedAt: '2024-12-01T12:00:00Z'
  },
  {
    id: 'promo_004',
    name: 'Homepage Holiday Banner',
    slug: 'homepage-holiday-banner',
    type: 'banner',
    placement: 'homepage',
    headline: 'Fresh Farm Dairy for Christmas',
    message: 'Order now for guaranteed Christmas Eve delivery! Farm-fresh milk, cream, cheese, and more.',
    imageUrl: '/placeholder.svg',
    ctaText: 'Shop Now',
    ctaUrl: '/products',
    discountKind: 'none',
    currency: 'GBP',
    appliesTo: 'all_products',
    usageCount: 0,
    isEnabled: true,
    status: 'active',
    startAt: '2024-12-01T00:00:00Z',
    endAt: '2024-12-26T00:00:00Z',
    priority: 100,
    createdAt: '2024-11-28T14:00:00Z',
    updatedAt: '2024-12-05T09:30:00Z'
  },
  {
    id: 'promo_005',
    name: 'New Year Cheese Sale',
    slug: 'new-year-cheese-sale',
    type: 'product_discount',
    placement: 'product_page',
    headline: '20% Off All Cheese',
    message: 'Celebrate the New Year with savings on our award-winning cheeses.',
    discountKind: 'percent',
    discountValue: 20,
    currency: 'GBP',
    appliesTo: 'collections',
    collectionIds: ['cheese'],
    usageCount: 0,
    isEnabled: false,
    status: 'active',
    startAt: '2025-01-01T00:00:00Z',
    endAt: '2025-01-07T23:59:59Z',
    priority: 15,
    createdAt: '2024-12-10T11:00:00Z',
    updatedAt: '2024-12-10T11:00:00Z'
  },
  {
    id: 'promo_006',
    name: 'Navbar Announcement',
    slug: 'navbar-announcement',
    type: 'banner',
    placement: 'navbar',
    headline: '🎄 Order by Dec 22 for Christmas delivery!',
    discountKind: 'none',
    currency: 'GBP',
    appliesTo: 'all_products',
    usageCount: 0,
    isEnabled: true,
    status: 'active',
    priority: 50,
    createdAt: '2024-12-15T08:00:00Z',
    updatedAt: '2024-12-15T08:00:00Z'
  }
];

// Content Blocks
export const contentBlocks: ContentBlock[] = [
  { id: 'content_001', type: 'hero', title: 'Farm Fresh Dairy, Delivered to Your Door', content: 'Experience the taste of locally sourced dairy products delivered straight from our farms to your table.', isActive: true, order: 1 },
  { id: 'content_002', type: 'announcement', title: 'Christmas Delivery Schedule', content: 'Order by December 22nd for guaranteed Christmas Eve delivery!', isActive: true, order: 2 },
  { id: 'content_003', type: 'testimonial', title: 'Sarah J., Cambridge', content: 'The freshest milk I\'ve ever tasted! Delivery is always on time and the team is so friendly.', isActive: true, order: 1 },
  { id: 'content_004', type: 'faq', title: 'How do I change my delivery slot?', content: 'You can modify your delivery slot up to 24 hours before delivery by contacting our team or updating your order in your account.', isActive: true, order: 1 }
];

// Admin Users
export const adminUsers: AdminUser[] = [
  { id: 'admin_001', name: 'John Levant', email: 'john@levantsdairy.com', role: 'owner', isActive: true, createdAt: '2024-01-01T00:00:00Z', lastLoginAt: '2024-12-19T08:00:00Z' },
  { id: 'admin_002', name: 'Mary Smith', email: 'mary@levantsdairy.com', role: 'admin', isActive: true, createdAt: '2024-02-15T10:00:00Z', lastLoginAt: '2024-12-18T17:30:00Z' },
  { id: 'admin_003', name: 'Alex Johnson', email: 'alex@levantsdairy.com', role: 'staff', isActive: true, createdAt: '2024-03-20T09:00:00Z', lastLoginAt: '2024-12-19T07:45:00Z' },
  { id: 'admin_004', name: 'Tom Wilson', email: 'tom@levantsdairy.com', role: 'driver', isActive: true, createdAt: '2024-04-10T11:00:00Z', lastLoginAt: '2024-12-19T08:30:00Z' }
];

// Audit Logs
export const auditLogs: AuditLog[] = [
  { id: 'log_001', userId: 'admin_002', userName: 'Mary Smith', action: 'order_status_change', entityType: 'order', entityId: 'ord_002', details: 'Changed status from "confirmed" to "preparing"', timestamp: '2024-12-18T08:00:00Z' },
  { id: 'log_002', userId: 'admin_003', userName: 'Alex Johnson', action: 'product_update', entityType: 'product', entityId: 'prod_001', details: 'Updated stock quantity from 145 to 150', timestamp: '2024-12-17T15:30:00Z' },
  { id: 'log_003', userId: 'admin_001', userName: 'John Levant', action: 'order_refund', entityType: 'order', entityId: 'ord_005', details: 'Refunded £6.98 - reason: duplicate order', timestamp: '2024-12-15T12:30:00Z' },
  { id: 'log_004', userId: 'admin_002', userName: 'Mary Smith', action: 'promo_create', entityType: 'promotion', entityId: 'promo_002', details: 'Created promotion code FREEDELIVERY', timestamp: '2024-12-01T09:00:00Z' },
  { id: 'log_005', userId: 'admin_001', userName: 'John Levant', action: 'settings_change', entityType: 'settings', entityId: 'delivery_fee', details: 'Updated base delivery fee from £2.50 to £2.99', timestamp: '2024-11-28T14:00:00Z' }
];

// Dashboard Stats
export const getDashboardStats = () => {
  const today = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter(o => o.createdAt.startsWith(today) || o.createdAt.startsWith('2024-12-18'));
  
  return {
    ordersToday: todayOrders.length,
    revenueToday: todayOrders.reduce((sum, o) => sum + o.total, 0),
    revenueWeek: orders.reduce((sum, o) => sum + o.total, 0),
    pendingPreparation: orders.filter(o => o.fulfillmentStatus === 'new' || o.fulfillmentStatus === 'confirmed').length,
    outForDelivery: orders.filter(o => o.fulfillmentStatus === 'out_for_delivery').length,
    delivered: orders.filter(o => o.fulfillmentStatus === 'delivered').length,
    lowStockItems: products.filter(p => p.stock.quantity <= p.stock.lowStockThreshold).length
  };
};
