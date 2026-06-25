import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSessionStore } from "@/stores/sessionStore";
import { LoadingSpinner } from "@/components/LoadingSpinner";

type AuthGuardProps = {
  children: React.ReactNode;
};

export function AuthGuard({ children }: AuthGuardProps) {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated());
  const navigate = useNavigate();
  const checked = useRef(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    if (!isAuthenticated) {
      sessionStorage.setItem("autopayke_redirect_to", window.location.pathname);
      void navigate({ to: "/login", replace: true });
    } else {
      setChecking(false);
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy">
        <LoadingSpinner size={28} color="orange" />
      </div>
    );
  }

  return <>{children}</>;
}
