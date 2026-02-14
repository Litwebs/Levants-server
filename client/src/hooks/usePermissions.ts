import { useCallback, useMemo } from "react";
import { useAuth } from "@/context/Auth/AuthContext";

type Permission = string;

type UsePermissionsResult = {
  permissions: Permission[];
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  hasAllPermissions: (permissions: Permission[]) => boolean;
};

export const usePermissions = (): UsePermissionsResult => {
  const { user } = useAuth();

  const permissions = useMemo<Permission[]>(() => {
    const role = typeof user?.role === "string" ? null : user?.role;
    const raw = role?.permissions;
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  }, [user?.role]);

  const hasPermission = useCallback(
    (permission: Permission) => {
      if (!permission) return false;
      return permissions.includes("*") || permissions.includes(permission);
    },
    [permissions],
  );

  const hasAnyPermission = useCallback(
    (required: Permission[]) => {
      if (!Array.isArray(required) || required.length === 0) return true;
      return required.some((p) => hasPermission(p));
    },
    [hasPermission],
  );

  const hasAllPermissions = useCallback(
    (required: Permission[]) => {
      if (!Array.isArray(required) || required.length === 0) return true;
      return required.every((p) => hasPermission(p));
    },
    [hasPermission],
  );

  return { permissions, hasPermission, hasAnyPermission, hasAllPermissions };
};
