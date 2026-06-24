import { createRootRoute, Outlet, redirect } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { useAuthStore } from "@/lib/auth-store";
import { Layout } from "@/components/Layout";

function Root() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn());

  if (!isLoggedIn) {
    return (
      <>
        <Outlet />
        <Toaster richColors position="top-right" />
      </>
    );
  }

  return (
    <Layout>
      <Outlet />
      <Toaster richColors position="top-right" />
    </Layout>
  );
}

export const Route = createRootRoute({
  component: Root,
  beforeLoad: ({ location }) => {
    const isLoggedIn = useAuthStore.getState().isLoggedIn();
    if (!isLoggedIn && location.pathname !== "/login") {
      throw redirect({ to: "/login" });
    }
    if (isLoggedIn && location.pathname === "/login") {
      throw redirect({ to: "/" });
    }
  },
});
