import type React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/Auth/AuthContext";

type Props = {
  domain: string;
  fallbackPath?: string;
  children: React.ReactNode;
};

export const RequireEmailDomain = ({
  domain,
  fallbackPath = "/",
  children,
}: Props) => {
  const { user } = useAuth();
  const allowed = !!user?.email?.endsWith(domain);
  if (!allowed) return <Navigate to={fallbackPath} replace />;
  return <>{children}</>;
};
