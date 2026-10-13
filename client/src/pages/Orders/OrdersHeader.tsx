import { ListPageHeader } from "../../components/common";
import type { OrdersPageState } from "./useOrders";

type OrdersHeaderProps = Pick<
  OrdersPageState,
  "filteredOrders" | "meta" | "refresh" | "loading"
>;

const OrdersHeader = ({
  filteredOrders,
  meta,
  refresh,
  loading,
}: OrdersHeaderProps) => {
  const totalOrders = meta?.total ?? filteredOrders.length;

  return (
    <ListPageHeader title="Orders" subtitle={`${totalOrders} orders found`} loading={loading} refresh={refresh} />
  );
};

export default OrdersHeader;
