"use client";

import * as React from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, Search } from "lucide-react";

import { apiClient } from "@/lib/api/client";
import { PageContainer, PageHeader } from "@/components/layout/PagePrimitives";
import { ColumnSettingsGroup, DataTable } from "@/components/ui/datagrid";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomFieldManager } from "@/components/custom-fields/custom-field-manager";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CaseCustomFieldDefinition,
  CaseCustomFieldDefinitionSchema,
  FinanceCase,
  FinanceCaseDetail,
  FinanceCaseDetailSchema,
  FilterOptions,
  FilterOptionsSchema,
  PaginatedFinanceCaseListSchema,
  FinanceSummary,
  FinanceSummarySchema,
} from "@/lib/schemas";
import { cn } from "@/lib/utils";

type DatePreset = "all" | "today" | "week" | "30days" | "custom";
type FilterPanelKey = "requestTypes" | "statuses" | null;

type FilterState = {
  search: string;
  requestTypes: string[];
  statuses: string[];
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
  overdueOnly: boolean;
  needsActionOnly: boolean;
};

type FinancePatchPayload = {
  finance_status?: string;
  phone?: string;
  custom_fields?: Record<string, string>;
};

type InlineSaveResult =
  | { ok: true }
  | { ok: false; error: string };

const FILTER_STORAGE_KEY = "finance:overview-filters";
const EMPTY_VALUE = "__empty__";
const FINANCE_STATUS_OPTIONS = [
  "GRAY",
  "GREEN",
  "YELLOW",
  "RED",
  "PENDING",
  "PAID",
];
const FILTER_APPLY_DELAY_MS = 250;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_FILTERS: FilterState = {
  search: "",
  requestTypes: [],
  statuses: [],
  datePreset: "all",
  dateFrom: "",
  dateTo: "",
  overdueOnly: false,
  needsActionOnly: false,
};

function normalizeFilterArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function normalizeDatePreset(value: unknown): DatePreset {
  if (
    value === "today" ||
    value === "week" ||
    value === "30days" ||
    value === "custom"
  ) {
    return value;
  }
  return "all";
}

function readStoredFilters(): FilterState {
  if (typeof window === "undefined") {
    return DEFAULT_FILTERS;
  }

  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_FILTERS;
    }
    const parsed = JSON.parse(raw) as Partial<FilterState>;
    return {
      search: String(parsed.search ?? ""),
      requestTypes: normalizeFilterArray(parsed.requestTypes),
      statuses: normalizeFilterArray(parsed.statuses),
      datePreset: normalizeDatePreset(parsed.datePreset),
      dateFrom: String(parsed.dateFrom ?? ""),
      dateTo: String(parsed.dateTo ?? ""),
      overdueOnly: Boolean(parsed.overdueOnly),
      needsActionOnly: Boolean(parsed.needsActionOnly),
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function writeStoredFilters(filters: FilterState): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
}

function isoDate(daysAgo = 0): string {
  const value = new Date();
  value.setDate(value.getDate() - daysAgo);
  return value.toISOString().slice(0, 10);
}

function getResolvedDateRange(filters: FilterState): {
  dateFrom?: string;
  dateTo?: string;
} {
  if (filters.datePreset === "today") {
    const today = isoDate(0);
    return { dateFrom: today, dateTo: today };
  }
  if (filters.datePreset === "week") {
    return { dateFrom: isoDate(7), dateTo: isoDate(0) };
  }
  if (filters.datePreset === "30days") {
    return { dateFrom: isoDate(30), dateTo: isoDate(0) };
  }
  if (filters.datePreset === "custom" && filters.dateFrom && filters.dateTo) {
    return { dateFrom: filters.dateFrom, dateTo: filters.dateTo };
  }
  return {};
}

function buildFinancePath(
  filters: FilterState,
  pagination?: { pageIndex: number; pageSize: number },
): string {
  const params = new URLSearchParams();
  const search = filters.search.trim();
  if (search) {
    params.set("q", search);
  }
  for (const requestType of filters.requestTypes) {
    params.append("request_type", requestType);
  }
  for (const status of filters.statuses) {
    params.append("status", status);
  }

  const { dateFrom, dateTo } = getResolvedDateRange(filters);
  if (dateFrom && dateTo) {
    params.set("date_from", dateFrom);
    params.set("date_to", dateTo);
  }
  if (filters.overdueOnly) {
    params.set("overdue_only", "true");
  }
  if (filters.needsActionOnly) {
    params.set("needs_action_only", "true");
  }
  if (pagination) {
    params.set("limit", String(pagination.pageSize));
    params.set("offset", String(pagination.pageIndex * pagination.pageSize));
  }

  const query = params.toString();
  return query ? `/api/finance/cases?${query}` : "/api/finance/cases";
}

function summarizeSelection(
  values: string[],
  allOptions: string[],
  allLabel: string,
): string {
  if (!allOptions.length || values.length === 0 || values.length === allOptions.length) {
    return allLabel;
  }
  if (values.length === 1) {
    return values[0] ?? allLabel;
  }
  return `${values.length} selected`;
}

function resolveSelection(value: string[], options: string[]): string[] {
  if (!value.length) {
    return options;
  }
  return value.filter((entry) => options.includes(entry));
}

function displayText(value?: string | null, fallback = "-"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleDateString();
}

function normalizeEditableValue(value: string): string {
  return value.trim();
}

function buildInlineStateKey(caseId: string, fieldKey: string): string {
  return `${caseId}:${fieldKey}`;
}

function buildCustomFieldScopeKey(scope: string | null | undefined, name: string): string {
  return `${scope === "finance" ? "finance" : "case"}:${name}`;
}

function isFixedCaseField(name: string): boolean {
  return name.trim().toLowerCase() === "address";
}

function withFixedCaseFieldDefinitions(
  definitions: CaseCustomFieldDefinition[],
): CaseCustomFieldDefinition[] {
  const map = new Map<string, CaseCustomFieldDefinition>();

  for (const definition of definitions) {
    map.set(definition.name, definition);
  }

  map.set("address", {
    ...(map.get("address") ?? {}),
    name: "address",
    type: "Text",
    options: [],
    enabled: true,
    scope: "case",
  });

  return Array.from(map.values());
}

function formatMoney(value?: number | null, currency?: string | null): string {
  if (currency && currency.trim().length === 3) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.trim().toUpperCase(),
      maximumFractionDigits: 0,
    }).format(value ?? 0);
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function toFinanceSummary(detail: FinanceCaseDetail): FinanceCase {
  return {
    case_id: detail.case_id,
    title: detail.title,
    status: detail.status,
    request_type: detail.request_type,
    created_at: detail.created_at,
    updated_at: detail.updated_at,
    first_seen: detail.first_seen,
    days_since_update: detail.days_since_update,
    phone: detail.phone,
    contract_sum: detail.contract_sum,
    contract_amount: detail.contract_amount,
    paid_total: detail.paid_total,
    remaining: detail.remaining,
    due_date: detail.due_date,
    finance_status: detail.finance_status,
    payments_count: detail.payments_count,
    overdue_amount: detail.overdue_amount,
    currency: detail.currency,
    service_type: detail.service_type,
    custom_fields: detail.custom_fields,
  };
}

function FinanceAttentionPills({ item }: { item: FinanceCase }) {
  const tokens: Array<{ label: string; className: string }> = [];
  if ((item.overdue_amount ?? 0) > 0) {
    tokens.push({
      label: "Overdue",
      className: "bg-red-50 text-red-800 ring-red-200",
    });
  }
  if ((item.remaining ?? 0) > 0) {
    tokens.push({
      label: "Outstanding",
      className: "bg-amber-50 text-amber-900 ring-amber-200",
    });
  }

  if (!tokens.length) {
    return <span className="text-xs text-muted-foreground">Stable</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {tokens.map((token) => (
        <span
          key={token.label}
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
            token.className,
          )}
        >
          {token.label}
        </span>
      ))}
    </div>
  );
}

function MultiSelectFilter({
  label,
  allLabel,
  value,
  options,
  open,
  onToggle,
}: {
  label: string;
  allLabel: string;
  value: string[];
  options: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const selected = React.useMemo(
    () => resolveSelection(value, options),
    [options, value],
  );
  const hasActiveFilter =
    options.length > 0 && selected.length > 0 && selected.length < options.length;

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm transition-colors hover:bg-muted/40",
          open && "border-border/60 bg-muted/30",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {hasActiveFilter ? (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
          ) : null}
          <span className="truncate">
            {summarizeSelection(selected, options, allLabel)}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
    </div>
  );
}

function FilterOptionPanel({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (nextValue: string[]) => void;
}) {
  const [query, setQuery] = React.useState("");
  const selected = React.useMemo(
    () => resolveSelection(value, options),
    [options, value],
  );
  const visibleOptions = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return options;
    }
    return options.filter((option) =>
      option.toLowerCase().includes(normalizedQuery),
    );
  }, [options, query]);

  const toggleOption = React.useCallback(
    (option: string) => {
      const next = new Set(selected);
      if (next.has(option)) {
        next.delete(option);
      } else {
        next.add(option);
      }

      if (next.size === 0 || next.size === options.length) {
        onChange([]);
        return;
      }

      onChange(options.filter((entry) => next.has(entry)));
    },
    [onChange, options, selected],
  );

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-background/80 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[18rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}`}
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => onChange([])}
        >
          All
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => setQuery("")}
        >
          Reset search
        </Button>
      </div>

      {visibleOptions.length ? (
        <div className="flex flex-wrap gap-2">
          {visibleOptions.map((option) => {
            const active = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggleOption(option)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/40 text-foreground hover:bg-muted",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No matches.</p>
      )}
    </div>
  );
}

type InlineEditableInputProps = {
  value?: string | null;
  placeholder: string;
  onSave: (value: string) => Promise<InlineSaveResult>;
  isSaving?: boolean;
  error?: string | null;
};

function InlineEditableInput({
  value,
  placeholder,
  onSave,
  isSaving = false,
  error,
}: InlineEditableInputProps) {
  const [draft, setDraft] = React.useState(value ?? "");
  const skipBlurCommitRef = React.useRef(false);

  React.useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const commit = React.useCallback(async () => {
    const currentValue = value ?? "";
    const normalizedDraft = normalizeEditableValue(draft);
    const normalizedCurrent = normalizeEditableValue(currentValue);

    if (normalizedDraft === normalizedCurrent) {
      if (draft !== currentValue) {
        setDraft(currentValue);
      }
      return;
    }

    const result = await onSave(draft);
    if (!result.ok) {
      return;
    }
  }, [draft, onSave, value]);

  return (
    <div
      className="min-w-0 space-y-1"
      onClick={(event) => event.stopPropagation()}
    >
      <Input
        value={draft}
        placeholder={placeholder}
        disabled={isSaving}
        className={cn("h-8 text-xs", error && "border-destructive")}
        onChange={(event) => setDraft(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            skipBlurCommitRef.current = true;
            setDraft(value ?? "");
            event.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
          }
          void commit();
        }}
      />
      {isSaving ? (
        <p className="text-[10px] text-muted-foreground">Saving...</p>
      ) : error ? (
        <p className="text-[10px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

type InlineEditableSelectProps = {
  value?: string | null;
  placeholder: string;
  options: string[];
  onSave: (value: string) => Promise<InlineSaveResult>;
  isSaving?: boolean;
  error?: string | null;
};

function InlineEditableSelect({
  value,
  placeholder,
  options,
  onSave,
  isSaving = false,
  error,
}: InlineEditableSelectProps) {
  const normalizedValue = value?.trim() ? value : EMPTY_VALUE;

  return (
    <div
      className="min-w-0 space-y-1"
      onClick={(event) => event.stopPropagation()}
    >
      <Select
        value={normalizedValue}
        onValueChange={(nextValue) => {
          void onSave(nextValue === EMPTY_VALUE ? "" : nextValue);
        }}
        disabled={isSaving}
      >
        <SelectTrigger className={cn("h-8 w-full text-xs", error && "border-destructive")}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_VALUE}>Empty</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isSaving ? (
        <p className="text-[10px] text-muted-foreground">Saving...</p>
      ) : error ? (
        <p className="text-[10px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

export default function FinanceDashboardPage() {
  const [cases, setCases] = React.useState<FinanceCase[]>([]);
  const [totalRows, setTotalRows] = React.useState(0);
  const [filterOptions, setFilterOptions] = React.useState<FilterOptions>({
    request_types: [],
    statuses: [],
  });
  const [summary, setSummary] = React.useState<FinanceSummary | null>(null);
  const [fieldDefinitions, setFieldDefinitions] = React.useState<
    CaseCustomFieldDefinition[]
  >([]);
  const [draftFilters, setDraftFilters] = React.useState<FilterState>(
    () => readStoredFilters(),
  );
  const [appliedFilters, setAppliedFilters] = React.useState<FilterState>(
    () => readStoredFilters(),
  );
  const [openFilterPanel, setOpenFilterPanel] =
    React.useState<FilterPanelKey>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [inlineSaving, setInlineSaving] = React.useState<
    Record<string, boolean>
  >({});
  const [inlineErrors, setInlineErrors] = React.useState<
    Record<string, string>
  >({});
  const didInitFilterApply = React.useRef(false);

  const loadSummary = React.useCallback(async () => {
    const res = await apiClient.getParsed(
      "/api/finance/summary",
      FinanceSummarySchema,
    );
    if (!res.error && res.data) {
      setSummary(res.data);
    }
  }, []);

  const loadFieldDefinitions = React.useCallback(async () => {
    const res = await apiClient.getParsed(
      "/api/custom-fields",
      CaseCustomFieldDefinitionSchema.array(),
    );
    if (!res.error && res.data) {
      setFieldDefinitions(res.data);
    }
  }, []);

  const loadFilterOptions = React.useCallback(async () => {
    const res = await apiClient.getParsed(
      "/api/finance/filter-options",
      FilterOptionsSchema,
    );
    if (!res.error && res.data) {
      setFilterOptions(res.data);
    }
  }, []);

  const loadCases = React.useCallback(async (
    filters: FilterState,
    nextPagination: { pageIndex: number; pageSize: number },
  ) => {
    setIsLoading(true);
    const res = await apiClient.getParsed(
      buildFinancePath(filters, nextPagination),
      PaginatedFinanceCaseListSchema,
    );
    if (res.error) {
      setError(res.error);
      setCases([]);
      setTotalRows(0);
    } else if (res.data) {
      setError(null);
      setCases(res.data.items);
      setTotalRows(res.data.total);
    }
    setIsLoading(false);
  }, []);

  const refreshAll = React.useCallback(async () => {
    await Promise.all([
      loadSummary(),
      loadFilterOptions(),
      loadFieldDefinitions(),
      loadCases(appliedFilters, pagination),
    ]);
  }, [appliedFilters, loadCases, loadFieldDefinitions, loadFilterOptions, loadSummary, pagination]);

  React.useEffect(() => {
    void Promise.all([loadSummary(), loadFilterOptions(), loadFieldDefinitions()]);
  }, [loadFieldDefinitions, loadFilterOptions, loadSummary]);

  React.useEffect(() => {
    writeStoredFilters(appliedFilters);
    void loadCases(appliedFilters, pagination);
  }, [appliedFilters, loadCases, pagination]);

  React.useEffect(() => {
    if (!didInitFilterApply.current) {
      didInitFilterApply.current = true;
      return;
    }

    const timeout = window.setTimeout(() => {
      setPagination((current) => ({ ...current, pageIndex: 0 }));
      setAppliedFilters(draftFilters);
      writeStoredFilters(draftFilters);
    }, FILTER_APPLY_DELAY_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [draftFilters]);

  const fieldDefinitionsWithFixed = React.useMemo(
    () => withFixedCaseFieldDefinitions(fieldDefinitions),
    [fieldDefinitions],
  );
  const enabledFieldDefinitions = React.useMemo(
    () => fieldDefinitionsWithFixed.filter((definition) => definition.enabled),
    [fieldDefinitionsWithFixed],
  );
  const financeManagerDefinitions = React.useMemo(
    () =>
      fieldDefinitionsWithFixed.filter(
        (definition) => definition.scope === "finance",
      ),
    [fieldDefinitionsWithFixed],
  );
  const caseCustomFieldDefinitions = React.useMemo(
    () =>
      enabledFieldDefinitions.filter(
        (definition) => definition.scope !== "finance",
      ),
    [enabledFieldDefinitions],
  );
  const financeCustomFieldDefinitions = React.useMemo(
    () =>
      enabledFieldDefinitions.filter(
        (definition) => definition.scope === "finance",
      ),
    [enabledFieldDefinitions],
  );

  const requestTypes = React.useMemo(
    () => filterOptions.request_types,
    [filterOptions.request_types],
  );

  const statuses = React.useMemo(
    () => filterOptions.statuses,
    [filterOptions.statuses],
  );

  React.useEffect(() => {
    setDraftFilters((current) => ({
      ...current,
      requestTypes: current.requestTypes.filter((value) =>
        requestTypes.includes(value),
      ),
      statuses: current.statuses.filter((value) => statuses.includes(value)),
    }));
    setAppliedFilters((current) => ({
      ...current,
      requestTypes: current.requestTypes.filter((value) =>
        requestTypes.includes(value),
      ),
      statuses: current.statuses.filter((value) => statuses.includes(value)),
    }));
  }, [requestTypes, statuses]);

  const customFieldOptions = React.useMemo(() => {
    const optionsByField = new Map<string, string[]>();

    for (const definition of enabledFieldDefinitions) {
      const seen = new Set<string>();
      const merged: string[] = [];

      for (const option of definition.options) {
        const normalized = option.trim();
        if (!normalized || seen.has(normalized)) {
          continue;
        }
        seen.add(normalized);
        merged.push(normalized);
      }

      for (const item of cases) {
        const existingValue = String(
          item.custom_fields?.[definition.name] ?? "",
        ).trim();
        if (!existingValue || seen.has(existingValue)) {
          continue;
        }
        seen.add(existingValue);
        merged.push(existingValue);
      }

      optionsByField.set(
        buildCustomFieldScopeKey(definition.scope, definition.name),
        merged,
      );
    }

    return optionsByField;
  }, [cases, enabledFieldDefinitions]);

  const applyUpdatedCase = React.useCallback((detail: FinanceCaseDetail) => {
    const nextSummary = toFinanceSummary(detail);
    setCases((current) =>
      current.map((row) =>
        row.case_id === nextSummary.case_id ? nextSummary : row,
      ),
    );
  }, []);

  const saveFinancePatch = React.useCallback(
    async (
      caseId: string,
      payload: FinancePatchPayload,
    ): Promise<InlineSaveResult> => {
      const response = await apiClient.patch<unknown>(
        `/api/finance/cases/${encodeURIComponent(caseId)}/overview`,
        payload,
      );

      if (response.error || response.data == null) {
        return {
          ok: false,
          error: response.error ?? "Unable to save finance row.",
        };
      }

      const parsed = FinanceCaseDetailSchema.safeParse(response.data);
      if (!parsed.success) {
        return {
          ok: false,
          error: "Unexpected finance case response.",
        };
      }

      applyUpdatedCase(parsed.data);
      return { ok: true };
    },
    [applyUpdatedCase],
  );

  const handleInlineSave = React.useCallback(
    async (
      caseId: string,
      fieldKey: string,
      payload: FinancePatchPayload,
    ): Promise<InlineSaveResult> => {
      const key = buildInlineStateKey(caseId, fieldKey);
      setInlineSaving((current) => ({ ...current, [key]: true }));
      setInlineErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });

      const result = await saveFinancePatch(caseId, payload);

      setInlineSaving((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });

      if (!result.ok) {
        setInlineErrors((current) => ({
          ...current,
          [key]: result.error,
        }));
        return result;
      }

      setInlineErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return result;
    },
    [saveFinancePatch],
  );

  const handleImmediateFilterChange = React.useCallback(
    (patch: Partial<FilterState>) => {
      setDraftFilters((currentDraft) => {
        const nextFilters: FilterState = {
          ...currentDraft,
          ...patch,
          search: String(patch.search ?? currentDraft.search),
          requestTypes: resolveSelection(
            patch.requestTypes ?? currentDraft.requestTypes,
            requestTypes,
          ),
          statuses: resolveSelection(
            patch.statuses ?? currentDraft.statuses,
            statuses,
          ),
          datePreset: normalizeDatePreset(
            patch.datePreset ?? currentDraft.datePreset,
          ),
          dateFrom: String(patch.dateFrom ?? currentDraft.dateFrom),
          dateTo: String(patch.dateTo ?? currentDraft.dateTo),
          overdueOnly: Boolean(
            patch.overdueOnly ?? currentDraft.overdueOnly,
          ),
          needsActionOnly: Boolean(
            patch.needsActionOnly ?? currentDraft.needsActionOnly,
          ),
        };
        return nextFilters;
      });
    },
    [requestTypes, statuses],
  );

  const handleClearFilters = React.useCallback(() => {
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    writeStoredFilters(DEFAULT_FILTERS);
    setOpenFilterPanel(null);
  }, []);

  const baseCaseColumns = React.useMemo<ColumnDef<FinanceCase, unknown>[]>(
    () => [
      {
        id: "attention",
        accessorFn: (row) => (row.overdue_amount ?? 0) + (row.remaining ?? 0),
        header: "Attention",
        cell: ({ row }) => <FinanceAttentionPills item={row.original} />,
      },
      {
        accessorKey: "case_id",
        header: "Case ID",
        cell: ({ row }) => (
          <Link
            href={`/finance/cases/${row.original.case_id}`}
            className="text-xs font-semibold tracking-[0.08em] text-primary underline-offset-4 hover:underline"
          >
            {row.original.case_id}
          </Link>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => displayText(row.original.title, "Untitled case"),
      },
      {
        accessorKey: "request_type",
        header: "Request Type",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {displayText(row.original.request_type)}
          </span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: "updated_at",
        header: "Last Change",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(row.original.updated_at)}
          </span>
        ),
      },
      {
        accessorKey: "first_seen",
        header: "First Seen",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {displayText(row.original.first_seen)}
          </span>
        ),
      },
      {
        accessorKey: "days_since_update",
        header: "Days",
        cell: ({ row }) => {
          const days = row.original.days_since_update;
          return (
            <span className="text-xs text-muted-foreground">
              {typeof days === "number" ? days : "-"}
            </span>
          );
        },
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => {
          const item = row.original;
          const key = buildInlineStateKey(item.case_id, "phone");
          return (
            <InlineEditableInput
              value={item.phone}
              placeholder="Phone number"
              onSave={(nextValue) =>
                handleInlineSave(item.case_id, "phone", {
                  phone: normalizeEditableValue(nextValue),
                })
              }
              isSaving={Boolean(inlineSaving[key])}
              error={inlineErrors[key]}
            />
          );
        },
      },
      {
        id: "address",
        accessorFn: (row) => row.custom_fields?.address ?? "",
        header: "Address",
        enableHiding: false,
        meta: { className: "min-w-[16rem]" },
        cell: ({ row }) => {
          const item = row.original;
          const key = buildInlineStateKey(item.case_id, "case-custom:address");
          return (
            <InlineEditableInput
              value={item.custom_fields?.address ?? ""}
              placeholder="Address"
              onSave={(nextValue) =>
                handleInlineSave(item.case_id, "case-custom:address", {
                  custom_fields: {
                    address: normalizeEditableValue(nextValue),
                  },
                })
              }
              isSaving={Boolean(inlineSaving[key])}
              error={inlineErrors[key]}
            />
          );
        },
      },
    ],
    [handleInlineSave, inlineErrors, inlineSaving],
  );

  const caseCustomColumns = React.useMemo<ColumnDef<FinanceCase, unknown>[]>(
    () =>
      caseCustomFieldDefinitions
        .filter((definition) => !isFixedCaseField(definition.name))
        .map((definition) => ({
          id: `case-custom:${definition.name}`,
          accessorFn: (row) => row.custom_fields?.[definition.name] ?? "",
          header: definition.name,
          cell: ({ row }) => {
            const item = row.original;
            const fieldKey = `case-custom:${definition.name}`;
            const key = buildInlineStateKey(item.case_id, fieldKey);
            const value = item.custom_fields?.[definition.name] ?? "";
            const options =
              customFieldOptions.get(
                buildCustomFieldScopeKey(definition.scope, definition.name),
              ) ?? [];

            if (
              definition.type.toLowerCase() === "dropdown" &&
              options.length
            ) {
              return (
                <InlineEditableSelect
                  value={value}
                  placeholder={definition.name}
                  options={options}
                  onSave={(nextValue) =>
                    handleInlineSave(item.case_id, fieldKey, {
                      custom_fields: {
                        [definition.name]: normalizeEditableValue(nextValue),
                      },
                    })
                  }
                  isSaving={Boolean(inlineSaving[key])}
                  error={inlineErrors[key]}
                />
              );
            }

            return (
              <InlineEditableInput
                value={value}
                placeholder={definition.name}
                onSave={(nextValue) =>
                  handleInlineSave(item.case_id, fieldKey, {
                    custom_fields: {
                      [definition.name]: normalizeEditableValue(nextValue),
                    },
                  })
                }
                isSaving={Boolean(inlineSaving[key])}
                error={inlineErrors[key]}
              />
            );
          },
        })),
    [
      caseCustomFieldDefinitions,
      customFieldOptions,
      handleInlineSave,
      inlineErrors,
      inlineSaving,
    ],
  );

  const financeColumns = React.useMemo<ColumnDef<FinanceCase, unknown>[]>(
    () => [
      {
        accessorKey: "contract_sum",
        header: "Contract",
        cell: ({ row }) =>
          formatMoney(row.original.contract_sum, row.original.currency),
      },
      {
        accessorKey: "paid_total",
        header: "Paid",
        cell: ({ row }) =>
          formatMoney(row.original.paid_total, row.original.currency),
      },
      {
        accessorKey: "remaining",
        header: "Remaining",
        cell: ({ row }) =>
          formatMoney(row.original.remaining, row.original.currency),
      },
      {
        accessorKey: "overdue_amount",
        header: "Overdue",
        cell: ({ row }) =>
          formatMoney(row.original.overdue_amount, row.original.currency),
      },
      {
        accessorKey: "due_date",
        header: "Due Date",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(row.original.due_date)}
          </span>
        ),
      },
      {
        accessorKey: "finance_status",
        header: "Finance Status",
        cell: ({ row }) => {
          const item = row.original;
          const key = buildInlineStateKey(item.case_id, "finance_status");
          return (
            <InlineEditableSelect
              value={item.finance_status}
              placeholder="Finance status"
              options={FINANCE_STATUS_OPTIONS}
              onSave={(nextValue) =>
                handleInlineSave(item.case_id, "finance_status", {
                  finance_status: normalizeEditableValue(nextValue),
                })
              }
              isSaving={Boolean(inlineSaving[key])}
              error={inlineErrors[key]}
            />
          );
        },
      },
      {
        accessorKey: "payments_count",
        header: "Payments",
        cell: ({ row }) => row.original.payments_count ?? 0,
      },
      {
        accessorKey: "service_type",
        header: "Finance Service",
        cell: ({ row }) => displayText(row.original.service_type),
      },
    ],
    [handleInlineSave, inlineErrors, inlineSaving],
  );

  const financeCustomColumns = React.useMemo<ColumnDef<FinanceCase, unknown>[]>(
    () =>
      financeCustomFieldDefinitions.map((definition) => ({
        id: `finance-custom:${definition.name}`,
        accessorFn: (row) => row.custom_fields?.[definition.name] ?? "",
        header: definition.name,
        cell: ({ row }) => {
          const item = row.original;
          const fieldKey = `finance-custom:${definition.name}`;
          const key = buildInlineStateKey(item.case_id, fieldKey);
          const value = item.custom_fields?.[definition.name] ?? "";
          const options =
            customFieldOptions.get(
              buildCustomFieldScopeKey(definition.scope, definition.name),
            ) ?? [];

          if (
            definition.type.toLowerCase() === "dropdown" &&
            options.length
          ) {
            return (
              <InlineEditableSelect
                value={value}
                placeholder={definition.name}
                options={options}
                onSave={(nextValue) =>
                  handleInlineSave(item.case_id, fieldKey, {
                    custom_fields: {
                      [definition.name]: normalizeEditableValue(nextValue),
                    },
                  })
                }
                isSaving={Boolean(inlineSaving[key])}
                error={inlineErrors[key]}
              />
            );
          }

          return (
            <InlineEditableInput
              value={value}
              placeholder={definition.name}
              onSave={(nextValue) =>
                handleInlineSave(item.case_id, fieldKey, {
                  custom_fields: {
                    [definition.name]: normalizeEditableValue(nextValue),
                  },
                })
              }
              isSaving={Boolean(inlineSaving[key])}
              error={inlineErrors[key]}
            />
          );
        },
      })),
    [
      customFieldOptions,
      financeCustomFieldDefinitions,
      handleInlineSave,
      inlineErrors,
      inlineSaving,
    ],
  );

  const columns = React.useMemo<ColumnDef<FinanceCase, unknown>[]>(
    () => [
      ...baseCaseColumns,
      ...caseCustomColumns,
      ...financeColumns,
      ...financeCustomColumns,
    ],
    [baseCaseColumns, caseCustomColumns, financeColumns, financeCustomColumns],
  );

  const columnGroups = React.useMemo<ColumnSettingsGroup[]>(
    () => [
      {
        id: "case",
        title: "Case Columns",
        description:
          "Case status, request context, timeline details, and case-scoped custom fields.",
        columnIds: [
          "attention",
          "case_id",
          "status",
          "title",
          "request_type",
          "created_at",
          "updated_at",
          "first_seen",
          "days_since_update",
          "phone",
          "address",
          ...caseCustomFieldDefinitions
            .filter((definition) => !isFixedCaseField(definition.name))
            .map((definition) => `case-custom:${definition.name}`),
        ],
      },
      {
        id: "finance",
        title: "Finance Columns",
        description:
          "Money, due dates, finance workflow state, and finance-scoped custom fields.",
        columnIds: [
          "contract_sum",
          "paid_total",
          "remaining",
          "overdue_amount",
          "due_date",
          "finance_status",
          "payments_count",
          "service_type",
          ...financeCustomFieldDefinitions.map(
            (definition) => `finance-custom:${definition.name}`,
          ),
        ],
      },
    ],
    [caseCustomFieldDefinitions, financeCustomFieldDefinitions],
  );

  const content = (() => {
    if (isLoading && !cases.length) {
      return <LoadingState label="Loading finance overview..." />;
    }

    if (error) {
      return <ErrorState message={error} onRetry={refreshAll} />;
    }

    if (!cases.length) {
      return (
        <EmptyState
          title="No finance cases match the current filters."
          description="Adjust the filters or clear them to bring finance cases back into the table."
        >
          <Button variant="outline" size="sm" onClick={handleClearFilters}>
            Clear filters
          </Button>
        </EmptyState>
      );
    }

    return (
      <DataTable
        id="finance"
        columns={columns}
        columnGroups={columnGroups}
        data={cases}
        initialPageSize={DEFAULT_PAGE_SIZE}
        manualPagination
        pageIndex={pagination.pageIndex}
        pageSize={pagination.pageSize}
        totalRows={totalRows}
        onPaginationChange={setPagination}
      />
    );
  })();

  return (
    <>
      <PageHeader
        title="Finance"
        description="Case context plus finance tracking in one working table."
      />

      <PageContainer className="gap-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Cases In View"
            value={String(cases.length)}
            hint="Filtered finance workspace"
          />
          <StatCard
            label="Contract Total"
            value={formatMoney(summary?.contract_total)}
            hint="All finance cases"
          />
          <StatCard
            label="Paid Total"
            value={formatMoney(summary?.paid_total)}
            hint="All finance cases"
          />
          <StatCard
            label="Outstanding"
            value={formatMoney(summary?.outstanding_total)}
            hint="All finance cases"
          />
          <StatCard
            label="Needs Action"
            value={String(summary?.needs_action_count ?? 0)}
            hint="Outstanding cases with due dates"
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-border/60 bg-muted/60 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="finance-search">Search</Label>
              <Input
                id="finance-search"
                placeholder="Search case IDs, titles, names, phones, or finance text"
                value={draftFilters.search}
                onChange={(event) =>
                  handleImmediateFilterChange({ search: event.target.value })
                }
              />
            </div>

            <MultiSelectFilter
              label="Request Type"
              allLabel="All request types"
              options={requestTypes}
              value={draftFilters.requestTypes}
              open={openFilterPanel === "requestTypes"}
              onToggle={() =>
                setOpenFilterPanel((current) =>
                  current === "requestTypes" ? null : "requestTypes",
                )
              }
            />

            <MultiSelectFilter
              label="Status"
              allLabel="All statuses"
              options={statuses}
              value={draftFilters.statuses}
              open={openFilterPanel === "statuses"}
              onToggle={() =>
                setOpenFilterPanel((current) =>
                  current === "statuses" ? null : "statuses",
                )
              }
            />

            <div className="space-y-1.5">
              <Label>Date Range</Label>
              <Select
                value={draftFilters.datePreset}
                onValueChange={(value) =>
                  handleImmediateFilterChange({
                    datePreset: normalizeDatePreset(value),
                    dateFrom:
                      normalizeDatePreset(value) === "custom"
                        ? draftFilters.dateFrom
                        : "",
                    dateTo:
                      normalizeDatePreset(value) === "custom"
                        ? draftFilters.dateTo
                        : "",
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <div className="flex min-w-0 items-center gap-2">
                    {draftFilters.datePreset !== "all" ? (
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                    ) : null}
                    <SelectValue placeholder="All time" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This week</SelectItem>
                  <SelectItem value="30days">Last 30 days</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={handleClearFilters}
              >
                Clear all
              </Button>
            </div>
          </div>

          {openFilterPanel === "requestTypes" ? (
            <FilterOptionPanel
              label="Request Type"
              options={requestTypes}
              value={draftFilters.requestTypes}
              onChange={(value) =>
                handleImmediateFilterChange({ requestTypes: value })
              }
            />
          ) : null}

          {openFilterPanel === "statuses" ? (
            <FilterOptionPanel
              label="Status"
              options={statuses}
              value={draftFilters.statuses}
              onChange={(value) =>
                handleImmediateFilterChange({ statuses: value })
              }
            />
          ) : null}

          {draftFilters.datePreset === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="finance-date-from">From</Label>
                <Input
                  id="finance-date-from"
                  type="date"
                  value={draftFilters.dateFrom}
                  onChange={(event) =>
                    handleImmediateFilterChange({
                      dateFrom: event.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="finance-date-to">To</Label>
                <Input
                  id="finance-date-to"
                  type="date"
                  value={draftFilters.dateTo}
                  onChange={(event) =>
                    handleImmediateFilterChange({
                      dateTo: event.target.value,
                    })
                  }
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={draftFilters.overdueOnly ? "default" : "outline"}
              onClick={() =>
                handleImmediateFilterChange({
                  overdueOnly: !draftFilters.overdueOnly,
                })
              }
            >
              Overdue only
            </Button>
            <Button
              type="button"
              size="sm"
              variant={draftFilters.needsActionOnly ? "default" : "outline"}
              onClick={() =>
                handleImmediateFilterChange({
                  needsActionOnly: !draftFilters.needsActionOnly,
                })
              }
            >
              Needs action only
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Finance overview shows case columns plus finance columns. Inline
            edits update finance status, phone, and enabled custom fields in the
            shared DB.
          </p>
          <p>{cases.length} visible</p>
        </div>

        <div className="flex-1">{content}</div>

        <CustomFieldManager
          scope="finance"
          title="Finance Custom Fields"
          description="Create and manage finance-scoped fields. Finance overview still includes the case-scoped custom fields as context."
          fields={financeManagerDefinitions}
          onChanged={refreshAll}
        />
      </PageContainer>
    </>
  );
}
