import * as React from "react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";

const navItems = [
  { href: "/cases", label: "Cases" },
  { href: "/", label: "Finance" },
  { href: "/help", label: "Help" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-muted/30 text-foreground">
      <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background/95 px-4 backdrop-blur-sm">
        <nav className="flex items-center gap-1">
          <span className="mr-4 text-xs font-bold uppercase tracking-widest text-primary">
            eurbanizam
          </span>
          {navItems.map((item) => {
            const active = item.href === "/" ? location === "/" : location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex h-8 items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Admin User</span>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm">
            AU
          </div>
        </div>
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex h-full min-w-0 flex-col gap-4">
          {children}
        </div>
      </main>
    </div>
  );
}
