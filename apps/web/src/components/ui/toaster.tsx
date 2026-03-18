"use client"

import * as React from "react"

import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto overflow-hidden rounded-xl border bg-background shadow-lg",
            t.variant === "destructive"
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-border",
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              {t.title ? (
                <p className="text-sm font-semibold leading-5">{t.title}</p>
              ) : null}
              {t.description ? (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

