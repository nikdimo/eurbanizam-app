"use client"

import React from "react"

import { cn } from "@/lib/utils"

export function StatPill({
  label,
  value,
  className,
}: {
  label: string
  value: string | React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("px-3 py-2", className)}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}

