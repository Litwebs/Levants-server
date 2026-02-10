import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from "react";

import api from "../api";
import type { User } from "../Auth/constants";

type Role = {
  _id?: string;
  id?: string;
  name: string;
  permissions?: string[];
};

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

const getUserId = (u: Partial<User> & { _id?: unknown }) =>
  (typeof u._id === "string" && u._id) || (typeof u.id === "string" && u.id)
    ? String((u as any)._id || (u as any).id)
    : "";

const mergeRoleIfMissing = (prevUser: any, nextUser: any) => {
  const prevRole = prevUser?.role;
  const nextRole = nextUser?.role;

  const nextIsOnlyId = typeof nextRole === "string";
  const prevIsPopulated = prevRole && typeof prevRole === "object";

  if (nextIsOnlyId && prevIsPopulated) {
    return { ...nextUser, role: prevRole };
  }
  return nextUser;
};

type UsersContextType = {
  users: User[];
  roles: Role[];
  loading: boolean;
  rolesLoading: boolean;
  error: string | null;

  fetchRoles: () => Promise<Role[]>;

  fetchUsers: () => Promise<User[]>;
  getUserById: (userId: string) => Promise<User>;
  createUser: (body: {
    name: string;
    email: string;
    password: string;
    roleId: string;
    status?: "active" | "disabled";
  }) => Promise<User>;
  updateUser: (userId: string, updates: Record<string, any>) => Promise<User>;
  updateUserStatus: (
    userId: string,
    status: "active" | "disabled",
  ) => Promise<User>;
};

const UsersContext = createContext<UsersContextType | null>(null);

export const UsersProvider = ({ children }: { children: ReactNode }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    setRolesLoading(true);
    setError(null);
    try {
      const res = await api.get("/access/roles");
      const data = unwrapData<{ roles: Role[] }>(res.data);
      const next = data?.roles ?? [];
      setRoles(next);
      return next;
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to load roles";
      setError(msg);
      throw err;
    } finally {
      setRolesLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/auth/users");
      const data = unwrapData<{ users: User[] }>(res.data);
      const next = data?.users ?? [];
      setUsers(next);
      return next;
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to load users";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getUserById = useCallback(async (userId: string) => {
    const res = await api.get(`/auth/users/${userId}`);
    const data = unwrapData<{ user: User }>(res.data);
    if (!data?.user) throw new Error("User not found");
    return data.user;
  }, []);

  const createUser = useCallback(
    async (body: {
      name: string;
      email: string;
      password: string;
      roleId: string;
      status?: "active" | "disabled";
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.post("/auth/users", body);
        const data = unwrapData<{ user: User }>(res.data);
        if (!data?.user) throw new Error("Failed to create user");

        setUsers((prev) => {
          const createdId = getUserId(data.user as any);
          const withoutDup = prev.filter(
            (u) => getUserId(u as any) !== createdId,
          );
          return [data.user, ...withoutDup];
        });

        return data.user;
      } catch (err: any) {
        const msg = err?.response?.data?.message || "Failed to create user";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const updateUser = useCallback(
    async (userId: string, updates: Record<string, any>) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.put(`/auth/users/${userId}`, updates);
        const data = unwrapData<{ user: User }>(res.data);
        if (!data?.user) throw new Error("Failed to update user");

        let resolvedUser: User = data.user;
        const roleLikelyChanged =
          typeof updates?.roleId === "string" && updates.roleId.length === 24;
        const roleNotPopulated =
          typeof (resolvedUser as any)?.role === "string";

        if (roleLikelyChanged || roleNotPopulated) {
          try {
            resolvedUser = await getUserById(userId);
          } catch {
            // fall back to response
          }
        }

        setUsers((prev) => {
          const updatedId = getUserId(resolvedUser as any);
          return prev.map((u) =>
            getUserId(u as any) === updatedId
              ? (mergeRoleIfMissing(u as any, resolvedUser as any) as any)
              : u,
          );
        });

        return resolvedUser;
      } catch (err: any) {
        const msg = err?.response?.data?.message || "Failed to update user";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [getUserById],
  );

  const updateUserStatus = useCallback(
    async (userId: string, status: "active" | "disabled") => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.put(`/auth/users/${userId}/status`, { status });
        const data = unwrapData<{ user: User }>(res.data);
        if (!data?.user) throw new Error("Failed to update user status");

        setUsers((prev) => {
          const updatedId = getUserId(data.user as any);
          return prev.map((u) =>
            getUserId(u as any) === updatedId
              ? (mergeRoleIfMissing(u as any, data.user as any) as any)
              : u,
          );
        });

        return data.user;
      } catch (err: any) {
        const msg =
          err?.response?.data?.message || "Failed to update user status";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      users,
      roles,
      loading,
      rolesLoading,
      error,
      fetchRoles,
      fetchUsers,
      getUserById,
      createUser,
      updateUser,
      updateUserStatus,
    }),
    [
      error,
      fetchRoles,
      fetchUsers,
      getUserById,
      createUser,
      loading,
      roles,
      rolesLoading,
      updateUser,
      updateUserStatus,
      users,
    ],
  );

  return (
    <UsersContext.Provider value={value}>{children}</UsersContext.Provider>
  );
};

export const useUsers = () => {
  const ctx = useContext(UsersContext);
  if (!ctx) throw new Error("useUsers must be used inside UsersProvider");
  return ctx;
};
