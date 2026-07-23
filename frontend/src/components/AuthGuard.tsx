import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSessionStore } from "@/stores/sessionStore";
import { LoadingSpinner } from "@/components/LoadingSpinner";

type AuthGuardProps = {
  children: React.ReactNode;
};

export function AuthGuard({ children }: AuthGuardProps) {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated());
  const is_unlocked = useSessionStore((s) => s.is_unlocked);
  const navigate = useNavigate();
  const checked = useRef(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    if (!isAuthenticated) {
      sessionStorage.setItem("autopayke_redirect_to", window.location.pathname);
      void navigate({ to: "/login/phone", replace: true });
    } else if (!is_unlocked) {
      sessionStorage.setItem("autopayke_redirect_to", window.location.pathname);
      void navigate({ to: "/login", replace: true });
    } else {
      setChecking(false);
    }
  }, [isAuthenticated, is_unlocked, navigate]);

  if (!isAuthenticated || !is_unlocked || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linen">
        <LoadingSpinner size={28} color="orange" />
      </div>
    );
  }

  return <>{children}</>;
}
