import type React from "react";
import { Navigate } from "react-router-dom";
import { LoadingScreen } from "@/components/common";
import { useAuth } from "@/context/Auth/AuthContext";
import { hasLitwebsEmail } from "@/lib/internalAccess";

type Props = {
  fallbackPath?: string;
  children: React.ReactNode;
};

export const RequireLitwebsEmail = ({
  fallbackPath = "/",
  children,
}: Props) => {
  const { user, loading, authTransition } = useAuth();

  if (loading && !authTransition) return <LoadingScreen />;
  if (!hasLitwebsEmail(user?.email)) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
};
