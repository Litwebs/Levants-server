export type DiscountKind = "percent" | "amount";
export type DiscountScope = "global" | "category" | "variant";

export type Discount = {
  _id: string;
  name: string;
  code: string;
  kind: DiscountKind;

  percentOff?: number;
  amountOff?: number;
  currency?: string;

  scope: DiscountScope | "product";
  category?: string;
  variantIds?: string[];

  isActive: boolean;

  startsAt?: string;
  endsAt?: string;

  maxRedemptions?: number;
  perCustomerLimit?: number;

  stripeCouponId?: string;
  stripePromotionCodeId?: string;

  createdAt?: string;
  updatedAt?: string;
};

export type CreateDiscountBody = {
  name: string;
  code?: string;

  kind: DiscountKind;
  percentOff?: number;
  amountOff?: number;
  currency?: string;

  scope: DiscountScope;
  category?: string;
  variantIds?: string[];

  startsAt?: string;
  endsAt?: string;

  maxRedemptions?: number;
  perCustomerLimit?: number;
};

export type ListDiscountsResponse = {
  discounts: Discount[];
};

export type ListDiscountsMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type DiscountDetailsCustomer = {
  _id: string;
  name?: string;
  email?: string;
} | null;

export type DiscountDetailsOrder = {
  _id: string;
  orderId: string;
  total: number;
  status: string;
  createdAt?: string;
} | null;

export type DiscountRedemptionItem = {
  _id: string;
  redeemedAt?: string;
  customer: DiscountDetailsCustomer;
  order: DiscountDetailsOrder;
};

export type DiscountDetailsVariant = {
  _id: string;
  name: string;
  sku: string;
};

export type DiscountDetails = {
  discount: Discount;
  variants?: DiscountDetailsVariant[];
  claims: {
    total: number;
    uniqueCustomers: number;
  };
  redemptions: DiscountRedemptionItem[];
};
