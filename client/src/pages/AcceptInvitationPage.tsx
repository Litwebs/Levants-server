import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "@/context/api";

const AcceptInvitationPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const userId = params.get("userId") || "";
  const token = params.get("token") || "";

  const [state, setState] = useState<
    | { status: "idle" | "loading"; message: string }
    | { status: "success"; message: string }
    | { status: "error"; message: string }
  >({ status: "idle", message: "" });

  const canSubmit = useMemo(
    () => userId.length === 24 && token.length >= 10,
    [userId, token],
  );

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!canSubmit) {
        setState({
          status: "error",
          message: "Invalid invitation link.",
        });
        return;
      }

      setState({ status: "loading", message: "Accepting invitation..." });
      try {
        await api.post("/auth/accept-invitation", { userId, token });
        if (!mounted) return;
        setState({
          status: "success",
          message: "Invitation accepted. You can now log in.",
        });

        // Give a moment for the user to read, then go to login.
        setTimeout(() => {
          navigate("/login", { replace: true });
        }, 1200);
      } catch (err: any) {
        if (!mounted) return;
        const msg =
          err?.response?.data?.message || "Invitation could not be accepted.";
        setState({ status: "error", message: msg });
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [canSubmit, navigate, token, userId]);

  return (
    <div style={{ padding: 24, maxWidth: 560, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 12 }}>Invitation</h2>
      <p>{state.status === "loading" ? "Please wait..." : state.message}</p>
    </div>
  );
};

export default AcceptInvitationPage;
