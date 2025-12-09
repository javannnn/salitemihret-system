import { FormEvent, useCallback, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { Button, Card, Input } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { inviteAccept, ApiError } from "@/lib/api";

export default function Onboard() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const urlToken = new URLSearchParams(location.search).get("token") ?? "";
  const [token, setToken] = useState(urlToken);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const passwordMismatch = useMemo(() => Boolean(password && confirmPassword && password !== confirmPassword), [password, confirmPassword]);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setPendingMessage(null);
    if (!token.trim()) {
      toast.push("Invitation token is required");
      return;
    }
    if (passwordMismatch) {
      toast.push("Passwords do not match");
      return;
    }
    setSubmitting(true);
    setPendingMessage("Saving your account…");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        await inviteAccept(
          token.trim(),
          {
            full_name: fullName || undefined,
            username: username || undefined,
            password,
          },
          controller.signal
        );
      } finally {
        clearTimeout(timeout);
      }
      toast.push("Account ready. Sign in with your new credentials.");
      navigate("/login", { replace: true });
    } catch (error) {
      console.error(error);
      if (error instanceof ApiError) {
        try {
          const parsed = JSON.parse(error.body || "{}");
          const detail = parsed.detail || parsed.message || error.message;
          setErrorMessage(typeof detail === "string" ? detail : JSON.stringify(detail));
        } catch {
          setErrorMessage(error.body || error.message);
        }
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to complete onboarding. Please try again.");
      }
    } finally {
      setSubmitting(false);
      setPendingMessage(null);
    }
  }, [token, fullName, username, password, passwordMismatch, toast, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md space-y-4 p-6 shadow-xl border border-slate-200">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Finish setting up your account</h1>
          <p className="text-sm text-slate-600">Create your password and confirm your details to access the console.</p>
        </div>
        {!urlToken && (
          <div>
            <label className="text-xs uppercase text-slate-500">Invitation token</label>
            <Input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste invite token" required />
          </div>
        )}
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs uppercase text-slate-500">Full name</label>
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" />
          </div>
          <div>
            <label className="text-xs uppercase text-slate-500">Username</label>
            <Input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} placeholder="(optional)" />
            <p className="text-xs text-slate-600 mt-1">Only lowercase letters, numbers, dots, underscores.</p>
          </div>
          <div>
            <label className="text-xs uppercase text-slate-500">Password</label>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <p className="text-xs text-slate-600 mt-1">Minimum 12 characters, mix of upper/lowercase, digit, symbol.</p>
          </div>
          <div>
            <label className="text-xs uppercase text-slate-500">Confirm password</label>
            <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            {passwordMismatch && <p className="text-xs text-red-500 mt-1">Passwords must match.</p>}
          </div>
          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
          {pendingMessage && !errorMessage && submitting && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-blue-500 animate-ping" />
              <span>{pendingMessage}</span>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={submitting || passwordMismatch}>
            {submitting ? "Saving…" : "Create account"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
