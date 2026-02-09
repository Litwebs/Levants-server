import { Badge } from "../../components/common";
import { Order } from "./mockData";

type FulfillmentStatus = Order["fulfillmentStatus"];
type PaymentStatus = Order["paymentStatus"];

export const getStatusBadge = (status: FulfillmentStatus) => {
  const map: Record<FulfillmentStatus, { variant: any; label: string }> = {
    new: { variant: "info", label: "New" },
    confirmed: { variant: "info", label: "Confirmed" },
    preparing: { variant: "warning", label: "Preparing" },
    out_for_delivery: { variant: "info", label: "Out for Delivery" },
    delivered: { variant: "success", label: "Delivered" },
    cancelled: { variant: "error", label: "Cancelled" },
  };

  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
};

export const getPaymentBadge = (status: PaymentStatus) => {
  const map: Record<PaymentStatus, { variant: any; label: string }> = {
    paid: { variant: "success", label: "Paid" },
    unpaid: { variant: "warning", label: "Unpaid" },
    refunded: { variant: "error", label: "Refunded" },
    partially_refunded: { variant: "warning", label: "Partial Refund" },
  };

  const { variant, label } = map[status];
  return (
    <Badge variant={variant} size="sm">
      {label}
    </Badge>
  );
};
