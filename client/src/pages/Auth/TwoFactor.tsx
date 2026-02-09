import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Input,
} from "@/components/common";
import { useToast } from "@/components/common/Toast";

import styles from "./TwoFactor.module.css";

type Verify2FAResponse =
  | { success: true; data?: { user?: unknown }; message?: string }
  | { success: false; message?: string; data?: null };

type LocationState = {
  tempToken?: string;
};

const TEMP_TOKEN_STORAGE_KEY = "levants.tempToken";

const TwoFactor: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const state = (location.state || {}) as LocationState;

  const tempToken = useMemo(() => {
    const fromState = state.tempToken;
    const fromStorage = sessionStorage.getItem(TEMP_TOKEN_STORAGE_KEY) || "";
    return fromState || fromStorage;
  }, [state.tempToken]);

  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChangeCode = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 6);
    setCode(digitsOnly);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tempToken) {
      showToast({
        type: "error",
        title: "2FA session expired. Please login again.",
      });
      return;
    }

    if (code.length !== 6) {
      showToast({ type: "error", title: "Enter the 6-digit code" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tempToken, code }),
      });

      const body = (await res
        .json()
        .catch(() => null)) as Verify2FAResponse | null;

      if (!res.ok || !body || ("success" in body && body.success === false)) {
        const msg = body?.message || "Invalid code";
        showToast({ type: "error", title: msg });
        return;
      }

      sessionStorage.removeItem(TEMP_TOKEN_STORAGE_KEY);
      showToast({ type: "success", title: "Verified" });
      navigate("/");
    } catch {
      showToast({ type: "error", title: "Network error. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToLogin = () => {
    sessionStorage.removeItem(TEMP_TOKEN_STORAGE_KEY);
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <div className={styles.logo}>LD</div>
          <div className={styles.brandText}>
            <h1 className={styles.title}>Levants Dairy</h1>
            <p className={styles.subtitle}>Two-factor verification</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Enter 6-digit code</CardTitle>
              <CardDescription>
                We sent a verification code to your email.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            {!tempToken ? (
              <>
                <p className={styles.noteCenter}>
                  Your verification session has expired.
                </p>
                <div className={styles.row}>
                  <p className={styles.note}>Go back to</p>
                  <Link
                    className={styles.link}
                    to="/login"
                    onClick={handleBackToLogin}
                  >
                    Login
                  </Link>
                </div>
              </>
            ) : (
              <form className={styles.form} onSubmit={handleSubmit}>
                <Input
                  label="Code"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => handleChangeCode(e.target.value)}
                  placeholder="123456"
                  leftIcon={<ShieldCheck size={16} />}
                  autoComplete="one-time-code"
                  fullWidth
                />

                <Button type="submit" fullWidth isLoading={isSubmitting}>
                  Verify
                </Button>

                <div className={styles.row}>
                  <p className={styles.note}>Not you?</p>
                  <Link
                    className={styles.link}
                    to="/login"
                    onClick={handleBackToLogin}
                  >
                    Back to login
                  </Link>
                </div>
              </form>
            )}
          </CardContent>

          <CardFooter>
            <p className={styles.noteCenter}>
              Codes expire after a short time.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default TwoFactor;

export { TEMP_TOKEN_STORAGE_KEY };
