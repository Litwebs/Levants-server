import { useEffect, useState, useCallback } from "react";
import {
  useSupportRequests,
  type SupportRequest,
} from "../../context/SupportRequests";
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
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, Search } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  in_review: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-700",
};

const getCustomerName = (c: SupportRequest["customer"]) => {
  if (typeof c === "string") return c;
  return `${c.firstName} ${c.lastName}`;
};

export default function SupportRequestsPage() {
  const { showToast } = useToast();
  const {
    requests,
    meta,
    loading,
    error,
    listRequests,
    updateStatus,
    addNote,
  } = useSupportRequests();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRequest, setSelectedRequest] = useState<SupportRequest | null>(
    null,
  );
  const [newStatus, setNewStatus] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRequests = useCallback(() => {
    listRequests({
      page,
      pageSize: 20,
      status: statusFilter !== "all" ? statusFilter : undefined,
      search: search || undefined,
    });
  }, [listRequests, page, statusFilter, search]);

  useEffect(() => {
    const t = setTimeout(fetchRequests, 300);
    return () => clearTimeout(t);
  }, [fetchRequests]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const handleStatusUpdate = async () => {
    if (!selectedRequest || !newStatus) return;
    setActionLoading(true);
    try {
      await updateStatus(selectedRequest._id, newStatus);
      showToast({ title: "Status updated", type: "success" });
      setSelectedRequest((prev) =>
        prev ? { ...prev, status: newStatus as any } : null,
      );
    } catch {
      showToast({ title: "Update failed", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!selectedRequest || !noteContent.trim()) return;
    setActionLoading(true);
    try {
      await addNote(selectedRequest._id, noteContent.trim());
      showToast({ title: "Note added", type: "success" });
      setNoteContent("");
    } catch {
      showToast({ title: "Failed to add note", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = meta ? Math.ceil(meta.total / 20) : 1;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Support Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {meta?.total ?? 0} total
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRequests}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search…"
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
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
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
                <TableHead>Type</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
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
              ) : requests.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No support requests
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((req) => (
                  <TableRow key={req._id}>
                    <TableCell>
                      <div className="font-medium">
                        {getCustomerName(req.customer)}
                      </div>
                      {typeof req.customer !== "string" && (
                        <div className="text-xs text-muted-foreground">
                          {req.customer.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm capitalize">
                      {req.issueType.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-sm">
                      {req.subject}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[req.status] ?? ""}`}
                      >
                        {req.status.replace("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(req.createdAt).toLocaleDateString("en-GB")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedRequest(req);
                          setNewStatus(req.status);
                        }}
                      >
                        Manage
                      </Button>
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

      {/* Detail/Manage Dialog */}
      <Dialog
        open={!!selectedRequest}
        onOpenChange={() => setSelectedRequest(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Support Request</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Customer</p>
                <p className="font-medium">
                  {getCustomerName(selectedRequest.customer)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Subject</p>
                <p className="font-medium">{selectedRequest.subject}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Message</p>
                <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded">
                  {selectedRequest.message}
                </p>
              </div>
              {selectedRequest.relatedOrder && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    Related Order
                  </p>
                  <p className="font-mono text-sm">
                    {selectedRequest.relatedOrder.orderId}
                  </p>
                </div>
              )}
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-1">
                    Update Status
                  </p>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_review">In Review</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  disabled={
                    actionLoading || newStatus === selectedRequest.status
                  }
                  onClick={handleStatusUpdate}
                >
                  Update
                </Button>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">
                  Add Internal Note
                </p>
                <Textarea
                  placeholder="Internal note…"
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  rows={3}
                />
                <Button
                  className="mt-2"
                  size="sm"
                  disabled={actionLoading || !noteContent.trim()}
                  onClick={handleAddNote}
                >
                  Add Note
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
