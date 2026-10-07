import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Package } from "lucide-react";
import { Button } from "../../components/common";
import { useToast } from "../../components/common/Toast";
import { useOrdersApi, type AdminOrder } from "../../context/Orders";
import type { OrderEmailAudit } from "../../context/Orders/constants";
import { mapAdminOrderToUi, type Order } from "./useOrders";
import { getOrderSourceBadge, getStatusBadge, getPaymentBadge } from "./order.utils";
import OrderDetailContent from "./OrderDetailContent";
import OrderStatusModal from "./OrderStatusModal";
import OrderEmailActivity from "./OrderEmailActivity";
import styles from "./Orders.module.css";

export default function OrderDetailPage() {
  const { orderId } = useParams();
  return <OrderPage key={orderId} orderId={orderId!} />;
}

function OrderPage({ orderId }: { orderId: string }) {
  const api = useOrdersApi();
  const { getOrderById, getOrderEmailAudit } = api;
  const { showToast } = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [emails, setEmails] = useState<OrderEmailAudit[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(true);
  const [emailsError, setEmailsError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    setError("");
    getOrderById(orderId).then((result) => {
      if (active) setOrder(mapAdminOrderToUi(result));
    }).catch(() => {
      if (active) setError("This order could not be loaded. It may have been removed, or the connection was interrupted.");
    });
    return () => { active = false; };
  }, [orderId, getOrderById, attempt]);

  const loadEmails = async () => {
    setEmailsLoading(true);
    setEmailsError("");
    try {
      setEmails(await getOrderEmailAudit(orderId));
    } catch {
      setEmailsError("Email metadata could not be loaded from Resend.");
    } finally {
      setEmailsLoading(false);
    }
  };

  useEffect(() => {
    void loadEmails();
    // loadEmails intentionally follows the current order id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, getOrderEmailAudit]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  async function update(action: () => Promise<AdminOrder>, message: string) {
    try {
      const result = mapAdminOrderToUi(await action());
      setOrder(result);
      showToast({ title: message, type: "success" });
      return result;
    } catch {
      showToast({ title: "Could not save changes. Please try again.", type: "error" });
      return null;
    }
  }

  const orderHeading = (
      <header className={styles.orderPageHeader}>
        <div className={styles.orderHeadingGroup}>
          <Link to="/orders" className={styles.orderBack} aria-label="Back to orders"><ArrowLeft size={20} /></Link>
          <div>
            <p className={styles.orderEyebrow}>Order details</p>
            <h1 ref={heading} tabIndex={-1}>{order?.orderNumber || "Order details"}</h1>
            <div className={styles.orderHeadingMeta}>
              {order && <>
                {getStatusBadge(order.deliveryStatus?.replace(/_/g, " "))}
                {getPaymentBadge(order.paymentStatus)}
                <span>Placed {new Date(order.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </>}
            </div>
          </div>
        </div>
        {order && getOrderSourceBadge(order.isManualImport, order.isSubscriptionGenerated)}
      </header>
  );

  return (
    <div className={styles.orderPage}>
      <nav aria-label="Breadcrumb" className={styles.orderBreadcrumb}>
        <Link to="/orders">Orders</Link><ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">{order?.orderNumber || "Order details"}</span>
      </nav>
      {!order && orderHeading}

      {error ? (
        <div className={styles.orderPageState} role="alert">
          <Package size={32} /><h2>Unable to load order</h2><p>{error}</p>
          <Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
          <Link to="/orders">Back to orders</Link>
        </div>
      ) : !order ? (
        <div className={styles.orderPageState} role="status"><Package size={32} /><p>Loading order details…</p></div>
      ) : (
        <>
          <OrderDetailContent
            heading={orderHeading}
            statusEditor={
          <OrderStatusModal inline footerContainerId="order-status-footer" selectedOrder={order} isStatusModalOpen={isStatusModalOpen} setIsStatusModalOpen={setIsStatusModalOpen}
            updateOrderStatus={async (...args: Parameters<typeof api.updateOrderStatus>) => {
              const updated = await update(async () => {
                await api.updateOrderStatus(...args);
                return getOrderById(order.id);
              }, "Order status updated");
              if (updated) {
                setIsStatusModalOpen(false);
                void loadEmails();
              }
            }} />
            }
            isStatusEditorOpen={isStatusModalOpen}
            selectedOrder={order}
            setIsStatusModalOpen={setIsStatusModalOpen}
            updateOrderPaymentStatus={(...args: Parameters<typeof api.updateOrderPaymentStatus>) => update(() => api.updateOrderPaymentStatus(...args), "Payment updated")}
            updateOrderItems={(...args: Parameters<typeof api.updateOrderItems>) => update(() => api.updateOrderItems(...args), "Order items updated")}
            updateDriverNote={(...args: Parameters<typeof api.updateDriverNote>) => update(() => api.updateDriverNote(...args), "Driver note saved")}
            refundOrder={async (id: string, amount?: number) => {
              try {
                const result = await api.refundOrder(id, { amount });
                showToast({ title: "Refund submitted", type: "success" });
                // A successful refund must not be reported as failed if reloading fails.
                try { setOrder(mapAdminOrderToUi(await getOrderById(id))); }
                catch { setError("Refund submitted, but the order could not be refreshed. Reload to see its latest payment status."); }
                return result;
              } catch {
                showToast({ title: "Could not refund order. Please try again.", type: "error" });
                return null;
              }
            }}
          />
          <OrderEmailActivity
            emails={emails}
            deliveryProofUrl={order.deliveryProofUrl}
            loading={emailsLoading}
            error={emailsError}
            onRefresh={() => void loadEmails()}
          />

        </>
      )}
    </div>
  );
}
