import type React from "react";
import { Navigate } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";

type Props = {
  permission?: string;
  anyOf?: string[];
  allOf?: string[];
  fallbackPath?: string;
  children: React.ReactNode;
};

export const RequirePermission = ({
  permission,
  anyOf,
  allOf,
  fallbackPath = "/",
  children,
}: Props) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions } =
    usePermissions();

  const allowed = (() => {
    if (permission) return hasPermission(permission);
    if (Array.isArray(anyOf) && anyOf.length > 0)
      return hasAnyPermission(anyOf);
    if (Array.isArray(allOf) && allOf.length > 0)
      return hasAllPermissions(allOf);
    return true;
  })();

  if (!allowed) return <Navigate to={fallbackPath} replace />;
  return <>{children}</>;
};
