// src/context/Auth/AuthReducer.ts

import { AuthState, User, TwoFactorPending, initialAuthState } from "./constants";

/* =======================
   ACTION TYPES
======================= */
export const AUTH_REQUEST = "AUTH_REQUEST";
export const AUTH_FAILURE = "AUTH_FAILURE";

export const AUTH_SUCCESS = "AUTH_SUCCESS";
export const AUTH_LOGOUT = "AUTH_LOGOUT";

export const AUTH_2FA_REQUIRED = "AUTH_2FA_REQUIRED";
export const CLEAR_2FA = "CLEAR_2FA";

/* =======================
   ACTIONS
======================= */
export type AuthAction =
  | { type: typeof AUTH_REQUEST }
  | { type: typeof AUTH_FAILURE; payload: string }
  | {
      type: typeof AUTH_SUCCESS;
      payload: { user: User; isAuthenticated: boolean };
    }
  | { type: typeof AUTH_2FA_REQUIRED; payload: TwoFactorPending }
  | { type: typeof CLEAR_2FA }
  | { type: typeof AUTH_LOGOUT };

/* =======================
   REDUCER
======================= */
export default function AuthReducer(
  state: AuthState,
  action: AuthAction
): AuthState {
  switch (action.type) {
    case AUTH_REQUEST:
      return { ...state, loading: true, error: null };

    case AUTH_SUCCESS:
      return {
        loading: false,
        error: null,
        isAuthenticated: action.payload.isAuthenticated,
        user: action.payload.user,
        twoFactorPending: null,
      };

    case AUTH_2FA_REQUIRED:
      return {
        loading: false,
        error: null,
        isAuthenticated: false,
        user: null,
        twoFactorPending: action.payload,
      };

    case CLEAR_2FA:
      return { ...state, twoFactorPending: null };

    case AUTH_FAILURE:
      return {
        ...state,
        loading: false,
        error: action.payload,
        isAuthenticated: false,
        user: null,
        twoFactorPending: null,
      };

    case AUTH_LOGOUT:
      return {
        ...initialAuthState,
        loading: false,
      };

    default:
      return state;
  }
}
