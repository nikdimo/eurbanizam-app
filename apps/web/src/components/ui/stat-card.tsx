export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex min-h-[110px] flex-1 flex-col justify-between rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <span className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </span>
      {hint ? (
        <span className="mt-1 text-[11px] text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  );
}


