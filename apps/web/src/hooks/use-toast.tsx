"use client"

import * as React from "react"

type ToastVariant = "default" | "destructive"

export type ToastInput = {
  title?: string
  description?: string
  variant?: ToastVariant
  durationMs?: number
}

type ToastItem = ToastInput & {
  id: string
  createdAt: number
}

type ToastContextValue = {
  toasts: ToastItem[]
  toast: (input: ToastInput) => void
  dismiss: (id: string) => void
  clear: () => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const clear = React.useCallback(() => {
    setToasts([])
  }, [])

  const toast = React.useCallback(
    (input: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const item: ToastItem = {
        id,
        createdAt: Date.now(),
        durationMs: input.durationMs ?? 4000,
        variant: input.variant ?? "default",
        title: input.title,
        description: input.description,
      }
      setToasts((current) => [item, ...current].slice(0, 5))

      window.setTimeout(() => {
        dismiss(id)
      }, item.durationMs)
    },
    [dismiss],
  )

  const value = React.useMemo(
    () => ({ toasts, toast, dismiss, clear }),
    [clear, dismiss, toast, toasts],
  )

  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>.")
  }
  return ctx
}

