import { useState } from "react";
import { login } from "@/lib/auth";
import { Card, Button, Input } from "@/components/ui";
import { useToast } from "@/components/Toast";

const DEMO_ACCOUNTS = [
  { label: "Super Admin", email: "superadmin@example.com", password: "Demo123!" },
  { label: "PR Admin", email: "pradmin@example.com", password: "Demo123!" },
  { label: "Registrar", email: "registrar@example.com", password: "Demo123!" },
  { label: "Clerk", email: "clerk@example.com", password: "Demo123!" },
  { label: "Finance Admin", email: "finance@example.com", password: "Demo123!" },
];

export default function LoginPage() {
  const [email, setEmail] = useState(DEMO_ACCOUNTS[0].email);
  const [password, setPassword] = useState(DEMO_ACCOUNTS[0].password);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      toast.push("Logged in successfully");
      window.location.href = "/dashboard";
    } catch (err) {
      console.error(err);
      setError("Login failed. Check the credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <Card className="w-full max-w-3xl p-8">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-semibold">Welcome to SaliteOne</h1>
              <p className="text-sm text-mute mt-2">
                Use the quick demo buttons to explore the dashboard instantly, or sign in manually.
              </p>
            </div>
            <div className="space-y-3">
              {DEMO_ACCOUNTS.map((account) => (
                <Button
                  key={account.email}
                  variant="ghost"
                  className="justify-between"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                  }}
                >
                  <span className="font-medium">{account.label}</span>
                  <span className="text-xs text-mute">{account.email}</span>
                </Button>
              ))}
            </div>
            <p className="text-xs text-mute">All demo accounts share the password <strong>Demo123!</strong></p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-mute">Email</label>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-mute">Password</label>
              <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
