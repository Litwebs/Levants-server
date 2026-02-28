import type React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/Auth/AuthContext";

type Props = {
  role: string;
  fallbackPath?: string;
  children: React.ReactNode;
};

export const RequireNotRole = ({ role, fallbackPath = "/", children }: Props) => {
  const { user } = useAuth();

  const roleName =
    typeof user?.role === "string" ? user.role : (user?.role as any)?.name;

  if (String(roleName || "") === String(role)) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
};
