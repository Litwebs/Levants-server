import { Badge } from "../../components/common";

type FulfillmentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "refund_pending"
  | "refunded"
  | "refund_failed"
  | (string & {});

type PaymentStatus = FulfillmentStatus;

export const getStatusBadge = (status: FulfillmentStatus) => {
  const map: Record<string, { variant: any; label: string }> = {
    ordered: { variant: "error", label: "Ordered" },
    dispatched: { variant: "warning", label: "Dispatched" },
    in_transit: { variant: "info", label: "In Transit" },
    delivered: { variant: "success", label: "Delivered" },
    returned: { variant: "error", label: "Returned" },
  };

  if (!status) return <Badge variant="outline">—</Badge>;

  const key = String(status).toLowerCase().trim().replace(/\s+/g, "_");
  const cfg = map[key] ?? { variant: "info", label: String(status) };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
};

export const getPaymentBadge = (status: PaymentStatus) => {
  const map: Record<string, { variant: any; label: string }> = {
    pending: { variant: "warning", label: "Pending" },
    paid: { variant: "success", label: "Paid" },
    failed: { variant: "error", label: "Failed" },
    cancelled: { variant: "error", label: "Cancelled" },
    refund_pending: { variant: "warning", label: "Refund Pending" },
    refunded: { variant: "info", label: "Refunded" },
    refund_failed: { variant: "error", label: "Refund Failed" },
  };

  const cfg = map[status] ?? { variant: "info", label: String(status) };
  return (
    <Badge variant={cfg.variant} size="sm">
      {cfg.label}
    </Badge>
  );
};
