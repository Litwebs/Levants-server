import {
  createContext,
  useReducer,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import api from "../api";
import CustomersReducer, {
  CUSTOMERS_FAILURE,
  CUSTOMERS_LIST_SUCCESS,
  CUSTOMERS_REQUEST,
  CUSTOMERS_UPDATE_SUCCESS,
} from "./CustomersReducer.ts";

import type {
  Customer,
  CustomerAddress,
  Order,
  OrderStats,
  CustomersListMeta,
  CustomersState,
  ListCustomerOrdersResult,
  ListCustomersResult,
} from "./constants";

import { initialCustomersState } from "./constants";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
  meta?: unknown;
};

const unwrapData = <T,>(payload: unknown): T | null => {
  if (!payload || typeof payload !== "object") return null;
  const maybeEnvelope = payload as ApiEnvelope<T>;
  if ("data" in maybeEnvelope) return (maybeEnvelope.data ?? null) as T | null;
  return payload as T;
};

type CustomersContextType = {
  customers: CustomersState["customers"];
  meta: CustomersState["meta"];
  loading: CustomersState["loading"];
  error: CustomersState["error"];

  listCustomers: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }) => Promise<ListCustomersResult>;

  listCustomerOrders: (
    customerId: string,
    params?: { page?: number; pageSize?: number; search?: string },
  ) => Promise<ListCustomerOrdersResult>;

  getCustomerById: (customerId: string) => Promise<Customer>;

  updateCustomer: (
    customerId: string,
    body: {
      firstName?: string;
      lastName?: string;
      phone?: string | null;
      address?: CustomerAddress;
    },
  ) => Promise<Customer>;
};

const CustomersContext = createContext<CustomersContextType | null>(null);

export const CustomersProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(CustomersReducer, initialCustomersState);

  const listCustomers = useCallback(
    async (params?: { page?: number; pageSize?: number; search?: string }) => {
      dispatch({ type: CUSTOMERS_REQUEST });
      try {
        const res = await api.get("/admin/customers", {
          params: {
            page: params?.page,
            pageSize: params?.pageSize,
            search: params?.search,
          },
        });

        const envelope = res.data as ApiEnvelope<{
          customers?: Customer[];
          items?: Customer[];
        }>;

        const data = unwrapData<{
          customers?: Customer[];
          items?: Customer[];
        }>(res.data);

        const items = data?.customers ?? data?.items ?? [];
        const nextMeta =
          envelope?.meta && typeof envelope.meta === "object"
            ? (envelope.meta as CustomersListMeta)
            : null;

        dispatch({
          type: CUSTOMERS_LIST_SUCCESS,
          payload: { customers: items, meta: nextMeta },
        });

        return { customers: items, meta: nextMeta };
      } catch (err: any) {
        const msg = err?.response?.data?.message || "Failed to load customers";
        dispatch({ type: CUSTOMERS_FAILURE, payload: msg });
        throw err;
      }
    },
    [],
  );

  const getCustomerById = useCallback(async (customerId: string) => {
    const res = await api.get(`/admin/customers/${customerId}`);
    const data = unwrapData<{ customer: Customer }>(res.data);
    if (!data?.customer) throw new Error("Customer not found");
    return data.customer;
  }, []);

  const listCustomerOrders = useCallback(
    async (
      customerId: string,
      params?: { page?: number; pageSize?: number; search?: string },
    ) => {
      const res = await api.get(`/admin/customers/${customerId}/orders`, {
        params: {
          page: params?.page,
          pageSize: params?.pageSize,
          search: params?.search,
        },
      });

      const envelope = res.data as ApiEnvelope<{
        orders?: Order[];
        items?: Order[];
        stats?: OrderStats;
      }>;

      const data = unwrapData<{
        orders?: Order[];
        items?: Order[];
        stats?: OrderStats;
      }>(res.data);

      const orders = data?.orders ?? data?.items ?? [];
      const stats = data?.stats ?? null;
      const nextMeta =
        envelope?.meta && typeof envelope.meta === "object"
          ? (envelope.meta as CustomersListMeta)
          : null;

      return { orders, meta: nextMeta, stats };
    },
    [],
  );

  const updateCustomer = useCallback(
    async (
      customerId: string,
      body: {
        firstName?: string;
        lastName?: string;
        phone?: string | null;
        address?: CustomerAddress;
      },
    ) => {
      dispatch({ type: CUSTOMERS_REQUEST });
      try {
        const res = await api.put(`/admin/customers/${customerId}`, body);
        const data = unwrapData<{ customer: Customer }>(res.data);
        if (!data?.customer) throw new Error("Failed to update customer");

        dispatch({
          type: CUSTOMERS_UPDATE_SUCCESS,
          payload: { customer: data.customer },
        });

        return data.customer;
      } catch (err: any) {
        const msg = err?.response?.data?.message || "Failed to update customer";
        dispatch({ type: CUSTOMERS_FAILURE, payload: msg });
        throw err;
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      customers: state.customers,
      meta: state.meta,
      loading: state.loading,
      error: state.error,
      listCustomers,
      listCustomerOrders,
      getCustomerById,
      updateCustomer,
    }),
    [state, listCustomers, listCustomerOrders, getCustomerById, updateCustomer],
  );

  return (
    <CustomersContext.Provider value={value}>
      {children}
    </CustomersContext.Provider>
  );
};

export const useCustomers = () => {
  const ctx = useContext(CustomersContext);
  if (!ctx)
    throw new Error("useCustomers must be used inside CustomersProvider");
  return ctx;
};
