import { type AdminOrder, type OrdersListMeta, type OrdersState, initialOrdersState } from "./constants";

export const ORDERS_REQUEST = "ORDERS_REQUEST";
export const ORDERS_FAILURE = "ORDERS_FAILURE";

export const ORDERS_LIST_SUCCESS = "ORDERS_LIST_SUCCESS";
export const ORDERS_SET_CURRENT = "ORDERS_SET_CURRENT";
export const ORDERS_UPDATE_SUCCESS = "ORDERS_UPDATE_SUCCESS";
export const ORDERS_BULK_UPDATE_SUCCESS = "ORDERS_BULK_UPDATE_SUCCESS";


export type OrdersAction =
  | { type: typeof ORDERS_REQUEST }
  | { type: typeof ORDERS_FAILURE; payload: string }
  | {
      type: typeof ORDERS_LIST_SUCCESS;
      payload: { orders: AdminOrder[]; meta: OrdersListMeta | null };
    }
  | { type: typeof ORDERS_SET_CURRENT; payload: { order: AdminOrder | null } }
  | { type: typeof ORDERS_UPDATE_SUCCESS; payload: { order: AdminOrder } }   
  | {
      type: typeof ORDERS_BULK_UPDATE_SUCCESS;
      payload: {
        orderIds: string[];
        patch: Partial<AdminOrder>;
      };
    }
    
const applyPatch = (previous: AdminOrder, patch: Partial<AdminOrder>): AdminOrder => {
  const incoming = { ...previous, ...patch } as AdminOrder;
  return mergeCustomerIfNeeded(previous, incoming);
};

const mergeCustomerIfNeeded = (
  previous: AdminOrder | undefined,
  incoming: AdminOrder,
): AdminOrder => {
  if (!previous) return incoming;

  const previousCustomer = previous.customer;
  const incomingCustomer = incoming.customer;

  // Preserve populated customer object if the incoming payload only has an id.
  if (
    typeof incomingCustomer === "string" &&
    previousCustomer &&
    typeof previousCustomer === "object"
  ) {
    return { ...previous, ...incoming, customer: previousCustomer };
  }

  return { ...previous, ...incoming };
};

export default function OrdersReducer(
  state: OrdersState,
  action: OrdersAction,
): OrdersState {
  switch (action.type) {
    case ORDERS_REQUEST:
      return { ...state, loading: true, error: null };

    case ORDERS_FAILURE:
      return { ...state, loading: false, error: action.payload };

    case ORDERS_LIST_SUCCESS:
      return {
        ...state,
        loading: false,
        error: null,
        orders: action.payload.orders,
        meta: action.payload.meta,
      };

    case ORDERS_SET_CURRENT:
      return {
        ...state,
        loading: false,
        error: null,
        currentOrder: action.payload.order,
      };

    case ORDERS_UPDATE_SUCCESS: {
      const updated = action.payload.order;
      const existing = state.orders.find((o) => o._id === updated._id);

      const merged = mergeCustomerIfNeeded(existing, updated);

      const nextOrders = state.orders.some((o) => o._id === updated._id)
        ? state.orders.map((o) => (o._id === updated._id ? merged : o))
        : [merged, ...state.orders];

      const nextCurrent =
        state.currentOrder && state.currentOrder._id === updated._id
          ? mergeCustomerIfNeeded(state.currentOrder, updated)
          : state.currentOrder;

      return {
        ...state,
        loading: false,
        error: null,
        orders: nextOrders,
        currentOrder: nextCurrent,
      };
    }
        case ORDERS_BULK_UPDATE_SUCCESS: {
      const { orderIds, patch } = action.payload;

      const idSet = new Set(orderIds);

      const nextOrders = state.orders.map((o) =>
        idSet.has(o._id) ? applyPatch(o, patch) : o,
      );

      const nextCurrent =
        state.currentOrder && idSet.has(state.currentOrder._id)
          ? applyPatch(state.currentOrder, patch)
          : state.currentOrder;

      return {
        ...state,
        loading: false,
        error: null,
        orders: nextOrders,
        currentOrder: nextCurrent,
      };
    }


    default:
      return state || initialOrdersState;
  }
}
