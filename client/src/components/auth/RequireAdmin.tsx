import type React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/Auth/AuthContext";
import { LoadingScreen } from "@/components/common";

type Props = {
  fallbackPath?: string;
  children: React.ReactNode;
};

export const RequireAdmin = ({ fallbackPath = "/", children }: Props) => {
  const { user, loading, authTransition } = useAuth();

  if (loading && !authTransition) return <LoadingScreen />;

  const roleNameRaw =
    typeof user?.role === "string" ? user.role : user?.role?.name;
  const roleName = String(roleNameRaw || "").toLowerCase();

  if (roleName !== "admin") return <Navigate to={fallbackPath} replace />;
  return <>{children}</>;
};
