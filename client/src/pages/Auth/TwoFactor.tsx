import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { useAuth } from "@/context/Auth/AuthContext";

import styles from "./TwoFactor.module.css";

const TEMP_TOKEN_STORAGE_KEY = "levants.tempToken";
const TEMP_TOKEN_EXPIRES_AT_STORAGE_KEY = "levants.tempTokenExpiresAt";
const TEMP_2FA_CODE_STORAGE_KEY = "levants.2fa.code";

const TwoFactor: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { verify2FA, loading, error, twoFactorPending, isAuthenticated } =
    useAuth();

  const tempToken = useMemo(() => {
    const fromStorage = sessionStorage.getItem(TEMP_TOKEN_STORAGE_KEY) || "";
    return twoFactorPending?.tempToken || fromStorage;
  }, [twoFactorPending?.tempToken]);

  const expiresAt = useMemo(() => {
    const fromStorage =
      sessionStorage.getItem(TEMP_TOKEN_EXPIRES_AT_STORAGE_KEY) || "";
    return twoFactorPending?.expiresAt || fromStorage;
  }, [twoFactorPending?.expiresAt]);

  const [code, setCode] = useState(() => {
    try {
      return sessionStorage.getItem(TEMP_2FA_CODE_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.removeItem(TEMP_TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TEMP_TOKEN_EXPIRES_AT_STORAGE_KEY);
      sessionStorage.removeItem(TEMP_2FA_CODE_STORAGE_KEY);
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (!error) return;
    if (lastErrorRef.current === error) return;
    lastErrorRef.current = error;
    showToast({ type: "error", title: error });
  }, [error, showToast]);

  const formatTimeLeft = (ms: number) => {
    if (ms <= 0) return "expired";
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min < 60) return `${min}m ${sec}s`;
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return `${hr}h ${remMin}m`;
  };

  useEffect(() => {
    if (!tempToken || !expiresAt) {
      setTimeLeft(null);
      return;
    }

    const tick = () => {
      const exp = new Date(expiresAt).getTime();
      const now = Date.now();
      setTimeLeft(formatTimeLeft(exp - now));
    };

    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [expiresAt, tempToken]);

  const handleChangeCode = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 6);
    setCode(digitsOnly);
    try {
      sessionStorage.setItem(TEMP_2FA_CODE_STORAGE_KEY, digitsOnly);
    } catch {
      // ignore
    }
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

    try {
      await verify2FA(code);
      // success redirect is handled by isAuthenticated effect
    } catch {
      // verify2FA sets context error; toast handled via effect
    } finally {
    }
  };

  const handleBackToLogin = () => {
    sessionStorage.removeItem(TEMP_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TEMP_TOKEN_EXPIRES_AT_STORAGE_KEY);
    sessionStorage.removeItem(TEMP_2FA_CODE_STORAGE_KEY);
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
                  disabled={loading}
                />

                {timeLeft && (
                  <p className={styles.noteCenter}>
                    {timeLeft === "expired"
                      ? "Code expired. Please sign in again to receive a new code."
                      : `Code expires in ${timeLeft}.`}
                  </p>
                )}

                <Button type="submit" fullWidth isLoading={loading}>
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
