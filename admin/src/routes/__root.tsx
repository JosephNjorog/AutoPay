import { createRootRoute, Outlet, Navigate } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { useAuthStore } from "@/lib/auth-store";
import { Layout } from "@/components/Layout";

function Root() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn());

  if (!isLoggedIn) {
    return <Navigate to="/login" />;
  }

  return (
    <Layout>
      <Outlet />
      <Toaster richColors position="top-right" />
    </Layout>
  );
}

export const Route = createRootRoute({ component: Root });
