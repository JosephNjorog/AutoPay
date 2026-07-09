import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DesktopSidebar } from "@/components/DesktopSidebar";

export interface PageFrameProps {
  children: ReactNode;
  /** Show the persistent desktop nav — true for authenticated app pages,
   * false for public share-link pages (pay, claim, track) that may be
   * opened by someone without an account. */
  sidebar: boolean;
  /** "narrow" for step-by-step wizards, "wide" for browse/list pages. */
  maxWidth?: "narrow" | "wide";
  className?: string;
}

export function PageFrame({ children, sidebar, maxWidth = "narrow", className = "" }: PageFrameProps) {
  return (
    <div className="min-h-screen w-full">
      {/* Desktop */}
      <div className={cn("hidden md:block min-h-screen bg-auth-gradient", sidebar && "md:pl-60")}>
        {sidebar && <DesktopSidebar variant="neutral" />}
        <div className="flex min-h-screen items-center justify-center p-10">
          <div
            className={cn(
              "w-full bg-card border border-border rounded-3xl shadow-sm overflow-hidden",
              maxWidth === "wide" ? "max-w-4xl" : "max-w-md"
            )}
          >
            <div className={cn("max-h-[85vh] overflow-y-auto", className)}>{children}</div>
          </div>
        </div>
      </div>

      {/* Mobile native */}
      <div className={cn("md:hidden min-h-screen", className)}>{children}</div>
    </div>
  );
}
