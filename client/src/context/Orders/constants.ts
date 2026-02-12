export type OrderCustomerAddress = {
  line1: string;
  line2?: string | null;
  city: string;
  postcode: string;
  country: string;
  isDefault?: boolean;
};

export type OrderCustomer = {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  addresses?: OrderCustomerAddress[];
  isGuest?: boolean;
  user?: string | null;
  lastOrderAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type OrdersListMeta = {
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

export type OrderStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "refund_pending"
  | "refunded"
  | "refund_failed"
  | (string & {});

export type AdminOrder = {
  _id: string;
  orderId: string;

  // List endpoint populates customer; update endpoint may return string
  customer: OrderCustomer | string;

  items: OrderItem[];
  currency: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  deliveryStatus: string;

  reservationExpiresAt?: string;
  paidAt?: string;
  expiresAt?: string;

  refund?: OrderRefund;
  metadata?: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
};

export type RefundOrderResult = {
  refundId: string;
  status: string;
};

export type ListOrdersResult = {
  orders: AdminOrder[];
  meta: OrdersListMeta | null;
};

export interface OrdersState {
  orders: AdminOrder[];
  meta: OrdersListMeta | null;
  currentOrder: AdminOrder | null;
  loading: boolean;
  error: string | null;
}

export const initialOrdersState: OrdersState = {
  orders: [],
  meta: null,
  currentOrder: null,
  loading: false,
  error: null,
};
