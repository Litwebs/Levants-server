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
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const originalRequest = error?.config as any;

    if (status !== 401 || !originalRequest) {
      return Promise.reject(error);
    }

    const url = typeof originalRequest.url === "string" ? originalRequest.url : "";
    const isAuthEndpoint =
      url.startsWith("/auth/") || url.includes("/auth/") || url.startsWith("auth/");

    // Never try to refresh on auth endpoints (avoids loops).
    if (isAuthEndpoint) {
      unauthorizedHandler?.();
      return Promise.reject(error);
    }

    // Only retry once.
    if (originalRequest._retry) {
      unauthorizedHandler?.();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      await runRefresh();
      return api(originalRequest);
    } catch (refreshErr) {
      unauthorizedHandler?.();
      return Promise.reject(refreshErr);
    }
  },
);

export default api;
