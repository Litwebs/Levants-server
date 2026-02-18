// src/context/Auth/constants.ts

export type ApiResponse<TData = null> = {
  success: boolean;
  message?: string;
  data: TData;
};

/* =======================
   USER PREFERENCES
======================= */
export type NotificationPreferences = {
  newOrders: boolean;
  orderUpdates: boolean;
  lowStockAlerts: boolean;
  outOfStock: boolean;
  deliveryUpdates: boolean;
  customerMessages: boolean;
  paymentReceived: boolean;
};

export type UserPreferences = {
  language: string;
  theme: "light" | "dark" | "system" | string;
  notifications?: Partial<NotificationPreferences>;
};

export type RoleRef = {
  _id: string;
  name: string;
  permissions?: string[];
};

/* =======================
   USER (backend aligned)
======================= */
export type User = {
  id: string;
  _id?: string;

  name: string;
  email: string;

  pendingEmail?: string;

  // Invitation / email verification
  emailVerifiedAt?: string | null;
  inviteTokenExpiresAt?: string | null;
  invitedAt?: string | null;

  emailChange?: {
    pending?: boolean;
    pendingEmail?: string;
    expiresAt?: string | null;
  };

  role: string | RoleRef;
  status: "active" | "disabled";

  avatarUrl?: string;
  lastLoginAt?: string;

  twoFactorEnabled: boolean;

  preferences?: UserPreferences;

  createdBy?: string;

  createdAt: string;
  updatedAt: string;
};

/* =======================
   SESSION
======================= */
export type Session = {
  _id: string;
  user: string;

  userAgent?: string;
  label: string | null;
  ip?: string;

  expiresAt: string;
  revokedAt?: string | null;
  revokedReason?: string | null;

  createdAt: string;
  updatedAt: string;

  isCurrent?: boolean;
};

/* =======================
   2FA PENDING
======================= */
export type TwoFactorPending = {
  tempToken: string;
  expiresAt?: string | null;
};

/* =======================
   AUTH STATE
======================= */
export interface AuthState {
  loading: boolean;
  error: string | null;

  isAuthenticated: boolean;
  user: User | null;

  twoFactorPending: TwoFactorPending | null;
}

/* =======================
   INITIAL STATE
======================= */
export const initialAuthState: AuthState = {
  loading: true,
  error: null,
  isAuthenticated: false,
  user: null,
  twoFactorPending: null,
};
