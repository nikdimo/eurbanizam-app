"use client"

import { cn } from "@/lib/utils"

export type StatusVariant =
  | "GRAY"
  | "GREEN"
  | "YELLOW"
  | "RED"
  | "PENDING"
  | "PAID"
  | "DRAFT"
  | "SENT"
  | "CANCELLED"

export function StatusBadge({
  status,
  className,
}: {
  status: StatusVariant | string
  className?: string
}) {
  const normalized = String(status).toUpperCase()

  let bg = "bg-gray-100 text-gray-700 border-gray-200"

  if (normalized === "GREEN" || normalized === "PAID") {
    bg = "bg-emerald-100 text-emerald-800 border-emerald-200"
  } else if (normalized === "YELLOW" || normalized === "PENDING") {
    bg = "bg-amber-100 text-amber-800 border-amber-200"
  } else if (normalized === "RED" || normalized === "CANCELLED") {
    bg = "bg-red-100 text-red-800 border-red-200"
  } else if (normalized === "SENT") {
    bg = "bg-blue-100 text-blue-800 border-blue-200"
  }

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
        bg,
        className,
      )}
    >
      {status}
    </span>
  )
}

