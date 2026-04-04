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

export type OrderRefundRecord = {
  stripeRefundId?: string;
  paymentIntentId?: string;
  currency?: string;
  amount?: number;
  amountMinor?: number;
  status?: "pending" | "succeeded" | "failed" | (string & {});
  createdAt?: string;
  refundedAt?: string;
  failedAt?: string;
  refundedBy?: string;
  reason?: string;
  restock?: boolean;
};

export type OrderStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "refund_pending"
  | "partially_refunded"
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

  isDiscounted?: boolean;
  totalBeforeDiscount?: number;
  discountAmount?: number;
  status: OrderStatus;
  deliveryStatus: string;

  // Admin can set this via PATCH /admin/orders/assign-delivery-date-bulk
  deliveryDate?: string | null;

  reservationExpiresAt?: string;
  paidAt?: string;
  expiresAt?: string;

  refund?: OrderRefund;
  refunds?: OrderRefundRecord[];
  metadata?: Record<string, unknown>;

  customerInstructions?: string;

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

export type OrdersStockRequirementItem = {
  variantId: string;
  productId: string;
  sku: string;
  name: string;
  unitPrice: number;
  totalQuantity: number;
};

export type OrdersStockRequirements = {
  totalUniqueProducts: number;
  items: OrdersStockRequirementItem[];
  sources?: {
    orderIdsProvided?: number;
    ordersFound?: number;
    sheet?: {
      originalName?: string;
      detectedType?: string;
      rows?: number;
      usableRows?: number;
    } | null;
  };
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
