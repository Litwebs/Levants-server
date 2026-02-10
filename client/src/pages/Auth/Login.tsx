import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock } from "lucide-react";

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

import styles from "./Login.module.css";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { login, loading, error, isAuthenticated, twoFactorPending } =
    useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      showToast({ type: "error", title: "Email and password are required" });
      return;
    }

    setHasSubmitted(true);
    await login(email, password, rememberMe);
  };

  useEffect(() => {
    // If already authenticated, never allow staying on /login
    if (isAuthenticated) {
      if (hasSubmitted) {
        showToast({ type: "success", title: "Signed in successfully" });
      }
      navigate("/", { replace: true });
      return;
    }

    if (twoFactorPending) {
      sessionStorage.setItem("levants.tempToken", twoFactorPending.tempToken);
      if (twoFactorPending.expiresAt) {
        sessionStorage.setItem(
          "levants.tempTokenExpiresAt",
          String(twoFactorPending.expiresAt),
        );
      }
      navigate("/2fa", { replace: true });
      return;
    }

    if (error) {
      showToast({ type: "error", title: error });
    }
  }, [
    twoFactorPending,
    isAuthenticated,
    error,
    hasSubmitted,
    navigate,
    showToast,
  ]);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <div className={styles.logo}>LD</div>
          <div className={styles.brandText}>
            <h1 className={styles.title}>Levants Dairy</h1>
            <p className={styles.subtitle}>Admin dashboard login</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Sign in</CardTitle>
            <CardDescription>
              Use your admin email and password.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form className={styles.form} onSubmit={handleSubmit}>
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftIcon={<Mail size={16} />}
                autoComplete="email"
                placeholder="Enter your email"
                fullWidth
              />

              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={<Lock size={16} />}
                autoComplete="current-password"
                placeholder="Enter your password"
                fullWidth
              />

              <div className={styles.row}>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Remember me
                </label>

                <Link className={styles.link} to="/forgot-password">
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" fullWidth isLoading={loading}>
                Sign in
              </Button>
            </form>
          </CardContent>

          <CardFooter>
            <p className={styles.footerNote}>
              Contact an admin if you can’t access your account.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Login;
