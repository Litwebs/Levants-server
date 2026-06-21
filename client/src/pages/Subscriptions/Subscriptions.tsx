import { useEffect, useState, useCallback } from "react";
import {
  useSubscriptions,
  type Subscription,
} from "../../context/Subscriptions";
import { useToast } from "../../components/common/Toast";
import { Badge } from "@/components/ui/badge";
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
import { RefreshCw, Pause, Play, X as XIcon, Search } from "lucide-react";

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  every_two_weeks: "Every 2 weeks",
  monthly: "Monthly",
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-800",
};

const getCustomerName = (customer: Subscription["customer"]) => {
  if (typeof customer === "string") return customer;
  return `${customer.firstName} ${customer.lastName}`;
};

const getCustomerEmail = (customer: Subscription["customer"]) => {
  if (typeof customer === "string") return "";
  return customer.email;
};

export default function SubscriptionsPage() {
  const { showToast } = useToast();
  const {
    subscriptions,
    meta,
    loading,
    error,
    listSubscriptions,
    pauseSubscription,
    resumeSubscription,
    cancelSubscription,
  } = useSubscriptions();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [frequencyFilter, setFrequencyFilter] = useState("all");

  const [confirmDialog, setConfirmDialog] = useState<{
    action: "pause" | "resume" | "cancel";
    subscription: Subscription;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchSubscriptions = useCallback(() => {
    listSubscriptions({
      page,
      pageSize: 20,
      status: statusFilter !== "all" ? statusFilter : undefined,
      frequency: frequencyFilter !== "all" ? frequencyFilter : undefined,
      search: search || undefined,
    });
  }, [listSubscriptions, page, statusFilter, frequencyFilter, search]);

  useEffect(() => {
    const t = setTimeout(fetchSubscriptions, 300);
    return () => clearTimeout(t);
  }, [fetchSubscriptions]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, frequencyFilter]);

  const handleAction = async () => {
    if (!confirmDialog) return;
    setActionLoading(true);
    try {
      const { action, subscription } = confirmDialog;
      if (action === "pause") await pauseSubscription(subscription._id);
      else if (action === "resume") await resumeSubscription(subscription._id);
      else if (action === "cancel")
        await cancelSubscription(subscription._id, cancelReason || undefined);

      showToast({
        title: `Subscription ${action === "pause" ? "paused" : action === "resume" ? "resumed" : "cancelled"}`,
        type: "success",
      });
      setConfirmDialog(null);
      setCancelReason("");
    } catch {
      showToast({ title: "Action failed", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = meta ? Math.ceil(meta.total / 20) : 1;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Subscriptions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {meta?.total ?? 0} total subscriptions
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSubscriptions}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={frequencyFilter} onValueChange={setFrequencyFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All frequencies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All frequencies</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="every_two_weeks">Every 2 weeks</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Delivery Day</TableHead>
                <TableHead>Next Delivery</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Loading…
                  </TableCell>
                </TableRow>
              ) : subscriptions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No subscriptions found
                  </TableCell>
                </TableRow>
              ) : (
                subscriptions.map((sub) => (
                  <TableRow key={sub._id}>
                    <TableCell className="font-mono text-xs">
                      {sub.subscriptionNumber}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {getCustomerName(sub.customer)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {getCustomerEmail(sub.customer)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[sub.status] ?? ""}`}
                      >
                        {sub.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {FREQUENCY_LABELS[sub.frequency] ?? sub.frequency}
                    </TableCell>
                    <TableCell className="text-sm">
                      {DAY_LABELS[sub.preferredDeliveryDay] ??
                        sub.preferredDeliveryDay}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(sub.nextDeliveryDate).toLocaleDateString(
                        "en-GB",
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {sub.items.length}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {sub.status === "active" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setConfirmDialog({
                                action: "pause",
                                subscription: sub,
                              })
                            }
                          >
                            <Pause className="h-3 w-3 mr-1" />
                            Pause
                          </Button>
                        )}
                        {sub.status === "paused" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setConfirmDialog({
                                action: "resume",
                                subscription: sub,
                              })
                            }
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Resume
                          </Button>
                        )}
                        {sub.status !== "cancelled" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              setConfirmDialog({
                                action: "cancel",
                                subscription: sub,
                              })
                            }
                          >
                            <XIcon className="h-3 w-3 mr-1" />
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
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

      {/* Confirm Dialog */}
      <Dialog
        open={!!confirmDialog}
        onOpenChange={() => {
          setConfirmDialog(null);
          setCancelReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.action === "pause"
                ? "Pause Subscription"
                : confirmDialog?.action === "resume"
                  ? "Resume Subscription"
                  : "Cancel Subscription"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {confirmDialog && (
              <p className="text-sm text-muted-foreground">
                Subscription{" "}
                <span className="font-mono font-medium">
                  {confirmDialog.subscription.subscriptionNumber}
                </span>{" "}
                for{" "}
                <span className="font-medium">
                  {getCustomerName(confirmDialog.subscription.customer)}
                </span>
                .
              </p>
            )}
            {confirmDialog?.action === "cancel" && (
              <Input
                placeholder="Reason (optional)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDialog(null);
                setCancelReason("");
              }}
            >
              Back
            </Button>
            <Button
              variant={
                confirmDialog?.action === "cancel" ? "destructive" : "default"
              }
              disabled={actionLoading}
              onClick={handleAction}
            >
              {actionLoading ? "Processing…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
