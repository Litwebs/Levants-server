import { ArrowUpRight, Package } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/common";
import { DonutChart } from "../../../components/charts";
import { formatCompactNumber, formatCurrencyGBP } from "../../../lib/numberFormat";
import styles from "../Dashboard.module.css";

type Props = {
  recentOrders: any[];
  orderStatusData: Array<{ label: string; value: number; color: string }>;
  lowStockItems: any[];
  outOfStockItems: any[];
  onViewAllOrders: () => void;
  onViewAllProducts: () => void;
};

const getStatusBadge = (status: string) => {
  const variants: Record<
    string,
    "success" | "warning" | "error" | "info" | "default"
  > = {
    pending: "warning",
    paid: "success",
    failed: "error",
    cancelled: "error",
    refund_pending: "warning",
    refunded: "info",
    refund_failed: "error",
  };

  return (
    <Badge variant={variants[status] || "default"}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
};

const DashboardOrdersStock: React.FC<Props> = ({
  recentOrders,
  orderStatusData,
  lowStockItems,
  outOfStockItems,
  onViewAllOrders,
  onViewAllProducts,
}) => {
  return (
    <div className={styles.grid}>
      <Card className={styles.ordersCard}>
        <CardHeader
          action={
            <Button
              variant="ghost"
              size="sm"
              rightIcon={<ArrowUpRight size={14} />}
              onClick={onViewAllOrders}
            >
              View All
            </Button>
          }
        >
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>

        <CardContent>
          <div className={styles.ordersList}>
            {recentOrders.map((order) => (
              <div
                key={order._id}
                className={styles.orderItem}
                onClick={onViewAllOrders}
              >
                <div className={styles.orderInfo}>
                  <span className={styles.orderNumber}>{order.orderId}</span>

                  <span className={styles.orderCustomer}>
                    {order?.customer?.firstName || order?.customer?.lastName
                      ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim()
                      : order?.customer?.email || "Guest"}
                  </span>

                  <span className={styles.orderDate}>
                    {new Date(order.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>

                <div className={styles.orderMeta}>
                  <div className={styles.orderBadges}>
                    {getStatusBadge(order.status)}
                  </div>

                  <span className={styles.orderTotal}>
                    {formatCurrencyGBP(Number(order.total || 0))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className={styles.sideColumn}>
        <Card className={styles.statusCard}>
          <CardHeader>
            <CardTitle>Order Status</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart data={orderStatusData} size={120} showLegendValues />
          </CardContent>
        </Card>

        <Card className={styles.stockCard}>
          <CardHeader
            action={
              <Button
                variant="ghost"
                size="sm"
                rightIcon={<ArrowUpRight size={14} />}
                onClick={onViewAllProducts}
              >
                View All
              </Button>
            }
          >
            <CardTitle>Low Stock Alert</CardTitle>
          </CardHeader>

          <CardContent>
            {lowStockItems.length === 0 ? (
              <p className={styles.emptyState}>
                All products are well stocked!
              </p>
            ) : (
              <div className={styles.stockList}>
                {lowStockItems.slice(0, 6).map((item) => (
                  <div
                    key={item._id}
                    className={`${styles.stockItem} ${styles.stockItemLow}`}
                  >
                    <Package
                      size={18}
                      className={`${styles.stockIcon} ${styles.stockIconLow}`}
                    />
                    <div className={styles.stockInfo}>
                      <span className={styles.stockName}>
                        {item.product?.name ? `${item.product.name} · ` : ""}
                        {item.name}
                      </span>
                      <span className={styles.stockQty}>
                        {formatCompactNumber(item.available)} available
                      </span>
                    </div>
                    <Badge variant="warning" size="sm">
                      Low
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={styles.stockCard}>
          <CardHeader
            action={
              <Button
                variant="ghost"
                size="sm"
                rightIcon={<ArrowUpRight size={14} />}
                onClick={onViewAllProducts}
              >
                View All
              </Button>
            }
          >
            <CardTitle>Out of Stock</CardTitle>
          </CardHeader>

          <CardContent>
            {outOfStockItems.length === 0 ? (
              <p className={styles.emptyState}>No items are out of stock.</p>
            ) : (
              <div className={styles.stockList}>
                {outOfStockItems.slice(0, 6).map((item) => (
                  <div key={item._id} className={styles.stockItem}>
                    <Package size={18} className={styles.stockIcon} />
                    <div className={styles.stockInfo}>
                      <span className={styles.stockName}>
                        {item.product?.name ? `${item.product.name} · ` : ""}
                        {item.name}
                      </span>
                      <span className={styles.stockQty}>
                        {formatCompactNumber(item.available)} available
                      </span>
                    </div>
                    <Badge variant="error" size="sm">
                      OOS
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardOrdersStock;
