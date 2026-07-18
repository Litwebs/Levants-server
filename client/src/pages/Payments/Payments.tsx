import { useEffect, useState, useCallback } from "react";
import { usePayments, type Payment } from "../../context/Payments";
import { useToast } from "../../components/common/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RefreshCw, Search } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-700",
};

const getCustomerName = (c: Payment["customer"]) => {
  if (typeof c === "string") return c;
  return `${c.firstName} ${c.lastName}`;
};

const formatCurrency = (amount: number, currency = "GBP") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
    amount,
  );

export default function PaymentsPage() {
  const { showToast } = useToast();
  const { payments, meta, loading, error, listPayments, updatePaymentStatus } =
    usePayments();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [updateDialog, setUpdateDialog] = useState<{
    payment: Payment;
    status: string;
    notes: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPayments = useCallback(() => {
    listPayments({
      page,
      pageSize: 20,
      status: statusFilter !== "all" ? statusFilter : undefined,
    });
  }, [listPayments, page, statusFilter]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const handleUpdateStatus = async () => {
    if (!updateDialog) return;
    setActionLoading(true);
    try {
      await updatePaymentStatus(
        updateDialog.payment._id,
        updateDialog.status,
        updateDialog.notes || undefined,
      );
      showToast({ title: "Payment status updated", type: "success" });
      setUpdateDialog(null);
    } catch {
      showToast({ title: "Update failed", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = meta ? Math.ceil(meta.total / 20) : 1;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {meta?.total ?? 0} total
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPayments}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Order / Sub</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Loading…
                  </TableCell>
                </TableRow>
              ) : payments.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No payments found
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell>
                      <div className="font-medium">
                        {getCustomerName(p.customer)}
                      </div>
                      {typeof p.customer !== "string" && (
                        <div className="text-xs text-muted-foreground">
                          {p.customer.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.order && typeof p.order !== "string"
                        ? `Order ${p.order.orderId}`
                        : p.subscription && typeof p.subscription !== "string"
                          ? `Sub ${p.subscription.subscriptionNumber}`
                          : "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(p.amount, p.currency)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[p.status] ?? ""}`}
                      >
                        {p.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(p.createdAt).toLocaleDateString("en-GB")}
                    </TableCell>
                    <TableCell className="text-right">
                      {(p.status === "pending" || p.status === "failed") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setUpdateDialog({
                              payment: p,
                              status: p.status,
                              notes: "",
                            })
                          }
                        >
                          Update
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="flex items-center text-sm px-2">
            Page {page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Update Dialog */}
      <Dialog open={!!updateDialog} onOpenChange={() => setUpdateDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Payment Status</DialogTitle>
          </DialogHeader>
          {updateDialog && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {formatCurrency(
                  updateDialog.payment.amount,
                  updateDialog.payment.currency,
                )}{" "}
                for {getCustomerName(updateDialog.payment.customer)}
              </p>
              <div>
                <p className="text-sm font-medium mb-1">New Status</p>
                <Select
                  value={updateDialog.status}
                  onValueChange={(v) =>
                    setUpdateDialog((d) => (d ? { ...d, status: v } : null))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Notes (optional)</p>
                <Input
                  value={updateDialog.notes}
                  onChange={(e) =>
                    setUpdateDialog((d) =>
                      d ? { ...d, notes: e.target.value } : null,
                    )
                  }
                  placeholder="e.g. Manual cash payment received"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                actionLoading ||
                !updateDialog ||
                updateDialog.status === updateDialog.payment.status
              }
              onClick={handleUpdateStatus}
            >
              {actionLoading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
