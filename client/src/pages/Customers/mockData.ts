// mockData.ts

/* =========================
   TYPES
========================= */

export type FulfillmentStatus =
  | "new"
  | "confirmed"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export type PaymentStatus =
  | "paid"
  | "unpaid"
  | "refunded"
  | "partially_refunded";

export interface Address {
  id: string;
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  isDefault?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  addresses: Address[];
  marketingOptIn: boolean;
  notes?: string;
  createdAt: string;
  lastOrderAt?: string;
  orderCount: number;
  totalSpent: number;
}

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
    id: string;
    name: string;
    email: string;
    phone: string;
  };

  deliveryAddress: Address;

  items: OrderItem[];

  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;

  fulfillmentStatus: FulfillmentStatus;
  paymentStatus: PaymentStatus;

  deliverySlot: {
    date: string;
    timeWindow: string;
  };

  history: OrderHistoryEntry[];

  customerNotes?: string;
  internalNotes?: string;

  createdAt: string;
  updatedAt: string;
}

/* =========================
   CUSTOMERS
========================= */

export const customers: Customer[] = [
  {
    id: "cust_1",
    name: "Sarah Johnson",
    email: "sarah.johnson@example.com",
    phone: "07123456789",
    marketingOptIn: true,
    createdAt: "2023-04-12T09:30:00Z",
    lastOrderAt: "2024-01-18T14:20:00Z",
    orderCount: 5,
    totalSpent: 184.5,
    notes: "Prefers morning deliveries",
    addresses: [
      {
        id: "addr_1",
        line1: "12 Market Street",
        city: "Leeds",
        postcode: "LS1 3AB",
        isDefault: true,
      },
    ],
  },
  {
    id: "cust_2",
    name: "Daniel Moore",
    email: "daniel.moore@example.com",
    phone: "07987654321",
    marketingOptIn: false,
    createdAt: "2023-07-02T11:15:00Z",
    lastOrderAt: "2023-12-02T10:00:00Z",
    orderCount: 2,
    totalSpent: 72.0,
    addresses: [
      {
        id: "addr_2",
        line1: "44 Oak Avenue",
        city: "Bradford",
        postcode: "BD5 7TR",
        isDefault: true,
      },
    ],
  },
  {
    id: "cust_3",
    name: "Aisha Khan",
    email: "aisha.khan@example.com",
    phone: "07000111222",
    marketingOptIn: true,
    createdAt: "2024-01-03T08:40:00Z",
    orderCount: 0,
    totalSpent: 0,
    addresses: [
      {
        id: "addr_3",
        line1: "89 Green Road",
        city: "Manchester",
        postcode: "M14 5AP",
        isDefault: true,
      },
    ],
  },
  {
    id: "cust_3",
    name: "Aisha Khan",
    email: "aisha.khan@example.com",
    phone: "07000111222",
    marketingOptIn: true,
    createdAt: "2024-01-03T08:40:00Z",
    orderCount: 0,
    totalSpent: 0,
    addresses: [
      {
        id: "addr_3",
        line1: "89 Green Road",
        city: "Manchester",
        postcode: "M14 5AP",
        isDefault: true,
      },
    ],
  },
  {
    id: "cust_3",
    name: "Aisha Khan",
    email: "aisha.khan@example.com",
    phone: "07000111222",
    marketingOptIn: true,
    createdAt: "2024-01-03T08:40:00Z",
    orderCount: 0,
    totalSpent: 0,
    addresses: [
      {
        id: "addr_3",
        line1: "89 Green Road",
        city: "Manchester",
        postcode: "M14 5AP",
        isDefault: true,
      },
    ],
  },
  {
    id: "cust_3",
    name: "Aisha Khan",
    email: "aisha.khan@example.com",
    phone: "07000111222",
    marketingOptIn: true,
    createdAt: "2024-01-03T08:40:00Z",
    orderCount: 0,
    totalSpent: 0,
    addresses: [
      {
        id: "addr_3",
        line1: "89 Green Road",
        city: "Manchester",
        postcode: "M14 5AP",
        isDefault: true,
      },
    ],
  },
  {
    id: "cust_3",
    name: "Aisha Khan",
    email: "aisha.khan@example.com",
    phone: "07000111222",
    marketingOptIn: true,
    createdAt: "2024-01-03T08:40:00Z",
    orderCount: 0,
    totalSpent: 0,
    addresses: [
      {
        id: "addr_3",
        line1: "89 Green Road",
        city: "Manchester",
        postcode: "M14 5AP",
        isDefault: true,
      },
    ],
  },
  {
    id: "cust_3",
    name: "Aisha Khan",
    email: "aisha.khan@example.com",
    phone: "07000111222",
    marketingOptIn: true,
    createdAt: "2024-01-03T08:40:00Z",
    orderCount: 0,
    totalSpent: 0,
    addresses: [
      {
        id: "addr_3",
        line1: "89 Green Road",
        city: "Manchester",
        postcode: "M14 5AP",
        isDefault: true,
      },
    ],
  },
  {
    id: "cust_3",
    name: "Aisha Khan",
    email: "aisha.khan@example.com",
    phone: "07000111222",
    marketingOptIn: true,
    createdAt: "2024-01-03T08:40:00Z",
    orderCount: 0,
    totalSpent: 0,
    addresses: [
      {
        id: "addr_3",
        line1: "89 Green Road",
        city: "Manchester",
        postcode: "M14 5AP",
        isDefault: true,
      },
    ],
  },
  {
    id: "cust_3",
    name: "Aisha Khan",
    email: "aisha.khan@example.com",
    phone: "07000111222",
    marketingOptIn: true,
    createdAt: "2024-01-03T08:40:00Z",
    orderCount: 0,
    totalSpent: 0,
    addresses: [
      {
        id: "addr_3",
        line1: "89 Green Road",
        city: "Manchester",
        postcode: "M14 5AP",
        isDefault: true,
      },
    ],
  },
  {
    id: "cust_3",
    name: "Aisha Khan",
    email: "aisha.khan@example.com",
    phone: "07000111222",
    marketingOptIn: true,
    createdAt: "2024-01-03T08:40:00Z",
    orderCount: 0,
    totalSpent: 0,
    addresses: [
      {
        id: "addr_3",
        line1: "89 Green Road",
        city: "Manchester",
        postcode: "M14 5AP",
        isDefault: true,
      },
    ],
  },
  {
    id: "cust_3",
    name: "Aisha Khan",
    email: "aisha.khan@example.com",
    phone: "07000111222",
    marketingOptIn: true,
    createdAt: "2024-01-03T08:40:00Z",
    orderCount: 0,
    totalSpent: 0,
    addresses: [
      {
        id: "addr_3",
        line1: "89 Green Road",
        city: "Manchester",
        postcode: "M14 5AP",
        isDefault: true,
      },
    ],
  },
  {
    id: "cust_3",
    name: "Aisha Khan",
    email: "aisha.khan@example.com",
    phone: "07000111222",
    marketingOptIn: true,
    createdAt: "2024-01-03T08:40:00Z",
    orderCount: 0,
    totalSpent: 0,
    addresses: [
      {
        id: "addr_3",
        line1: "89 Green Road",
        city: "Manchester",
        postcode: "M14 5AP",
        isDefault: true,
      },
    ],
  },
];

/* =========================
   ORDERS
========================= */

export const orders: Order[] = [
  {
    id: "ord_1",
    orderNumber: "#10021",
    customer: {
      id: "cust_1",
      name: "Sarah Johnson",
      email: "sarah.johnson@example.com",
      phone: "07123456789",
    },
    deliveryAddress: {
      id: "addr_1",
      line1: "12 Market Street",
      city: "Leeds",
      postcode: "LS1 3AB",
    },
    items: [
      {
        name: "Fresh Whole Milk",
        variant: "2L",
        quantity: 2,
        unitPrice: 2.5,
      },
      {
        name: "Organic Eggs",
        quantity: 1,
        unitPrice: 3.2,
      },
    ],
    subtotal: 8.2,
    deliveryFee: 2.5,
    discount: 0,
    total: 10.7,
    fulfillmentStatus: "delivered",
    paymentStatus: "paid",
    deliverySlot: {
      date: "2024-01-18",
      timeWindow: "8am – 10am",
    },
    history: [
      {
        status: "confirmed",
        timestamp: "2024-01-17T18:00:00Z",
        user: "Admin",
      },
      {
        status: "delivered",
        timestamp: "2024-01-18T09:10:00Z",
        user: "Driver",
      },
    ],
    customerNotes: "Leave at doorstep",
    createdAt: "2024-01-17T16:45:00Z",
    updatedAt: "2024-01-18T09:10:00Z",
  },
  {
    id: "ord_2",
    orderNumber: "#10034",
    customer: {
      id: "cust_2",
      name: "Daniel Moore",
      email: "daniel.moore@example.com",
      phone: "07987654321",
    },
    deliveryAddress: {
      id: "addr_2",
      line1: "44 Oak Avenue",
      city: "Bradford",
      postcode: "BD5 7TR",
    },
    items: [
      {
        name: "Butter",
        quantity: 1,
        unitPrice: 2.0,
      },
    ],
    subtotal: 2.0,
    deliveryFee: 2.5,
    discount: 0,
    total: 4.5,
    fulfillmentStatus: "cancelled",
    paymentStatus: "refunded",
    deliverySlot: {
      date: "2023-12-02",
      timeWindow: "12pm – 2pm",
    },
    history: [
      {
        status: "cancelled",
        timestamp: "2023-12-01T20:30:00Z",
        user: "Admin",
      },
    ],
    internalNotes: "Customer cancelled before dispatch",
    createdAt: "2023-12-01T18:15:00Z",
    updatedAt: "2023-12-01T20:30:00Z",
  },
  {
    id: "ord_2",
    orderNumber: "#10034",
    customer: {
      id: "cust_2",
      name: "Daniel Moore",
      email: "daniel.moore@example.com",
      phone: "07987654321",
    },
    deliveryAddress: {
      id: "addr_2",
      line1: "44 Oak Avenue",
      city: "Bradford",
      postcode: "BD5 7TR",
    },
    items: [
      {
        name: "Butter",
        quantity: 1,
        unitPrice: 2.0,
      },
    ],
    subtotal: 2.0,
    deliveryFee: 2.5,
    discount: 0,
    total: 4.5,
    fulfillmentStatus: "cancelled",
    paymentStatus: "refunded",
    deliverySlot: {
      date: "2023-12-02",
      timeWindow: "12pm – 2pm",
    },
    history: [
      {
        status: "cancelled",
        timestamp: "2023-12-01T20:30:00Z",
        user: "Admin",
      },
    ],
    internalNotes: "Customer cancelled before dispatch",
    createdAt: "2023-12-01T18:15:00Z",
    updatedAt: "2023-12-01T20:30:00Z",
  },
  {
    id: "ord_2",
    orderNumber: "#10034",
    customer: {
      id: "cust_2",
      name: "Daniel Moore",
      email: "daniel.moore@example.com",
      phone: "07987654321",
    },
    deliveryAddress: {
      id: "addr_2",
      line1: "44 Oak Avenue",
      city: "Bradford",
      postcode: "BD5 7TR",
    },
    items: [
      {
        name: "Butter",
        quantity: 1,
        unitPrice: 2.0,
      },
    ],
    subtotal: 2.0,
    deliveryFee: 2.5,
    discount: 0,
    total: 4.5,
    fulfillmentStatus: "cancelled",
    paymentStatus: "refunded",
    deliverySlot: {
      date: "2023-12-02",
      timeWindow: "12pm – 2pm",
    },
    history: [
      {
        status: "cancelled",
        timestamp: "2023-12-01T20:30:00Z",
        user: "Admin",
      },
    ],
    internalNotes: "Customer cancelled before dispatch",
    createdAt: "2023-12-01T18:15:00Z",
    updatedAt: "2023-12-01T20:30:00Z",
  },
  {
    id: "ord_2",
    orderNumber: "#10034",
    customer: {
      id: "cust_2",
      name: "Daniel Moore",
      email: "daniel.moore@example.com",
      phone: "07987654321",
    },
    deliveryAddress: {
      id: "addr_2",
      line1: "44 Oak Avenue",
      city: "Bradford",
      postcode: "BD5 7TR",
    },
    items: [
      {
        name: "Butter",
        quantity: 1,
        unitPrice: 2.0,
      },
    ],
    subtotal: 2.0,
    deliveryFee: 2.5,
    discount: 0,
    total: 4.5,
    fulfillmentStatus: "cancelled",
    paymentStatus: "refunded",
    deliverySlot: {
      date: "2023-12-02",
      timeWindow: "12pm – 2pm",
    },
    history: [
      {
        status: "cancelled",
        timestamp: "2023-12-01T20:30:00Z",
        user: "Admin",
      },
    ],
    internalNotes: "Customer cancelled before dispatch",
    createdAt: "2023-12-01T18:15:00Z",
    updatedAt: "2023-12-01T20:30:00Z",
  },
  {
    id: "ord_2",
    orderNumber: "#10034",
    customer: {
      id: "cust_2",
      name: "Daniel Moore",
      email: "daniel.moore@example.com",
      phone: "07987654321",
    },
    deliveryAddress: {
      id: "addr_2",
      line1: "44 Oak Avenue",
      city: "Bradford",
      postcode: "BD5 7TR",
    },
    items: [
      {
        name: "Butter",
        quantity: 1,
        unitPrice: 2.0,
      },
    ],
    subtotal: 2.0,
    deliveryFee: 2.5,
    discount: 0,
    total: 4.5,
    fulfillmentStatus: "cancelled",
    paymentStatus: "refunded",
    deliverySlot: {
      date: "2023-12-02",
      timeWindow: "12pm – 2pm",
    },
    history: [
      {
        status: "cancelled",
        timestamp: "2023-12-01T20:30:00Z",
        user: "Admin",
      },
    ],
    internalNotes: "Customer cancelled before dispatch",
    createdAt: "2023-12-01T18:15:00Z",
    updatedAt: "2023-12-01T20:30:00Z",
  },
  {
    id: "ord_2",
    orderNumber: "#10034",
    customer: {
      id: "cust_2",
      name: "Daniel Moore",
      email: "daniel.moore@example.com",
      phone: "07987654321",
    },
    deliveryAddress: {
      id: "addr_2",
      line1: "44 Oak Avenue",
      city: "Bradford",
      postcode: "BD5 7TR",
    },
    items: [
      {
        name: "Butter",
        quantity: 1,
        unitPrice: 2.0,
      },
    ],
    subtotal: 2.0,
    deliveryFee: 2.5,
    discount: 0,
    total: 4.5,
    fulfillmentStatus: "cancelled",
    paymentStatus: "refunded",
    deliverySlot: {
      date: "2023-12-02",
      timeWindow: "12pm – 2pm",
    },
    history: [
      {
        status: "cancelled",
        timestamp: "2023-12-01T20:30:00Z",
        user: "Admin",
      },
    ],
    internalNotes: "Customer cancelled before dispatch",
    createdAt: "2023-12-01T18:15:00Z",
    updatedAt: "2023-12-01T20:30:00Z",
  },
  {
    id: "ord_2",
    orderNumber: "#10034",
    customer: {
      id: "cust_2",
      name: "Daniel Moore",
      email: "daniel.moore@example.com",
      phone: "07987654321",
    },
    deliveryAddress: {
      id: "addr_2",
      line1: "44 Oak Avenue",
      city: "Bradford",
      postcode: "BD5 7TR",
    },
    items: [
      {
        name: "Butter",
        quantity: 1,
        unitPrice: 2.0,
      },
    ],
    subtotal: 2.0,
    deliveryFee: 2.5,
    discount: 0,
    total: 4.5,
    fulfillmentStatus: "cancelled",
    paymentStatus: "refunded",
    deliverySlot: {
      date: "2023-12-02",
      timeWindow: "12pm – 2pm",
    },
    history: [
      {
        status: "cancelled",
        timestamp: "2023-12-01T20:30:00Z",
        user: "Admin",
      },
    ],
    internalNotes: "Customer cancelled before dispatch",
    createdAt: "2023-12-01T18:15:00Z",
    updatedAt: "2023-12-01T20:30:00Z",
  },
];
