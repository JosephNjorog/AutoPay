import { Outlet } from "@tanstack/react-router";

export function AppShell() {
  return (
    <div className="min-h-screen bg-linen max-w-[390px] mx-auto relative overflow-x-hidden">
      <Outlet />
    </div>
  );
}
