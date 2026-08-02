export type CustomerAddress = {
  _id?: string;
  label?: string | null;
  fullName?: string | null;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  postcode: string;
  country: string;
  deliveryInstructions?: string | null;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Customer = {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  addresses: CustomerAddress[];
  isGuest?: boolean;
  status?: "active" | "disabled";
  emailVerifiedAt?: string | null;
  portalInviteSentAt?: string | null;
  portalInviteAcceptedAt?: string | null;
  portalInviteTokenExpiresAt?: string | null;
  stripeCustomerId?: string | null;
  creditBalance?: number;
  notificationPreferences?: {
    orderUpdates?: boolean;
    subscriptionUpdates?: boolean;
    deliveryUpdates?: boolean;
    promotions?: boolean;
  };
  user?: string | null;
  lastOrderAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateCustomerOnboardingLinkPayload = {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address?: CustomerAddress;
  linkTtlMinutes?: number;
};

export type CreateCustomerOnboardingLinkResult = {
  customer: Customer;
  onboardingLink: string;
  expiresAt: string;
};

export type CustomerSubscription = {
  _id: string;
  subscriptionNumber?: string;
  status: string;
  frequency: string;
  preferredDeliveryDay?: number;
  nextDeliveryDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  items?: Array<{
    _id?: string;
    name?: string;
    sku?: string;
    quantity?: number;
  }>;
};

export type CustomerPayment = {
  _id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  paidAt?: string | null;
  failedAt?: string | null;
  refundedAt?: string | null;
  providerReference?: string | null;
  order?: {
    _id: string;
    orderId?: string;
    status?: string;
    total?: number;
  } | null;
  subscription?: {
    _id: string;
    subscriptionNumber?: string;
    status?: string;
  } | null;
};

export type CustomersListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary?: {
    totalCustomers: number;
    registeredCustomers: number;
    guestCustomers: number;
  };
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
  orderId?: string;
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

export type ListCustomerSubscriptionsResult = {
  subscriptions: CustomerSubscription[];
  meta: CustomersListMeta | null;
};

export type ListCustomerPaymentsResult = {
  payments: CustomerPayment[];
  meta: CustomersListMeta | null;
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
