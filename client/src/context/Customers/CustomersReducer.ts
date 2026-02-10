import {
  type Customer,
  type CustomersListMeta,
  type CustomersState,
  initialCustomersState,
} from "./constants";

export const CUSTOMERS_REQUEST = "CUSTOMERS_REQUEST";
export const CUSTOMERS_FAILURE = "CUSTOMERS_FAILURE";

export const CUSTOMERS_LIST_SUCCESS = "CUSTOMERS_LIST_SUCCESS";
export const CUSTOMERS_UPDATE_SUCCESS = "CUSTOMERS_UPDATE_SUCCESS";

export type CustomersAction =
  | { type: typeof CUSTOMERS_REQUEST }
  | { type: typeof CUSTOMERS_FAILURE; payload: string }
  | {
      type: typeof CUSTOMERS_LIST_SUCCESS;
      payload: { customers: Customer[]; meta: CustomersListMeta | null };
    }
  | {
      type: typeof CUSTOMERS_UPDATE_SUCCESS;
      payload: { customer: Customer };
    };

export default function CustomersReducer(
  state: CustomersState,
  action: CustomersAction,
): CustomersState {
  switch (action.type) {
    case CUSTOMERS_REQUEST:
      return { ...state, loading: true, error: null };

    case CUSTOMERS_FAILURE:
      return { ...state, loading: false, error: action.payload };

    case CUSTOMERS_LIST_SUCCESS:
      return {
        ...state,
        loading: false,
        error: null,
        customers: action.payload.customers,
        meta: action.payload.meta,
      };

    case CUSTOMERS_UPDATE_SUCCESS: {
      const updated = action.payload.customer;
      const next = state.customers.map((c) =>
        c._id === updated._id ? updated : c,
      );

      const exists = state.customers.some((c) => c._id === updated._id);
      return {
        ...state,
        loading: false,
        error: null,
        customers: exists ? next : [updated, ...state.customers],
      };
    }

    default:
      return state || initialCustomersState;
  }
}
