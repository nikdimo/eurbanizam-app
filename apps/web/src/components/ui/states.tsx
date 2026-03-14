import { cn } from "@/lib/utils";

export function EmptyState({
  title = "Nothing to show yet",
  description,
  children,
}: {
  title?: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
      <p className="font-medium text-foreground/90">{title}</p>
      {description ? <p className="max-w-md">{description}</p> : null}
      {children ? <div className="mt-3 flex gap-2">{children}</div> : null}
    </div>
  );
}

export function LoadingState({
  label = "Loading data…",
}: {
  label?: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function ErrorState({
  message = "Something went wrong.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center text-sm text-red-600">
      <p className="font-medium">Unable to load data</p>
      <p className="max-w-md text-xs text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "inline-flex items-center justify-center rounded-md border border-transparent bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm transition-colors hover:bg-red-100",
          )}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, idx) => (
        <tr key={idx} className="animate-pulse border-b last:border-b-0">
          <td className="px-3 py-2" colSpan={12}>
            <div className="h-5 w-full rounded bg-muted" />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

