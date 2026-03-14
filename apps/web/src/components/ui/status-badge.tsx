import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-amber-50 text-amber-800 ring-amber-200",
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  closed: "bg-slate-100 text-slate-700 ring-slate-200",
  overdue: "bg-red-50 text-red-700 ring-red-200",
};

export function StatusBadge({
  status,
}: {
  status: string | null | undefined;
}) {
  if (!status) return null;
  const key = status.toLowerCase();
  const color = STATUS_COLORS[key] ?? "bg-slate-100 text-slate-700";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        color,
      )}
    >
      {status}
    </span>
  );
}

