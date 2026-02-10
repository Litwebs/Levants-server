import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
} from "@/components/common";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/context/Auth/AuthContext";

import styles from "./ResetPassword.module.css";

const VerifyEmailChange: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirmEmailChange } = useAuth();
  const [searchParams] = useSearchParams();

  const userId = useMemo(
    () => searchParams.get("userId") || "",
    [searchParams],
  );
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [status, setStatus] = useState<"verifying" | "success" | "error">(
    "verifying",
  );

  const ranRef = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (ranRef.current) return;
      ranRef.current = true;

      if (!userId || !token) {
        setStatus("error");
        return;
      }

      setStatus("verifying");
      try {
        await confirmEmailChange({ userId, token });
        setStatus("success");
        showToast({
          type: "success",
          title: "Email updated. Please log in again.",
        });
        navigate("/login", { replace: true });
      } catch (err: any) {
        const msg =
          err?.response?.data?.message || "This link is invalid or expired.";
        setStatus("error");
        showToast({ type: "error", title: msg });
      }
    };

    void run();
  }, [confirmEmailChange, navigate, showToast, token, userId]);

  const content = () => {
    if (status === "verifying") {
      return (
        <p className={styles.noteCenter}>Verifying your email change link…</p>
      );
    }

    if (!userId || !token) {
      return (
        <>
          <p className={styles.noteCenter}>
            This verification link is missing required information.
          </p>
          <div className={styles.row}>
            <p className={styles.note}>Back to</p>
            <Link className={styles.link} to="/login">
              Login
            </Link>
          </div>
        </>
      );
    }

    if (status === "error") {
      return (
        <>
          <p className={styles.noteCenter}>
            This verification link is invalid or expired.
          </p>
          <div className={styles.row}>
            <p className={styles.note}>Back to</p>
            <Link className={styles.link} to="/login">
              Login
            </Link>
          </div>
        </>
      );
    }

    return (
      <>
        <p className={styles.noteCenter}>
          Email updated. Redirecting to login…
        </p>
        <Button fullWidth onClick={() => navigate("/login")}>
          Go to login
        </Button>
      </>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <div className={styles.logo}>LD</div>
          <div className={styles.brandText}>
            <h1 className={styles.title}>Levants Dairy</h1>
            <p className={styles.subtitle}>Verify email change</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Verify email change</CardTitle>
              <CardDescription>
                Confirming your new email address.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>{content()}</CardContent>

          <CardFooter>
            <p className={styles.noteCenter}>
              If this fails, request a new email change from Settings.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default VerifyEmailChange;
