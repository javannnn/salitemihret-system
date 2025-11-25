import { FormEvent, useCallback, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { Button, Card, Input } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { inviteAccept } from "@/lib/api";

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

  const passwordMismatch = useMemo(() => Boolean(password && confirmPassword && password !== confirmPassword), [password, confirmPassword]);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token.trim()) {
      toast.push("Invitation token is required");
      return;
    }
    if (passwordMismatch) {
      toast.push("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await inviteAccept(token.trim(), {
        full_name: fullName || undefined,
        username: username || undefined,
        password,
      });
      toast.push("Account ready. Sign in with your new credentials.");
      navigate("/login", { replace: true });
    } catch (error) {
      console.error(error);
      toast.push("Unable to complete onboarding");
    } finally {
      setSubmitting(false);
    }
  }, [token, fullName, username, password, passwordMismatch, toast, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-md space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">Finish setting up your account</h1>
          <p className="text-sm text-mute">Create your password and confirm your details to access the console.</p>
        </div>
        {!urlToken && (
          <div>
            <label className="text-xs uppercase text-mute">Invitation token</label>
            <Input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste invite token" required />
          </div>
        )}
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs uppercase text-mute">Full name</label>
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" />
          </div>
          <div>
            <label className="text-xs uppercase text-mute">Username</label>
            <Input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} placeholder="(optional)" />
            <p className="text-xs text-mute mt-1">Only lowercase letters, numbers, dots, underscores.</p>
          </div>
          <div>
            <label className="text-xs uppercase text-mute">Password</label>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <p className="text-xs text-mute mt-1">Minimum 12 characters, mix of upper/lowercase, digit, symbol.</p>
          </div>
          <div>
            <label className="text-xs uppercase text-mute">Confirm password</label>
            <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            {passwordMismatch && <p className="text-xs text-red-500 mt-1">Passwords must match.</p>}
          </div>
          <Button type="submit" className="w-full" disabled={submitting || passwordMismatch}>
            {submitting ? "Saving…" : "Create account"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
