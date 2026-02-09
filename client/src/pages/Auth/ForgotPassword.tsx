import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";

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

import styles from "./ForgotPassword.module.css";

type ForgotPasswordResponse =
  | { success: true; message?: string; data: null }
  | { success: false; message?: string; data?: unknown };

const ForgotPassword: React.FC = () => {
  const { showToast } = useToast();

  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      showToast({ type: "error", title: "Email is required" });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const body = (await res
        .json()
        .catch(() => null)) as ForgotPasswordResponse | null;

      if (!res.ok || !body || ("success" in body && body.success === false)) {
        const msg = body?.message || "Request failed";
        showToast({ type: "error", title: msg });
        return;
      }

      // API intentionally does not reveal whether the account exists.
      showToast({ type: "success", title: body.message || "Check your email" });
      setEmail("");
    } catch {
      showToast({ type: "error", title: "Network error. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <div className={styles.logo}>LD</div>
          <div className={styles.brandText}>
            <h1 className={styles.title}>Levants Dairy</h1>
            <p className={styles.subtitle}>Reset your password</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Forgot password</CardTitle>
              <CardDescription>
                Enter your email and we’ll send a reset link.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <form className={styles.form} onSubmit={handleSubmit}>
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                leftIcon={<Mail size={16} />}
                autoComplete="email"
                fullWidth
              />

              <Button type="submit" fullWidth isLoading={isLoading}>
                Send reset link
              </Button>

              <div className={styles.row}>
                <p className={styles.note}>Remembered it?</p>
                <Link className={styles.link} to="/login">
                  Back to login
                </Link>
              </div>
            </form>
          </CardContent>

          <CardFooter>
            <p className={styles.noteCenter}>
              If your email exists in our system, you’ll receive a message
              shortly.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
