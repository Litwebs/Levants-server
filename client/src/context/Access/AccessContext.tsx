import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import api from "../api";

import AccessReducer, {
  ACCESS_FAILURE,
  ACCESS_PERMISSIONS_REQUEST,
  ACCESS_PERMISSIONS_SUCCESS,
  ACCESS_ROLES_REQUEST,
  ACCESS_ROLES_SUCCESS,
  ACCESS_ROLE_CREATE_SUCCESS,
  ACCESS_ROLE_DELETE_SUCCESS,
  ACCESS_ROLE_UPDATE_SUCCESS,
} from "./AccessReducer";

import type { AccessState, Role } from "./constants";
import { initialAccessState } from "./constants";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

const unwrapData = <T,>(payload: unknown): T | null => {
  if (!payload || typeof payload !== "object") return null;
  const maybeEnvelope = payload as ApiEnvelope<T>;
  if ("data" in maybeEnvelope) return (maybeEnvelope.data ?? null) as T | null;
  return payload as T;
};

type AccessContextType = {
  roles: AccessState["roles"];
  permissions: AccessState["permissions"];
  loading: AccessState["loading"];
  rolesLoading: AccessState["rolesLoading"];
  permissionsLoading: AccessState["permissionsLoading"];
  error: AccessState["error"];

  listRoles: () => Promise<Role[]>;
  listPermissions: () => Promise<string[]>;

  createRole: (body: {
    name: string;
    description?: string;
    permissions: string[];
  }) => Promise<Role>;

  updateRole: (
    roleId: string,
    body: { description?: string; permissions?: string[] },
  ) => Promise<Role>;

  deleteRole: (roleId: string) => Promise<void>;
};

const AccessContext = createContext<AccessContextType | null>(null);

const getRoleId = (role: Partial<Role>) => String(role._id || role.id || "");

export const AccessProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(AccessReducer, initialAccessState);

  const listRoles = useCallback(async () => {
    dispatch({ type: ACCESS_ROLES_REQUEST });
    try {
      const res = await api.get("/access/roles");
      const data = unwrapData<{ roles: Role[] }>(res.data);
      const roles = data?.roles ?? [];
      dispatch({ type: ACCESS_ROLES_SUCCESS, payload: { roles } });
      return roles;
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to load roles";
      dispatch({ type: ACCESS_FAILURE, payload: msg });
      throw err;
    }
  }, []);

  const listPermissions = useCallback(async () => {
    dispatch({ type: ACCESS_PERMISSIONS_REQUEST });
    try {
      const res = await api.get("/access/permissions");
      const data = unwrapData<{ permissions: string[] }>(res.data);
      const permissions = data?.permissions ?? [];
      dispatch({
        type: ACCESS_PERMISSIONS_SUCCESS,
        payload: { permissions },
      });
      return permissions;
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to load permissions";
      dispatch({ type: ACCESS_FAILURE, payload: msg });
      throw err;
    }
  }, []);

  const createRole = useCallback(
    async (body: {
      name: string;
      description?: string;
      permissions: string[];
    }) => {
      try {
        const res = await api.post("/access/roles", body);
        const data = unwrapData<{ role: Role }>(res.data);
        if (!data?.role) throw new Error("Failed to create role");
        dispatch({
          type: ACCESS_ROLE_CREATE_SUCCESS,
          payload: { role: data.role },
        });
        return data.role;
      } catch (err: any) {
        const msg = err?.response?.data?.message || "Failed to create role";
        dispatch({ type: ACCESS_FAILURE, payload: msg });
        throw err;
      }
    },
    [],
  );

  const updateRole = useCallback(
    async (
      roleId: string,
      body: { description?: string; permissions?: string[] },
    ) => {
      try {
        const res = await api.put(`/access/roles/${roleId}`, body);
        const data = unwrapData<{ role: Role }>(res.data);
        if (!data?.role) throw new Error("Failed to update role");

        dispatch({
          type: ACCESS_ROLE_UPDATE_SUCCESS,
          payload: { role: data.role },
        });

        // If API returns role without _id (unlikely), keep existing id.
        if (!getRoleId(data.role)) {
          const existing = state.roles.find((r) => getRoleId(r) === roleId);
          return (existing || data.role) as Role;
        }

        return data.role;
      } catch (err: any) {
        const msg = err?.response?.data?.message || "Failed to update role";
        dispatch({ type: ACCESS_FAILURE, payload: msg });
        throw err;
      }
    },
    [state.roles],
  );

  const deleteRole = useCallback(async (roleId: string) => {
    try {
      await api.delete(`/access/roles/${roleId}`);
      dispatch({ type: ACCESS_ROLE_DELETE_SUCCESS, payload: { roleId } });
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to delete role";
      dispatch({ type: ACCESS_FAILURE, payload: msg });
      throw err;
    }
  }, []);

  const value = useMemo(
    () => ({
      roles: state.roles,
      permissions: state.permissions,
      loading: state.loading,
      rolesLoading: state.rolesLoading,
      permissionsLoading: state.permissionsLoading,
      error: state.error,
      listRoles,
      listPermissions,
      createRole,
      updateRole,
      deleteRole,
    }),
    [
      state.roles,
      state.permissions,
      state.loading,
      state.rolesLoading,
      state.permissionsLoading,
      state.error,
      listRoles,
      listPermissions,
      createRole,
      updateRole,
      deleteRole,
    ],
  );

  return (
    <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
  );
};

export const useAccess = () => {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used inside AccessProvider");
  return ctx;
};
