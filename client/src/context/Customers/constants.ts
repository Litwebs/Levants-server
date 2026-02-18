export type CustomerAddress = {
  line1: string;
  line2?: string | null;
  city: string;
  postcode: string;
  country: string;
  isDefault?: boolean;
};

export type Customer = {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  addresses: CustomerAddress[];
  isGuest?: boolean;
  user?: string | null;
  lastOrderAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CustomersListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type OrderItem = {
  product: string;
  variant: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  subtotal: number;
};

export type OrderRefund = {
  restock?: boolean;
  refundedBy?: string;
  reason?: string;
  stripeRefundId?: string;
  refundedAt?: string;
};

export type Order = {
  _id: string;
  customer: string;
  items: OrderItem[];
  currency: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  expiresAt?: string;
  reservationExpiresAt?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  refund?: OrderRefund;
};

export type OrderStats = {
  totalSpent: number;
  paidOrderCount: number;
  averageOrderValue: number;
};

export type ListCustomersResult = {
  customers: Customer[];
  meta: CustomersListMeta | null;
};

export type ListCustomerOrdersResult = {
  orders: Order[];
  meta: CustomersListMeta | null;
  stats: OrderStats | null;
};

export interface CustomersState {
  customers: Customer[];
  meta: CustomersListMeta | null;
  loading: boolean;
  error: string | null;
}

export const initialCustomersState: CustomersState = {
  customers: [],
  meta: null,
  loading: false,
  error: null,
};
