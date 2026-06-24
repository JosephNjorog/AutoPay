import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/auth-store";
import { opsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const [token, setToken] = useState("");
  const [operator, setOperator] = useState("ops");
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setToken);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    try {
      setAuth(token.trim(), operator.trim() || "ops");
      await opsApi.overview();
      toast.success("Authenticated");
      navigate({ to: "/" });
    } catch {
      useAuthStore.getState().logout();
      toast.error("Invalid operations token");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-3">
            <span className="text-primary-foreground text-xl font-bold">T</span>
          </div>
          <h1 className="text-2xl font-bold">Tuma Ops</h1>
          <p className="text-sm text-muted-foreground mt-1">Admin Dashboard</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm"
        >
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Operations Token</label>
            <Input
              type="password"
              placeholder="Enter OPERATIONS_API_TOKEN"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Operator Name</label>
            <Input
              placeholder="e.g. alice, ops-team"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Used as an audit identifier for all ops actions
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Verifying…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
