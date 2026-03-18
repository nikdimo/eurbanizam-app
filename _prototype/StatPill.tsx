import React from "react";
import { cn } from "@/lib/utils";

export function StatPill({
  label,
  value,
  className,
}: {
  label: string;
  value: string | React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-semibold tracking-tight text-foreground">{value}</span>
    </div>
  );
}
