import { Modal, ModalFooter, Button, Badge } from "../../components/common";
import { Mail, Phone, MapPin, ShoppingBag, Edit2 } from "lucide-react";
import styles from "./Customers.module.css";

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const formatCurrency = (amount: number) => `£${amount.toFixed(2)}`;

const CustomerViewModal = ({
  selectedCustomer,
  isViewModalOpen,
  setIsViewModalOpen,
  getCustomerOrders,
  handleEditCustomer,
}: any) => {
  if (!selectedCustomer) return null;

  return (
    <Modal
      isOpen={isViewModalOpen}
      onClose={() => setIsViewModalOpen(false)}
      title="Customer Details"
      size="lg"
    >
      <div className={styles.customerDetail}>
        <div className={styles.detailHeader}>
          <div className={styles.avatarLarge}>
            {selectedCustomer.name
              .split(" ")
              .map((n: string) => n[0])
              .join("")}
          </div>
          <div className={styles.detailInfo}>
            <h2>{selectedCustomer.name}</h2>
            <div className={styles.detailMeta}>
              <Badge
                variant={
                  selectedCustomer.marketingOptIn ? "success" : "default"
                }
              >
                {selectedCustomer.marketingOptIn
                  ? "Marketing Opted In"
                  : "Marketing Opted Out"}
              </Badge>
            </div>
          </div>
        </div>

        <div className={styles.detailGrid}>
          <div className={styles.detailSection}>
            <h3>Contact Information</h3>
            <p>
              <Mail size={16} /> {selectedCustomer.email}
            </p>
            <p>
              <Phone size={16} /> {selectedCustomer.phone}
            </p>
          </div>

          <div className={styles.detailSection}>
            <h3>Addresses</h3>
            {selectedCustomer.addresses.map((addr: any) => (
              <div key={addr.id} className={styles.addressCard}>
                <MapPin size={16} />
                <div>
                  <p>{addr.line1}</p>
                  {addr.line2 && <p>{addr.line2}</p>}
                  <p>
                    {addr.city}, {addr.postcode}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.detailSection}>
          <h3>Purchase Summary</h3>
          <div className={styles.purchaseSummary}>
            <div className={styles.summaryItem}>
              <ShoppingBag size={20} />
              <div>
                <span className={styles.summaryValue}>
                  {selectedCustomer.orderCount}
                </span>
                <span className={styles.summaryLabel}>Total Orders</span>
              </div>
            </div>

            <div className={styles.summaryItem}>
              <span className={styles.currencyIcon}>£</span>
              <div>
                <span className={styles.summaryValue}>
                  {formatCurrency(selectedCustomer.totalSpent)}
                </span>
                <span className={styles.summaryLabel}>Total Spent</span>
              </div>
            </div>

            <div className={styles.summaryItem}>
              <span className={styles.currencyIcon}>Ø</span>
              <div>
                <span className={styles.summaryValue}>
                  {selectedCustomer.orderCount > 0
                    ? formatCurrency(
                        selectedCustomer.totalSpent /
                          selectedCustomer.orderCount,
                      )
                    : "£0.00"}
                </span>
                <span className={styles.summaryLabel}>Avg Order Value</span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.detailSection}>
          <h3>Order History</h3>
          <div className={styles.orderHistory}>
            {getCustomerOrders(selectedCustomer.id).length > 0 ? (
              getCustomerOrders(selectedCustomer.id).map((order: any) => (
                <div key={order.id} className={styles.orderHistoryItem}>
                  <div className={styles.orderHistoryMain}>
                    <span className={styles.orderNumber}>
                      {order.orderNumber}
                    </span>
                    <span className={styles.orderDate}>
                      {formatDate(order.createdAt)}
                    </span>
                  </div>
                  <div className={styles.orderHistoryMeta}>
                    <Badge
                      variant={
                        order.fulfillmentStatus === "delivered"
                          ? "success"
                          : "info"
                      }
                      size="sm"
                    >
                      {order.fulfillmentStatus}
                    </Badge>
                    <span className={styles.orderAmount}>
                      {formatCurrency(order.total)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className={styles.noOrders}>No orders found</p>
            )}
          </div>
        </div>

        <div className={styles.detailSection}>
          <h3>Account Info</h3>
          <p>
            Customer since:{" "}
            <strong>{formatDate(selectedCustomer.createdAt)}</strong>
          </p>
          {selectedCustomer.lastOrderAt && (
            <p>
              Last order:{" "}
              <strong>{formatDate(selectedCustomer.lastOrderAt)}</strong>
            </p>
          )}
        </div>
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
          Close
        </Button>
        <Button
          onClick={() => {
            setIsViewModalOpen(false);
            handleEditCustomer(selectedCustomer);
          }}
        >
          <Edit2 size={16} /> Edit Customer
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default CustomerViewModal;
