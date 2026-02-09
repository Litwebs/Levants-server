// mockData.ts

/* =========================
   DOMAIN TYPES
   ========================= */

export type FulfillmentStatus =
  | 'new'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus =
  | 'paid'
  | 'unpaid'
  | 'refunded'
  | 'partially_refunded';

export interface OrderItem {
  name: string;
  variant?: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderHistoryEntry {
  status: FulfillmentStatus;
  timestamp: string;
  user: string;
}

export interface Order {
  id: string;
  orderNumber: string;

  customer: {
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

  deliverySlot: {
    date: string;
    timeWindow: string;
  };

  items: OrderItem[];

  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;

  fulfillmentStatus: FulfillmentStatus;
  paymentStatus: PaymentStatus;

  customerNotes?: string;
  internalNotes?: string;

  history: OrderHistoryEntry[];

  createdAt: string;
  updatedAt: string;
}

/* =========================
   MOCK DATA
   ========================= */

export const orders: Order[] = [
  {
    id: 'ord_001',
    orderNumber: 'ORD-1001',
    customer: {
      name: 'Sarah Ahmed',
      email: 'sarah@example.com',
      phone: '07123456789',
    },
    deliveryAddress: {
      line1: '12 Market Street',
      city: 'Bradford',
      postcode: 'BD1 1AA',
    },
    deliverySlot: {
      date: new Date().toISOString(),
      timeWindow: '10:00 – 12:00',
    },
    items: [
      { name: 'Whole Milk', quantity: 2, unitPrice: 1.99 },
      { name: 'Cheddar Cheese', variant: 'Mature', quantity: 1, unitPrice: 4.5 },
    ],
    subtotal: 8.48,
    deliveryFee: 2.5,
    discount: 0,
    total: 10.98,
    fulfillmentStatus: 'new',
    paymentStatus: 'paid',
    history: [
      {
        status: 'new',
        timestamp: new Date().toISOString(),
        user: 'System',
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
