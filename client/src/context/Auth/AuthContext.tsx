// src/context/Auth/AuthContext.tsx

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import AuthReducer, {
  AUTH_REQUEST,
  AUTH_SUCCESS,
  AUTH_FAILURE,
  AUTH_LOGOUT,
  AUTH_2FA_REQUIRED,
  CLEAR_2FA,
} from "./AuthReducer";
import {
  ApiResponse,
  AuthState,
  initialAuthState,
  User,
  Session,
} from "./constants";
import api from "../api";

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

type AuthContextType = AuthState & {
  checkAuth: () => Promise<void>;
  login: (
    email: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<void>;
  verify2FA: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;

  confirmEmailChange: (data: {
    userId: string;
    token: string;
  }) => Promise<void>;

  getSessions: () => Promise<Session[]>;
  revokeSession: (sessionId: string) => Promise<void>;

  changePassword: (data: {
    currentPassword: string;
    newPassword: string;
    confirmNewPassword?: string;
  }) => Promise<void>;

  toggle2FA: () => Promise<void>;

  listUsers: () => Promise<User[]>;
  getUserById: (userId: string) => Promise<User>;
  updateUser: (userId: string, data: Partial<User>) => Promise<User>;
  updateUserStatus: (
    userId: string,
    status: "active" | "disabled",
  ) => Promise<void>;
  updateSelf: (data: Partial<User>) => Promise<User>;
  forgotPassword: (email: string) => Promise<ApiResponse<null>>;
  resetPassword: (data: {
    token: string;
    newPassword: string;
  }) => Promise<ApiResponse<null>>;
  resetPasswordVerifyToken: (token: string) => Promise<boolean>;
};

const AuthContext = createContext<AuthContextType | null>(null);

const TEMP_TOKEN_STORAGE_KEY = "levants.tempToken";
const TEMP_TOKEN_EXPIRES_AT_STORAGE_KEY = "levants.tempTokenExpiresAt";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(
    AuthReducer,
    initialAuthState,
    (base) => {
      if (typeof window === "undefined") return base;

      const tempToken = window.sessionStorage.getItem(TEMP_TOKEN_STORAGE_KEY);
      const expiresAt = window.sessionStorage.getItem(
        TEMP_TOKEN_EXPIRES_AT_STORAGE_KEY,
      );

      if (!tempToken) return base;

      return {
        ...base,
        loading: false,
        twoFactorPending: {
          tempToken,
          expiresAt: expiresAt || null,
        },
      };
    },
  );

  const isHydratedUser = (candidate: unknown): candidate is User => {
    if (!candidate || typeof candidate !== "object") return false;
    const u = candidate as Partial<User> & { _id?: unknown };
    const hasId = typeof u.id === "string" && u.id.length > 0;
    const hasMongoId = typeof u._id === "string" && u._id.length > 0;
    const hasEmail = typeof u.email === "string" && u.email.length > 0;
    const hasName = typeof u.name === "string" && u.name.length > 0;
    return (hasId || hasMongoId) && hasEmail && hasName;
  };

  const fetchMe = useCallback(async (): Promise<User | null> => {
    try {
      const res = await api.get("/auth/me");
      const meData = unwrapData<{ user: User }>(res.data);
      const user = meData?.user ?? (unwrapData<User>(res.data) as User | null);
      if (user && (user.id || (user as any)._id)) return user;
      return null;
    } catch {
      return null;
    }
  }, []);

  const checkAuthentication = useCallback(async (): Promise<boolean> => {
    const storedTempToken =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem(TEMP_TOKEN_STORAGE_KEY)
        : null;
    const storedExpiresAt =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem(TEMP_TOKEN_EXPIRES_AT_STORAGE_KEY)
        : null;

    const pendingPayload =
      state.twoFactorPending ||
      (storedTempToken
        ? { tempToken: storedTempToken, expiresAt: storedExpiresAt || null }
        : null);

    const pending2FA = !!pendingPayload?.tempToken;

    dispatch({ type: AUTH_REQUEST });

    try {
      const res = await api.get("/auth/authenticated");
      const authData = unwrapData<{
        authenticated: boolean;
        user: User | null;
      }>(res.data);

      const authenticated = !!authData?.authenticated;
      const authUser = authData?.user ?? null;

      if (!authenticated) {
        if (pending2FA && pendingPayload) {
          dispatch({
            type: AUTH_2FA_REQUIRED,
            payload: pendingPayload,
          });
          return false;
        }

        dispatch({ type: AUTH_LOGOUT });
        return false;
      }

      // `/auth/authenticated` may return a minimal token payload; ensure we hydrate via `/auth/me`.
      const user = isHydratedUser(authUser) ? authUser : await fetchMe();
      if (!user) {
        dispatch({ type: AUTH_LOGOUT });
        return false;
      }

      dispatch({
        type: AUTH_SUCCESS,
        payload: { user, isAuthenticated: true },
      });
      return true;
    } catch {
      if (pending2FA && pendingPayload) {
        dispatch({ type: AUTH_2FA_REQUIRED, payload: pendingPayload });
        return false;
      }

      dispatch({ type: AUTH_LOGOUT });
      return false;
    }
  }, [fetchMe, state.twoFactorPending]);

  // Backwards-compatible API (existing consumers expect Promise<void>)
  const checkAuth = useCallback(async (): Promise<void> => {
    await checkAuthentication();
  }, [checkAuthentication]);

  /* ---------- LOGIN ---------- */
  const login = async (email: string, password: string, rememberMe = false) => {
    try {
      dispatch({ type: AUTH_REQUEST });

      const res = await api.post("/auth/login", {
        email,
        password,
        rememberMe,
      });

      const loginData = unwrapData<
        | { user: User }
        | { requires2FA: true; tempToken: string; expiresAt?: string | null }
      >(res.data);

      if (loginData && "requires2FA" in loginData && loginData.requires2FA) {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            TEMP_TOKEN_STORAGE_KEY,
            loginData.tempToken,
          );
          if (loginData.expiresAt) {
            window.sessionStorage.setItem(
              TEMP_TOKEN_EXPIRES_AT_STORAGE_KEY,
              String(loginData.expiresAt),
            );
          }
        }
        dispatch({
          type: AUTH_2FA_REQUIRED,
          payload: {
            tempToken: loginData.tempToken,
            expiresAt: loginData.expiresAt ?? null,
          },
        });
        return;
      }

      const user = (loginData as { user?: User } | null)?.user ?? null;
      if (!user) {
        dispatch({ type: AUTH_FAILURE, payload: "Login failed" });
        return;
      }

      // Login response may not include full role permissions; hydrate via /auth/me.
      const hydrated = await fetchMe();
      const nextUser = hydrated || user;
      dispatch({
        type: AUTH_SUCCESS,
        payload: { user: nextUser, isAuthenticated: true },
      });
    } catch (err: any) {
      dispatch({
        type: AUTH_FAILURE,
        payload: err.response?.data?.message || "Login failed",
      });
    }
  };

  /* ---------- VERIFY 2FA ---------- */
  const verify2FA = async (code: string) => {
    const tempToken =
      state.twoFactorPending?.tempToken ||
      (typeof window !== "undefined"
        ? window.sessionStorage.getItem(TEMP_TOKEN_STORAGE_KEY)
        : null);

    if (!tempToken) {
      dispatch({
        type: AUTH_FAILURE,
        payload: "2FA session expired. Please login again.",
      });
      return;
    }

    try {
      dispatch({ type: AUTH_REQUEST });

      const res = await api.post("/auth/2fa/verify", {
        code,
        tempToken,
      });

      const verifyData = unwrapData<{ user: User }>(res.data);
      const user = verifyData?.user ?? null;
      if (!user) {
        dispatch({ type: AUTH_FAILURE, payload: "Invalid 2FA code" });
        return;
      }

      // Ensure permissions are present for role-based UI.
      const hydrated = await fetchMe();
      const nextUser = hydrated || user;

      dispatch({ type: CLEAR_2FA });
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(TEMP_TOKEN_STORAGE_KEY);
        window.sessionStorage.removeItem(TEMP_TOKEN_EXPIRES_AT_STORAGE_KEY);
      }
      dispatch({
        type: AUTH_SUCCESS,
        payload: { user: nextUser, isAuthenticated: true },
      });
    } catch (err: any) {
      dispatch({
        type: AUTH_FAILURE,
        payload: err.response?.data?.message || "Invalid 2FA code",
      });
    }
  };

  /* ---------- LOGOUT ---------- */
  const logout = async () => {
    await api.get("/auth/logout");
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(TEMP_TOKEN_STORAGE_KEY);
      window.sessionStorage.removeItem(TEMP_TOKEN_EXPIRES_AT_STORAGE_KEY);
    }
    dispatch({ type: AUTH_LOGOUT });
  };

  /* ---------- REFRESH ---------- */
  const refresh = async () => {
    await api.post("/auth/refresh");
    await checkAuth();
  };

  /* ---------- SESSIONS ---------- */
  const getSessions = async (): Promise<Session[]> => {
    const res = await api.get("/auth/sessions");
    const sessionsData = unwrapData<{ sessions: Session[] }>(res.data);
    return sessionsData?.sessions ?? [];
  };

  const revokeSession = async (sessionId: string) => {
    await api.post(`/auth/sessions/${sessionId}/revoke`);
  };

  /* ---------- PASSWORD ---------- */
  const changePassword = async (data: {
    currentPassword: string;
    newPassword: string;
    confirmNewPassword?: string;
  }) => {
    await api.post("/auth/change-password", {
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
      confirmNewPassword: data.confirmNewPassword ?? data.newPassword,
    });
  };

  /* ---------- 2FA ---------- */
  const toggle2FA = async () => {
    // Backend defaults to email-based 2FA if method is omitted.
    await api.get("/auth/2fa/toggle");
    await checkAuth();
  };

  /* ---------- CONFIRM EMAIL CHANGE ---------- */
  const confirmEmailChange = useCallback(
    async (data: { userId: string; token: string }) => {
      dispatch({ type: AUTH_REQUEST });
      try {
        await api.post("/auth/confirm-email-change", {
          userId: data.userId,
          token: data.token,
        });

        // Server revokes sessions & clears cookies; force a clean auth state.
        dispatch({ type: AUTH_LOGOUT });
      } catch (err: any) {
        dispatch({
          type: AUTH_FAILURE,
          payload:
            err.response?.data?.message || "Failed to confirm email change",
        });
        throw err;
      }
    },
    [],
  );

  /* ---------- USERS ---------- */
  const listUsers = async () => {
    const res = await api.get("/auth/users");
    const data = unwrapData<{ users: User[] }>(res.data);
    return data?.users ?? [];
  };

  const getUserById = async (id: string) => {
    const res = await api.get(`/auth/users/${id}`);
    const data = unwrapData<{ user: User }>(res.data);
    if (!data?.user) throw new Error("User not found");
    return data.user;
  };

  const updateUser = async (id: string, updates: Partial<User>) => {
    const res = await api.put(`/auth/users/${id}`, updates);
    const data = unwrapData<{ user: User }>(res.data);
    if (!data?.user) throw new Error("Failed to update user");
    return data.user;
  };

  const updateUserStatus = async (
    id: string,
    status: "active" | "disabled",
  ): Promise<void> => {
    await api.put(`/auth/users/${id}/status`, { status });
  };

  /* ---------- SELF ---------- */
  const updateSelf = async (updates: Partial<User>) => {
    const res = await api.put("/auth/me", updates);
    const data = unwrapData<{ user: User }>(res.data);
    if (!data?.user) throw new Error("Failed to update profile");
    dispatch({
      type: AUTH_SUCCESS,
      payload: { user: data.user, isAuthenticated: true },
    });
    return data.user;
  };

  const forgotPassword = async (email: string): Promise<ApiResponse<null>> => {
    const res = await api.post("/auth/forgot-password", { email });
    return res.data as ApiResponse<null>;
  };

  const resetPassword = async (data: {
    token: string;
    newPassword: string;
  }): Promise<ApiResponse<null>> => {
    const res = await api.post("/auth/reset-password", {
      token: data.token,
      newPassword: data.newPassword,
    });
    return res.data as ApiResponse<null>;
  };

  const resetPasswordVerifyToken = async (token: string) => {
    try {
      const res = await api.get(`/auth/reset-password/verify?token=${token}`);
      return res.data.success ?? false;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    checkAuthentication();
  }, [checkAuthentication]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        checkAuth,
        login,
        verify2FA,
        logout,
        refresh,
        getSessions,
        revokeSession,
        changePassword,
        toggle2FA,
        confirmEmailChange,
        listUsers,
        getUserById,
        updateUser,
        updateUserStatus,
        updateSelf,
        forgotPassword,
        resetPassword,
        resetPasswordVerifyToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
