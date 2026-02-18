import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5001/api",
  withCredentials: true,
});

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;
export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
  unauthorizedHandler = handler;
};

let refreshPromise: Promise<void> | null = null;
const runRefresh = async () => {
  if (!refreshPromise) {
    refreshPromise = api
      .post("/auth/refresh")
      .then(() => {
        return undefined;
      })
      .catch((err) => {
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  } 
  return refreshPromise;
};

const normalizeAuthPath = (rawUrl: unknown): string => {
  if (typeof rawUrl !== "string") return "";
  try {
    const asPath = rawUrl.startsWith("http")
      ? new URL(rawUrl).pathname + new URL(rawUrl).search
      : rawUrl;
    const pathOnly = asPath.split("?")[0] || "";
    const idx = pathOnly.indexOf("/auth/");
    if (idx >= 0) return pathOnly.slice(idx);
    return pathOnly;
  } catch {
    const pathOnly = rawUrl.split("?")[0] || "";
    const idx = pathOnly.indexOf("/auth/");
    if (idx >= 0) return pathOnly.slice(idx);
    return pathOnly;
  }
};

const NO_REFRESH_PREFIXES = [
  "/auth/login",
  "/auth/refresh",
  "/auth/logout",
  "/auth/2fa/verify",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/reset-password/verify",
];

const shouldAttemptRefresh = (authPath: string) => {
  if (!authPath) return true;
  const isAuthEndpoint = authPath.startsWith("/auth/") || authPath.includes("/auth/");
  if (!isAuthEndpoint) return true;
  return !NO_REFRESH_PREFIXES.some((p) => authPath.startsWith(p));
};

const shouldNotifyUnauthorized = (authPath: string) => {
  if (!authPath) return true;
  const isAuthEndpoint = authPath.startsWith("/auth/") || authPath.includes("/auth/");
  if (!isAuthEndpoint) return true;
  // Login / refresh failures are handled by the caller/UI, not the global session-expired toast.
  return !NO_REFRESH_PREFIXES.some((p) => authPath.startsWith(p));
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const originalRequest = error?.config as any;

    if (status !== 401 || !originalRequest) {
      return Promise.reject(error);
    }

    const authPath = normalizeAuthPath(originalRequest.url);

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log(
        "[api] 401 intercepted",
        originalRequest?.method?.toUpperCase?.() || originalRequest?.method,
        authPath || originalRequest?.url,
      );
    }

    // Only retry once.
    if (originalRequest._retry) {
      if (shouldNotifyUnauthorized(authPath)) unauthorizedHandler?.();
      return Promise.reject(error);
    }

    if (!shouldAttemptRefresh(authPath)) {
      // e.g. bad login credentials, invalid 2FA code, or refresh token missing/expired.
      // Let the caller handle these without triggering global logout.
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      await runRefresh();

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log(
          "[api] retrying after refresh",
          originalRequest?.method?.toUpperCase?.() || originalRequest?.method,
          authPath || originalRequest?.url,
        );
      }

      return api(originalRequest);
    } catch (refreshErr) {
      if (shouldNotifyUnauthorized(authPath)) unauthorizedHandler?.();
      return Promise.reject(refreshErr);
    }
  },
);

export default api;
