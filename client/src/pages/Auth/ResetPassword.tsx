import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";

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

import styles from "./ResetPassword.module.css";

type VerifyTokenResponse =
  | { success: true; message?: string; data: null }
  | { success: false; message?: string; data?: { valid?: boolean } | null };

type ResetPasswordResponse =
  | { success: true; message?: string; data: null }
  | { success: false; message?: string; data?: unknown };

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [isVerifying, setIsVerifying] = useState(true);
  const [isTokenValid, setIsTokenValid] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const verify = async () => {
      if (!token) {
        setIsVerifying(false);
        setIsTokenValid(false);
        return;
      }

      setIsVerifying(true);
      try {
        const res = await fetch(
          `/api/auth/reset-password/verify?token=${encodeURIComponent(token)}`,
          { method: "GET" },
        );

        const body = (await res
          .json()
          .catch(() => null)) as VerifyTokenResponse | null;

        if (!res.ok || !body || ("success" in body && body.success === false)) {
          setIsTokenValid(false);
          return;
        }

        setIsTokenValid(true);
      } catch {
        setIsTokenValid(false);
      } finally {
        setIsVerifying(false);
      }
    };

    void verify();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      showToast({ type: "error", title: "Reset token is missing" });
      return;
    }

    if (!newPassword.trim()) {
      showToast({ type: "error", title: "Please enter a new password" });
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast({ type: "error", title: "Passwords do not match" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const body = (await res
        .json()
        .catch(() => null)) as ResetPasswordResponse | null;

      if (!res.ok || !body || ("success" in body && body.success === false)) {
        const msg = body?.message || "Password reset failed";
        showToast({ type: "error", title: msg });
        return;
      }

      showToast({ type: "success", title: body.message || "Password updated" });
      navigate("/login");
    } catch {
      showToast({ type: "error", title: "Network error. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const content = () => {
    if (isVerifying) {
      return <p className={styles.noteCenter}>Verifying your reset link…</p>;
    }

    if (!token) {
      return (
        <>
          <p className={styles.noteCenter}>
            This reset link is missing a token.
          </p>
          <div className={styles.row}>
            <p className={styles.note}>Need a new link?</p>
            <Link className={styles.link} to="/forgot-password">
              Request reset
            </Link>
          </div>
        </>
      );
    }

    if (!isTokenValid) {
      return (
        <>
          <p className={styles.noteCenter}>
            This reset link is invalid or expired.
          </p>
          <div className={styles.row}>
            <p className={styles.note}>Need a new link?</p>
            <Link className={styles.link} to="/forgot-password">
              Request reset
            </Link>
          </div>
        </>
      );
    }

    return (
      <form className={styles.form} onSubmit={handleSubmit}>
        <Input
          label="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="••••••••"
          leftIcon={<Lock size={16} />}
          autoComplete="new-password"
          fullWidth
        />

        <Input
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          leftIcon={<Lock size={16} />}
          autoComplete="new-password"
          fullWidth
        />

        <Button type="submit" fullWidth isLoading={isSubmitting}>
          Set new password
        </Button>

        <div className={styles.row}>
          <p className={styles.note}>Back to</p>
          <Link className={styles.link} to="/login">
            Login
          </Link>
        </div>
      </form>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <div className={styles.logo}>LD</div>
          <div className={styles.brandText}>
            <h1 className={styles.title}>Levants Dairy</h1>
            <p className={styles.subtitle}>Set a new password</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Set a new password</CardTitle>
              <CardDescription>
                Choose a new password for your account.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>{content()}</CardContent>

          <CardFooter>
            <p className={styles.noteCenter}>
              For your security, reset links expire.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
