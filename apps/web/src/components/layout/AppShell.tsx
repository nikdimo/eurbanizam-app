"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/cases", label: "Cases" },
  { href: "/finance", label: "Finance" },
  { href: "/settings", label: "Settings" },
  { href: "/help", label: "Help" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isCases = pathname.startsWith("/cases");
  const isFinance = pathname.startsWith("/finance");
  const isFinanceCaseDetail = pathname.startsWith("/finance/cases/");

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-muted text-foreground">
      <header className="sticky top-0 z-20 grid h-9 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border/60 bg-background/95 px-3 backdrop-blur-sm">
        <div className="justify-self-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          eurbanizam
        </div>

        <nav className="flex items-center justify-center gap-0.5">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex h-6 items-center justify-self-end gap-1.5">
          <span className="text-[10px] text-muted-foreground">Admin</span>
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
            EA
          </div>
        </div>
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto bg-muted">
        <div
          className={cn(
            "mx-auto flex h-full min-w-0 flex-col gap-4 px-4 py-6",
            isFinanceCaseDetail
              ? "w-full max-w-none px-0 py-0"
              : isCases || isFinance
                ? "w-full max-w-none"
                : "max-w-6xl",
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
