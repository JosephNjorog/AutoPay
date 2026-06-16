import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Mail, Lock, Loader2, AlertCircle } from "lucide-react";
import { MobileFrame } from "@/components/MobileFrame";
import { api, ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth-store";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log in · Autopayke" }, { name: "description", content: "Log in with email and password — no OTP needed." }] }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    try {
      const result = await api.auth.login(email, password);
      setAuth({ accessToken: result.accessToken, refreshToken: result.refreshToken }, result.user);
      navigate({ to: "/dashboard" });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to log in. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <MobileFrame>
      <div className="flex min-h-full flex-col p-6 pb-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="mt-10">
          <h1 className="text-4xl font-black tracking-tight leading-[1.05]">Welcome<br />back</h1>
          <p className="mt-3 text-sm text-muted-foreground">Log in with your email and password — instant, no code needed.</p>
        </div>

        <div className="mt-8 space-y-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Mail className="h-3 w-3" /> Email</p>
            <input
              type="email" inputMode="email" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full bg-transparent text-lg font-bold outline-none placeholder:text-muted-foreground/40"
            />
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Lock className="h-3 w-3" /> Password</p>
            <input
              type="password" placeholder="Your password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && email && password) handleLogin(); }}
              className="mt-1 w-full bg-transparent text-lg font-bold outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        </div>

        <div className="mt-auto pt-8 space-y-3">
          <button
            disabled={!email || !password || loading}
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold text-primary-foreground transition disabled:opacity-40 disabled:cursor-not-allowed shadow-(--shadow-elegant)"
            style={{ background: "var(--gradient-portfolio)" }}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Logging in…" : "Log in"} {!loading && <ArrowRight className="h-4 w-4" />}
          </button>
          <Link to="/signup" className="block w-full text-center text-[11px] text-muted-foreground">
            Forgot password? Use your phone number instead
          </Link>
        </div>
      </div>
    </MobileFrame>
  );
}
