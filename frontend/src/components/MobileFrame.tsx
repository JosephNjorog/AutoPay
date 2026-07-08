import type { ReactNode } from "react";

export function MobileFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      {/* Desktop chrome */}
      <div className="hidden md:flex min-h-screen items-center justify-center p-8" style={{ background: "var(--gradient-mesh)" }}>
        <div className="relative">
          <div className="absolute -inset-6 rounded-[3rem] opacity-30 blur-3xl" style={{ background: "var(--gradient-portfolio)" }} />
          <div className="relative w-[400px] h-[860px] rounded-[3rem] border-[10px] border-foreground/90 bg-background overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-foreground/90 rounded-b-2xl z-50" />
            <div className={`relative h-full overflow-y-auto overflow-x-hidden ${className}`}>
              {children}
            </div>
          </div>
          <p className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            AutoPayKe · phone-first money
          </p>
        </div>
      </div>
      {/* Mobile native */}
      <div className={`md:hidden min-h-screen ${className}`}>{children}</div>
    </div>
  );
}
