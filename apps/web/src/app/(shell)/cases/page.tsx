"use client";

import * as React from "react";
import { ColumnDef, SortingState } from "@tanstack/react-table";
import { ChevronDown, Search, X } from "lucide-react";

import { apiClient } from "@/lib/api/client";
import { PageContainer } from "@/components/layout/PagePrimitives";
import { DataTable } from "@/components/ui/datagrid";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { CustomFieldManager } from "@/components/custom-fields/custom-field-manager";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SkeletonRows,
} from "@/components/ui/states";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Case,
  CaseCustomFieldDefinition,
  CaseCustomFieldDefinitionSchema,
  CaseDetail,
  CaseDetailSchema,
  FilterOptions,
  FilterOptionsSchema,
  PaginatedCaseListSchema,
} from "@/lib/schemas";
import { cn } from "@/lib/utils";

type DatePreset = "all" | "today" | "week" | "30days" | "custom";
type FilterSelection = string[] | null;

type FilterState = {
  search: string;
  requestTypes: FilterSelection;
  statuses: FilterSelection;
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
};

type EditableCase = {
  title: string;
  status: string;
  request_type: string;
  phone: string;
  custom_fields: Record<string, string>;
};

type NewCaseFinanceDraft = {
  service_type: string;
  contract_sum: string;
  currency: string;
  paid_amount: string;
  notes: string;
};

const emptyNewCaseFinance = (): NewCaseFinanceDraft => ({
  service_type: "",
  contract_sum: "",
  currency: "MKD",
  paid_amount: "",
  notes: "",
});

type NewCaseDraft = {
  title: string;
  phone: string;
  custom_fields: Record<string, string>;
  finance: NewCaseFinanceDraft;
};

type CasePatchPayload = Partial<
  Pick<EditableCase, "title" | "status" | "request_type" | "phone">
> & {
  custom_fields?: Record<string, string>;
};

type InlineSaveResult =
  | { ok: true }
  | { ok: false; error: string };

type PersistedFilterSettings = {
  last_request_type_selection?: unknown;
  last_status_selection?: unknown;
  last_date_range?: {
    preset?: unknown;
    start?: unknown;
    end?: unknown;
  } | null;
  last_search_text?: unknown;
  raw?: PersistedFilterSettings;
};

const FILTER_STORAGE_KEY = "cases:working-table-filters";
const EMPTY_VALUE = "__empty__";
/** Single client name: case custom field + finance_cases.client_name stay in sync. */
const CASE_CLIENT_NAME_FIELD = "Name / Last name";
const CASE_EMAIL_FIELD = "email";
const CASE_ALT_EMAILS_FIELD = "alternate_emails";
const RECENT_DAYS = 7;
const STALE_DAYS = 20;
const FILTER_APPLY_DELAY_MS = 250;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_FILTERS: FilterState = {
  search: "",
  requestTypes: null,
  statuses: null,
  datePreset: "all",
  dateFrom: "",
  dateTo: "",
};

function normalizeFilterArray(value: unknown): FilterSelection {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((entry) => String(entry ?? "").trim())
          .filter(Boolean),
      ),
    );
  }

  const legacyValue = String(value ?? "").trim();
  if (!legacyValue || legacyValue === "all") {
    return null;
  }

  return [legacyValue];
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
    const parsed = JSON.parse(raw) as Partial<FilterState> & {
      requestType?: unknown;
      status?: unknown;
    };
    return {
      search: String(parsed.search ?? ""),
      requestTypes: normalizeFilterArray(
        parsed.requestTypes ?? parsed.requestType,
      ),
      statuses: normalizeFilterArray(parsed.statuses ?? parsed.status),
      datePreset: normalizeDatePreset(parsed.datePreset),
      dateFrom: String(parsed.dateFrom ?? ""),
      dateTo: String(parsed.dateTo ?? ""),
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

function normalizeFiltersFromSettings(
  payload?: PersistedFilterSettings | null,
): FilterState {
  const source = payload?.raw ?? payload;
  const dateRange = source?.last_date_range ?? null;
  return {
    search: String(source?.last_search_text ?? ""),
    requestTypes: normalizePersistedFilterArray(
      source?.last_request_type_selection,
    ),
    statuses: normalizePersistedFilterArray(source?.last_status_selection),
    datePreset: normalizeDatePreset(dateRange?.preset),
    dateFrom: String(dateRange?.start ?? ""),
    dateTo: String(dateRange?.end ?? ""),
  };
}

function normalizeDatePreset(value: unknown): DatePreset {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "today") {
    return "today";
  }
  if (normalized === "week" || normalized === "this week") {
    return "week";
  }
  if (normalized === "30days" || normalized === "last 30 days") {
    return "30days";
  }
  if (normalized === "custom") {
    return "custom";
  }
  return "all";
}

function normalizePersistedFilterArray(value: unknown): FilterSelection {
  const normalized = normalizeFilterArray(value);
  if (normalized === null || normalized.length === 0) {
    return null;
  }
  return normalized;
}

function serializePersistedFilterArray(value: FilterSelection): string[] {
  return value ?? [];
}

function clampSelectionToOptions(
  value: FilterSelection,
  options: string[],
  optionsReady: boolean,
): FilterSelection {
  if (!optionsReady || value === null) {
    return value;
  }
  if (value.length === 0) {
    return [];
  }
  if (options.length === 0) {
    return null;
  }

  const next = value.filter((entry) => options.includes(entry));
  if (next.length === 0 || next.length === options.length) {
    return null;
  }
  return next;
}

function reconcileFiltersWithOptions(
  filters: FilterState,
  requestTypes: string[],
  statuses: string[],
  optionsReady: boolean,
): FilterState {
  return {
    ...filters,
    requestTypes: clampSelectionToOptions(
      filters.requestTypes,
      requestTypes,
      optionsReady,
    ),
    statuses: clampSelectionToOptions(
      filters.statuses,
      statuses,
      optionsReady,
    ),
  };
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

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleString();
}

function displayText(value?: string | null, fallback = "-"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeEditableValue(value: string): string {
  return value.trim();
}

function buildInlineStateKey(
  caseId: string,
  field: string,
): string {
  return `${caseId}:${field}`;
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
    return {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    };
  }
  return {};
}

const CASE_SORT_COLUMN_MAP: Record<string, string> = {
  first_seen: "First Seen",
  days_since_update: "Denovi (Od Posledna)",
};

function buildCasesQuery(
  filters: FilterState,
  pagination?: { pageIndex: number; pageSize: number },
  sorting?: SortingState,
): {
  q?: string;
  request_type: string[];
  status: string[];
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_desc?: boolean;
} {
  const { dateFrom, dateTo } = getResolvedDateRange(filters);
  const firstSort = sorting?.[0];
  const sortBy =
    firstSort != null
      ? CASE_SORT_COLUMN_MAP[firstSort.id] ?? firstSort.id
      : undefined;
  const sortDesc = firstSort?.desc ?? true;

  return {
    q: filters.search.trim() || undefined,
    request_type: filters.requestTypes ?? [],
    status: filters.statuses ?? [],
    date_from: dateFrom,
    date_to: dateTo,
    limit: pagination?.pageSize,
    offset: pagination ? pagination.pageIndex * pagination.pageSize : undefined,
    sort_by: sortBy,
    sort_desc: sortDesc,
  };
}

function summarizeSelection(
  values: FilterSelection,
  allOptions: string[],
  allLabel: string,
): string {
  if (!allOptions.length || values === null || values.length === allOptions.length) {
    return allLabel;
  }
  if (values.length === 0) {
    return "None selected";
  }
  if (values.length === 1) {
    return values[0] ?? allLabel;
  }
  return `${values.length} selected`;
}

function resolveSelection(
  value: FilterSelection,
  options: string[],
): FilterSelection {
  if (value === null) {
    return null;
  }
  return value.filter((entry) => options.includes(entry));
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
  value: FilterSelection;
  options: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const selected = React.useMemo(
    () => resolveSelection(value, options) ?? options,
    [options, value],
  );
  const hasActiveFilter =
    options.length > 0 &&
    value !== null &&
    value.length !== options.length;

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
  value: FilterSelection;
  onChange: (nextValue: FilterSelection) => void;
}) {
  const [query, setQuery] = React.useState("");
  const selected = React.useMemo(
    () => resolveSelection(value, options) ?? options,
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

      if (next.size === 0) {
        onChange([]);
        return;
      }

      if (next.size === options.length) {
        onChange(options);
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
          onClick={() => onChange(options)}
        >
          Select all
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => onChange([])}
        >
          Deselect all
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

function isRecentDate(value?: string | null, days = RECENT_DAYS): boolean {
  if (!value) {
    return false;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return parsed >= cutoff;
}

function getAttentionFlags(item: Case): {
  isNew: boolean;
  isUpdated: boolean;
  isStale: boolean;
} {
  return {
    isNew: isRecentDate(item.created_at),
    isUpdated: isRecentDate(item.updated_at),
    isStale:
      typeof item.days_since_update === "number" &&
      item.days_since_update >= STALE_DAYS,
  };
}

function getAttentionPriority(item: Case): number {
  const { isNew, isUpdated, isStale } = getAttentionFlags(item);
  if (isStale) {
    return 3;
  }
  if (isUpdated) {
    return 2;
  }
  if (isNew) {
    return 1;
  }
  return 0;
}

function attentionTokens(item: Case): Array<{
  label: string;
  className: string;
}> {
  const { isNew, isUpdated, isStale } = getAttentionFlags(item);
  const out: Array<{ label: string; className: string }> = [];
  if (isNew) {
    out.push({
      label: "New",
      className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    });
  }
  if (isUpdated) {
    out.push({
      label: "Moved",
      className: "bg-sky-50 text-sky-800 ring-sky-200",
    });
  }
  if (isStale) {
    out.push({
      label: "Stale",
      className: "bg-amber-50 text-amber-900 ring-amber-200",
    });
  }
  return out;
}

function toCaseSummary(detail: CaseDetail): Case {
  return {
    case_id: detail.case_id,
    title: detail.title,
    status: detail.status,
    request_type: detail.request_type,
    created_at: detail.created_at,
    updated_at: detail.updated_at,
    prev_change_at: detail.prev_change_at,
    first_seen: detail.first_seen,
    days_since_update: detail.days_since_update,
    phone: detail.phone,
    latest_document_name: detail.latest_document_name,
    custom_fields: detail.custom_fields,
  };
}

function makeFallbackFieldDefinition(name: string): CaseCustomFieldDefinition {
  return {
    name,
    type: "Text",
    options: [],
    enabled: true,
    scope: "case",
  };
}

function isFixedCaseField(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    normalized === "address" ||
    normalized === "email" ||
    normalized === "alternate_emails" ||
    normalized === "name / last name"
  );
}

function withFixedCaseFieldDefinitions(
  definitions: CaseCustomFieldDefinition[],
): CaseCustomFieldDefinition[] {
  const map = new Map<string, CaseCustomFieldDefinition>();

  for (const definition of definitions) {
    map.set(definition.name, definition);
  }

  const fixedAddress = makeFallbackFieldDefinition("address");
  map.set("address", {
    ...(map.get("address") ?? {}),
    ...fixedAddress,
    enabled: true,
  });

  const fixedEmail = makeFallbackFieldDefinition("email");
  map.set("email", {
    ...(map.get("email") ?? {}),
    ...fixedEmail,
    enabled: true,
  });

  const fixedAltEmails = makeFallbackFieldDefinition("alternate_emails");
  map.set("alternate_emails", {
    ...(map.get("alternate_emails") ?? {}),
    ...fixedAltEmails,
    enabled: true,
  });

  return Array.from(map.values());
}

function getCaseFieldLabel(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (normalized === "address") {
    return "Address";
  }
  if (normalized === "email") {
    return "Email";
  }
  if (normalized === "name / last name") {
    return "Client Name";
  }
  if (normalized === "alternate_emails") {
    return "Alternate emails";
  }
  return name;
}

function splitMultiValueText(value?: string | null): string[] {
  return String(value ?? "")
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mergeUniqueValues(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function resolveFieldDefinitions(
  definitions: CaseCustomFieldDefinition[],
  detail?: Pick<CaseDetail, "custom_fields"> | null,
): CaseCustomFieldDefinition[] {
  const map = new Map<string, CaseCustomFieldDefinition>();
  for (const definition of definitions) {
    map.set(definition.name, definition);
  }
  for (const key of Object.keys(detail?.custom_fields ?? {})) {
    if (!map.has(key)) {
      map.set(key, makeFallbackFieldDefinition(key));
    }
  }
  return Array.from(map.values());
}

function buildEditableCase(
  detail: CaseDetail,
  definitions: CaseCustomFieldDefinition[],
): EditableCase {
  const custom_fields: Record<string, string> = {};
  const seen = new Set<string>();

  for (const definition of definitions) {
    seen.add(definition.name);
    custom_fields[definition.name] = detail.custom_fields[definition.name] ?? "";
  }

  for (const [key, value] of Object.entries(detail.custom_fields)) {
    if (seen.has(key)) {
      continue;
    }
    custom_fields[key] = value ?? "";
  }

  return {
    title: detail.title ?? "",
    status: detail.status ?? "",
    request_type: detail.request_type ?? "",
    phone: detail.phone ?? "",
    custom_fields,
  };
}

function AttentionPills({ item }: { item: Case }) {
  const tokens = attentionTokens(item);
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

type InlineEditableInputProps = {
  value?: string | null;
  placeholder: string;
  onSave: (value: string) => Promise<InlineSaveResult>;
  listId?: string;
  isSaving?: boolean;
  error?: string | null;
};

function InlineEditableInput({
  value,
  placeholder,
  onSave,
  listId,
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
        list={listId}
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

export default function CasesPage() {
  const [data, setData] = React.useState<Case[]>([]);
  const [totalRows, setTotalRows] = React.useState(0);
  const [filterOptions, setFilterOptions] = React.useState<FilterOptions>({
    request_types: [],
    statuses: [],
  });
  const [hasLoadedFilterOptions, setHasLoadedFilterOptions] =
    React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldDefinitions, setFieldDefinitions] = React.useState<
    CaseCustomFieldDefinition[]
  >([]);

  const [draftFilters, setDraftFilters] = React.useState<FilterState>(
    () => readStoredFilters(),
  );
  const [appliedFilters, setAppliedFilters] = React.useState<FilterState>(
    () => readStoredFilters(),
  );
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const [selected, setSelected] = React.useState<CaseDetail | null>(null);
  const [editor, setEditor] = React.useState<EditableCase | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);
  const [inlineSaving, setInlineSaving] = React.useState<
    Record<string, boolean>
  >({});
  const [inlineErrors, setInlineErrors] = React.useState<
    Record<string, string>
  >({});
  const didHydratePersistedFilters = React.useRef(false);
  const didInitFilterApply = React.useRef(false);
  const [openFilterPanel, setOpenFilterPanel] = React.useState<
    "requestTypes" | "statuses" | null
  >(null);
  const filterOptionsRef = React.useRef({
    requestTypes: [] as string[],
    statuses: [] as string[],
    optionsReady: false,
  });
  const sectionCustomFieldsRef = React.useRef<HTMLDivElement>(null);
  const sectionCaseInfoRef = React.useRef<HTMLDivElement>(null);
  const sectionMovementRef = React.useRef<HTMLDivElement>(null);
  const sectionDocumentsRef = React.useRef<HTMLDivElement>(null);
  const sectionDiscussionRef = React.useRef<HTMLDivElement>(null);
  const scrollToSection = React.useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const [newCaseOpen, setNewCaseOpen] = React.useState(false);
  const [newCaseDraft, setNewCaseDraft] = React.useState<NewCaseDraft>({
    title: "",
    phone: "",
    custom_fields: {},
    finance: emptyNewCaseFinance(),
  });
  const [isCreating, setIsCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const loadFilterOptions = React.useCallback(async () => {
    const res = await apiClient.getParsed(
      "/api/cases/filter-options",
      FilterOptionsSchema,
    );
    if (!res.error && res.data) {
      setFilterOptions(res.data);
    }
    setHasLoadedFilterOptions(true);
  }, []);

  const loadFieldDefinitions = React.useCallback(async () => {
    const res = await apiClient.getParsed(
      "/api/custom-fields?scope=case",
      CaseCustomFieldDefinitionSchema.array(),
    );
    if (!res.error && res.data) {
      setFieldDefinitions(res.data);
    }
  }, []);

  const loadCases = React.useCallback(async (
    filters: FilterState,
    nextPagination: { pageIndex: number; pageSize: number },
    nextSorting?: SortingState,
  ) => {
    setIsLoading(true);
    if (
      (filters.requestTypes !== null && filters.requestTypes.length === 0) ||
      (filters.statuses !== null && filters.statuses.length === 0)
    ) {
      setError(null);
      setData([]);
      setTotalRows(0);
      setIsLoading(false);
      return;
    }

    const res = await apiClient.post<unknown>(
      "/api/cases/query",
      buildCasesQuery(filters, nextPagination, nextSorting),
    );
    if (res.error || res.data == null) {
      setError(res.error);
      setData([]);
      setTotalRows(0);
    } else {
      const parsed = PaginatedCaseListSchema.safeParse(res.data);
      if (!parsed.success) {
        setError("Unexpected response shape from server.");
        setData([]);
        setTotalRows(0);
        setIsLoading(false);
        return;
      }
      setError(null);
      setData(parsed.data.items);
      setTotalRows(parsed.data.total);
    }
    setIsLoading(false);
  }, []);

  const refreshAll = React.useCallback(async () => {
    await Promise.all([
      loadFilterOptions(),
      loadFieldDefinitions(),
      loadCases(appliedFilters, pagination, sorting),
    ]);
  }, [appliedFilters, loadCases, loadFieldDefinitions, loadFilterOptions, pagination, sorting]);

  React.useEffect(() => {
    void Promise.all([loadFilterOptions(), loadFieldDefinitions()]);
  }, [loadFieldDefinitions, loadFilterOptions]);

  React.useEffect(() => {
    let cancelled = false;

    const loadPersistedFilters = async () => {
      const res = await apiClient.get<PersistedFilterSettings>("/api/settings");
      if (cancelled || res.error || !res.data) {
        return;
      }

      const nextFilters = reconcileFiltersWithOptions(
        normalizeFiltersFromSettings(res.data),
        filterOptionsRef.current.requestTypes,
        filterOptionsRef.current.statuses,
        filterOptionsRef.current.optionsReady,
      );
      didHydratePersistedFilters.current = true;
      didInitFilterApply.current = true;
      setPagination((current) => ({ ...current, pageIndex: 0 }));
      setDraftFilters(nextFilters);
      setAppliedFilters(nextFilters);
      writeStoredFilters(nextFilters);
    };

    void loadPersistedFilters();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    writeStoredFilters(appliedFilters);
    void loadCases(appliedFilters, pagination, sorting);
  }, [appliedFilters, loadCases, pagination, sorting]);

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

  const persistFilterSettings = React.useCallback(
    async (filters: FilterState) => {
      const payload = {
        last_request_type_selection: serializePersistedFilterArray(
          filters.requestTypes,
        ),
        last_status_selection: serializePersistedFilterArray(filters.statuses),
        last_date_range: {
          preset:
            filters.datePreset === "today"
              ? "Today"
              : filters.datePreset === "week"
                ? "This Week"
                : filters.datePreset === "30days"
                  ? "Last 30 Days"
                  : filters.datePreset === "custom"
                    ? "Custom"
                    : "All Time",
          start: getResolvedDateRange(filters).dateFrom ?? null,
          end: getResolvedDateRange(filters).dateTo ?? null,
        },
        last_search_text: filters.search.trim(),
      };

      await apiClient.patch("/api/settings/filters", payload);
    },
    [],
  );

  React.useEffect(() => {
    if (!didHydratePersistedFilters.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void persistFilterSettings(appliedFilters);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [appliedFilters, persistFilterSettings]);

  const requestTypes = React.useMemo(
    () => filterOptions.request_types,
    [filterOptions.request_types],
  );

  const statuses = React.useMemo(
    () => filterOptions.statuses,
    [filterOptions.statuses],
  );

  React.useEffect(() => {
    filterOptionsRef.current = {
      requestTypes,
      statuses,
      optionsReady: hasLoadedFilterOptions,
    };
  }, [hasLoadedFilterOptions, requestTypes, statuses]);

  React.useEffect(() => {
    if (!hasLoadedFilterOptions) {
      return;
    }
    setDraftFilters((current) =>
      reconcileFiltersWithOptions(current, requestTypes, statuses, true),
    );
    setAppliedFilters((current) =>
      reconcileFiltersWithOptions(current, requestTypes, statuses, true),
    );
  }, [hasLoadedFilterOptions, requestTypes, statuses]);

  const summaryStats = React.useMemo(() => {
    let newCount = 0;
    let movedCount = 0;
    let staleCount = 0;

    for (const item of data) {
      const { isNew, isUpdated, isStale } = getAttentionFlags(item);
      if (isNew) {
        newCount += 1;
      }
      if (isUpdated) {
        movedCount += 1;
      }
      if (isStale) {
        staleCount += 1;
      }
    }

    return {
      total: data.length,
      newCount,
      movedCount,
      staleCount,
    };
  }, [data]);

  const fieldDefinitionsWithFixed = React.useMemo(
    () => withFixedCaseFieldDefinitions(fieldDefinitions),
    [fieldDefinitions],
  );
  const enabledFieldDefinitions = React.useMemo(
    () => fieldDefinitionsWithFixed.filter((definition) => definition.enabled),
    [fieldDefinitionsWithFixed],
  );

  const isFinanceFieldName = React.useCallback((name: string): boolean => {
    const normalized = name.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    if (normalized === "finansii") {
      return true;
    }
    if (normalized.includes("company")) {
      return true;
    }
    if (normalized.includes("tax") || normalized.includes("danok")) {
      return true;
    }
    return false;
  }, []);

  const createFormGeneralFields = React.useMemo(
    () =>
      enabledFieldDefinitions.filter((definition) => {
        const normalized = definition.name.trim().toLowerCase();
        if (normalized === "phone") {
          return false;
        }
        if (definition.name.trim() === CASE_CLIENT_NAME_FIELD) {
          return false;
        }
        if (definition.name.trim().toLowerCase() === CASE_EMAIL_FIELD) {
          return false;
        }
        if (definition.name.trim().toLowerCase() === CASE_ALT_EMAILS_FIELD) {
          return false;
        }
        return !isFinanceFieldName(definition.name);
      }),
    [enabledFieldDefinitions, isFinanceFieldName],
  );

  const createFormFinanceFields = React.useMemo(
    () =>
      enabledFieldDefinitions.filter((definition) =>
        isFinanceFieldName(definition.name),
      ),
    [enabledFieldDefinitions, isFinanceFieldName],
  );

  const resolvedDefinitions = React.useMemo(
    () => resolveFieldDefinitions(enabledFieldDefinitions, selected),
    [enabledFieldDefinitions, selected],
  );

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

      for (const item of data) {
        const existingValue = String(
          item.custom_fields?.[definition.name] ?? "",
        ).trim();
        if (!existingValue || seen.has(existingValue)) {
          continue;
        }
        seen.add(existingValue);
        merged.push(existingValue);
      }

      optionsByField.set(definition.name, merged);
    }

    return optionsByField;
  }, [data, enabledFieldDefinitions]);

  const applyUpdatedCase = React.useCallback(
    (nextDetail: CaseDetail) => {
      const nextSummary = toCaseSummary(nextDetail);
      const nextDefinitions = resolveFieldDefinitions(
        enabledFieldDefinitions,
        nextDetail,
      );
      const selectedCaseId = selected?.case_id;

      if (selectedCaseId === nextDetail.case_id) {
        setSelected(nextDetail);
        setEditor(buildEditableCase(nextDetail, nextDefinitions));
      }

      setData((current) =>
        current.map((row) =>
          row.case_id === nextSummary.case_id ? nextSummary : row,
        ),
      );
    },
    [enabledFieldDefinitions, selected],
  );

  const saveCasePatch = React.useCallback(
    async (
      caseId: string,
      payload: CasePatchPayload,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const response = await apiClient.patch<CaseDetail>(
        `/api/cases/${encodeURIComponent(caseId)}`,
        payload,
      );

      if (response.error || !response.data) {
        return {
          ok: false,
          error: response.error ?? "Unable to save case.",
        };
      }

      const parsed = CaseDetailSchema.safeParse(response.data);
      if (!parsed.success) {
        return {
          ok: false,
          error: "Server returned an unexpected case payload.",
        };
      }

      applyUpdatedCase(parsed.data);
      await loadCases(appliedFilters, pagination, sorting);
      return { ok: true };
    },
    [appliedFilters, applyUpdatedCase, loadCases, pagination, sorting],
  );

  const openCase = React.useCallback(
    async (item: Case) => {
      setDrawerOpen(true);
      setSelected(null);
      setEditor(null);
      setSaveError(null);
      setSaveMessage(null);
      setDetailError(null);
      setIsDetailLoading(true);

      const res = await apiClient.getParsed(
        `/api/cases/${encodeURIComponent(item.case_id)}`,
        CaseDetailSchema,
      );

      if (res.error) {
        setDetailError(res.error);
      } else if (res.data) {
        const nextDefinitions = resolveFieldDefinitions(
          enabledFieldDefinitions,
          res.data,
        );
        setSelected(res.data);
        setEditor(buildEditableCase(res.data, nextDefinitions));
      }

      setIsDetailLoading(false);
    },
    [enabledFieldDefinitions],
  );

  const updateEditorField = React.useCallback(
    (key: keyof Omit<EditableCase, "custom_fields">, value: string) => {
      setEditor((current) =>
        current
          ? {
              ...current,
              [key]: value,
            }
          : current,
      );
    },
    [],
  );

  const updateCustomField = React.useCallback((fieldName: string, value: string) => {
    setEditor((current) =>
      current
        ? {
            ...current,
            custom_fields: {
              ...current.custom_fields,
              [fieldName]: value,
            },
          }
        : current,
    );
  }, []);

  const handleImmediateFilterChange = React.useCallback(
    (
      patch: Partial<
        Pick<
          FilterState,
          "search" | "requestTypes" | "statuses" | "datePreset" | "dateFrom" | "dateTo"
        >
      >,
    ) => {
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

  const handleSave = React.useCallback(async () => {
    if (!selected || !editor) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    const payload = {
      phone: normalizeEditableValue(editor.phone),
      custom_fields: Object.fromEntries(
        Object.entries(editor.custom_fields).map(([key, value]) => [
          key,
          normalizeEditableValue(value),
        ]),
      ),
    };

    const result = await saveCasePatch(selected.case_id, payload);
    if (!result.ok) {
      setSaveError(result.error);
      setIsSaving(false);
      return;
    }

    setSaveMessage("Saved.");
    setIsSaving(false);
  }, [editor, saveCasePatch, selected]);

  const handleInlineSave = React.useCallback(
    async (
      caseId: string,
      fieldKey: string,
      payload: CasePatchPayload,
    ): Promise<InlineSaveResult> => {
      const key = buildInlineStateKey(caseId, fieldKey);

      setInlineSaving((current) => ({ ...current, [key]: true }));
      setInlineErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });

      const result = await saveCasePatch(caseId, payload);

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
        return { ok: false, error: result.error };
      }

      setInlineErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return { ok: true };
    },
    [saveCasePatch],
  );

  const customFieldColumns = React.useMemo<ColumnDef<Case, unknown>[]>(
    () =>
      enabledFieldDefinitions
        .filter((definition) => !isFixedCaseField(definition.name))
        .map((definition) => ({
          id: `custom:${definition.name}`,
          accessorFn: (row) => row.custom_fields?.[definition.name] ?? "",
          header: getCaseFieldLabel(definition.name),
          cell: ({ row }) => {
            const item = row.original;
            const fieldKey = `custom:${definition.name}`;
            const key = buildInlineStateKey(item.case_id, fieldKey);
            const value = item.custom_fields?.[definition.name] ?? "";
            const options = customFieldOptions.get(definition.name) ?? [];

            if (
              definition.type.toLowerCase() === "dropdown" &&
              options.length
            ) {
              return (
                <InlineEditableSelect
                  value={value}
                  placeholder={getCaseFieldLabel(definition.name)}
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
                placeholder={getCaseFieldLabel(definition.name)}
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
    [customFieldOptions, enabledFieldDefinitions, handleInlineSave, inlineErrors, inlineSaving],
  );

  const columns = React.useMemo<ColumnDef<Case, unknown>[]>(
    () => [
      {
        id: "attention",
        accessorFn: (row) => getAttentionPriority(row),
        header: "Attention",
        cell: ({ row }) => <AttentionPills item={row.original} />,
      },
      {
        accessorKey: "case_id",
        header: "Case ID",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openCase(row.original);
            }}
            className="text-xs font-semibold tracking-[0.08em] text-primary underline-offset-4 hover:underline"
          >
            {row.original.case_id}
          </button>
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
        meta: { className: "w-[30%] max-w-[32rem]" },
        cell: ({ row }) => (
          <span className="block max-w-[32rem] truncate text-sm text-foreground">
            {displayText(row.original.title, "Untitled case")}
          </span>
        ),
      },
      {
        accessorKey: "latest_document_name",
        header: "Latest Document",
        meta: { className: "w-[24%] max-w-[26rem]" },
        cell: ({ row }) => (
          <span
            className="block max-w-[26rem] truncate text-xs text-muted-foreground"
            title={row.original.latest_document_name ?? ""}
          >
            {displayText(row.original.latest_document_name)}
          </span>
        ),
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
        accessorKey: "prev_change_at",
        header: "Previous",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(row.original.prev_change_at)}
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
          const isStale =
            typeof days === "number" && days >= STALE_DAYS;
          return (
            <span
              className={cn(
                "text-xs font-medium",
                isStale ? "text-amber-700" : "text-muted-foreground",
              )}
            >
              {typeof days === "number" ? days : "-"}
            </span>
          );
        },
      },
      {
        id: "client_name",
        accessorFn: (row) => row.custom_fields?.["Name / Last name"] ?? "",
        header: "Client Name",
        cell: ({ row }) => {
          const item = row.original;
          const key = buildInlineStateKey(item.case_id, "custom:Name / Last name");
          return (
            <InlineEditableInput
              value={item.custom_fields?.["Name / Last name"] ?? ""}
              placeholder="Client name"
              onSave={(nextValue) =>
                handleInlineSave(item.case_id, "custom:Name / Last name", {
                  custom_fields: {
                    "Name / Last name": normalizeEditableValue(nextValue),
                  },
                })
              }
              isSaving={Boolean(inlineSaving[key])}
              error={inlineErrors[key]}
            />
          );
        },
      },
      {
        id: "email",
        accessorFn: (row) => row.custom_fields?.email ?? "",
        header: "Email",
        meta: { className: "min-w-[16rem]" },
        cell: ({ row }) => {
          const item = row.original;
          const fieldKey = "custom:email";
          const key = buildInlineStateKey(item.case_id, fieldKey);
          const value = item.custom_fields?.email ?? "";
          const options = mergeUniqueValues([
            value,
            ...splitMultiValueText(item.custom_fields?.alternate_emails),
          ]);

          if (options.length > 1) {
            return (
              <InlineEditableSelect
                value={value}
                placeholder="Email"
                options={options}
                onSave={(nextValue) =>
                  handleInlineSave(item.case_id, fieldKey, {
                    custom_fields: {
                      email: normalizeEditableValue(nextValue),
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
              placeholder="Email"
              onSave={(nextValue) =>
                handleInlineSave(item.case_id, fieldKey, {
                  custom_fields: {
                    email: normalizeEditableValue(nextValue),
                  },
                })
              }
              isSaving={Boolean(inlineSaving[key])}
              error={inlineErrors[key]}
            />
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
        meta: { className: "min-w-[16rem]" },
        cell: ({ row }) => {
          const item = row.original;
          const key = buildInlineStateKey(item.case_id, "custom:address");
          return (
            <InlineEditableInput
              value={item.custom_fields?.address ?? ""}
              placeholder="Address"
              onSave={(nextValue) =>
                handleInlineSave(item.case_id, "custom:address", {
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
      ...customFieldColumns,
    ],
    [customFieldColumns, handleInlineSave, inlineErrors, inlineSaving, openCase],
  );

  const content = (() => {
    if (isLoading && !data.length) {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Attention</TableHead>
              <TableHead>Case ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Request Type</TableHead>
              <TableHead>First Seen</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Last Change</TableHead>
            </TableRow>
          </TableHeader>
          <SkeletonRows rows={7} />
        </Table>
      );
    }

    if (error) {
      return <ErrorState message={error} onRetry={refreshAll} />;
    }

    if (!data.length) {
      return (
        <EmptyState
          title="No cases match the current working filters."
          description="Adjust the filters or clear them to bring cases back into the table."
        >
          <Button variant="outline" size="sm" onClick={handleClearFilters}>
            Clear filters
          </Button>
        </EmptyState>
      );
    }

    return (
      <DataTable
        id="cases"
        columns={columns}
        data={data}
        initialPageSize={DEFAULT_PAGE_SIZE}
        manualPagination
        pageIndex={pagination.pageIndex}
        pageSize={pagination.pageSize}
        totalRows={totalRows}
        onPaginationChange={setPagination}
        sorting={sorting}
        onSortingChange={(next) => {
          setSorting(next);
          setPagination((p) => ({ ...p, pageIndex: 0 }));
        }}
      />
    );
  })();

  const handleCreateCase = React.useCallback(async () => {
    const title = normalizeEditableValue(newCaseDraft.title);
    const phone = normalizeEditableValue(newCaseDraft.phone);

    if (!title) {
      setCreateError("Title is required.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    const payload: {
      title: string;
      phone?: string;
      custom_fields?: Record<string, string>;
      finance?: Record<string, string | number>;
    } = {
      title,
    };

    if (phone) {
      payload.phone = phone;
    }

    const customFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(newCaseDraft.custom_fields)) {
      const normalizedKey = key.trim();
      if (!normalizedKey) {
        continue;
      }
      const normalizedValue = normalizeEditableValue(value);
      if (!normalizedValue) {
        continue;
      }
      customFields[normalizedKey] = normalizedValue;
    }
    if (Object.keys(customFields).length > 0) {
      payload.custom_fields = customFields;
    }

    const fin = newCaseDraft.finance;
    const financePayload: Record<string, string | number> = {};
    const st = normalizeEditableValue(fin.service_type);
    if (st) {
      financePayload.service_type = st;
    }
    const cur = normalizeEditableValue(fin.currency);
    if (cur) {
      financePayload.currency = cur;
    }
    const cs = fin.contract_sum.trim();
    if (cs !== "" && !Number.isNaN(Number.parseFloat(cs))) {
      financePayload.contract_sum = Number.parseFloat(cs);
    }
    const pa = fin.paid_amount.trim();
    if (pa !== "" && !Number.isNaN(Number.parseFloat(pa))) {
      financePayload.paid_amount = Number.parseFloat(pa);
    }
    const nt = normalizeEditableValue(fin.notes);
    if (nt) {
      financePayload.notes = nt;
    }
    if (Object.keys(financePayload).length > 0) {
      payload.finance = financePayload;
    }

    const res = await apiClient.post<unknown>("/api/cases", payload);
    if (res.error || !res.data) {
      setCreateError(res.error ?? "Unable to create case.");
      setIsCreating(false);
      return;
    }

    const parsed = CaseDetailSchema.safeParse(res.data);
    if (!parsed.success) {
      setCreateError("Server returned an unexpected case payload.");
      setIsCreating(false);
      return;
    }

    const summary = toCaseSummary(parsed.data);
    setData((current) => [summary, ...current]);
    setTotalRows((current) => current + 1);
    setNewCaseDraft({
      title: "",
      phone: "",
      custom_fields: {},
      finance: emptyNewCaseFinance(),
    });
    setNewCaseOpen(false);
    setIsCreating(false);
  }, [newCaseDraft]);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Filtered Cases"
          value={String(summaryStats.total)}
          hint="Cases in the working table"
        />
        <StatCard
          label="New In 7 Days"
          value={String(summaryStats.newCount)}
          hint="Recently created cases"
        />
        <StatCard
          label="Moved In 7 Days"
          value={String(summaryStats.movedCount)}
          hint="Recently changed status or movement"
        />
        <StatCard
          label="Stale 20+ Days"
          value={String(summaryStats.staleCount)}
          hint="Cases needing operator attention"
        />
      </div>

      <PageContainer className="gap-5">
        <div className="grid gap-3 rounded-2xl border border-border/60 bg-muted/60 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="cases-search">Search</Label>
              <div className="relative overflow-visible">
                <Input
                  id="cases-search"
                  placeholder="Search case ID, title, names, phones, or text"
                  value={draftFilters.search}
                  onChange={(event) =>
                    handleImmediateFilterChange({ search: event.target.value })
                  }
                  className="pr-10 !bg-white dark:!bg-white"
                />
                {draftFilters.search ? (
                  <button
                    type="button"
                    onClick={() =>
                      handleImmediateFilterChange({ search: "" })
                    }
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-muted/90 p-1.5 text-foreground shadow-sm hover:bg-muted"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4 shrink-0" />
                  </button>
                ) : null}
              </div>
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
              <div className="flex w-full gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleClearFilters}
                >
                  Clear all
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() => {
                    setNewCaseDraft({
                      title: "",
                      phone: "",
                      custom_fields: {},
                      finance: emptyNewCaseFinance(),
                    });
                    setCreateError(null);
                    setNewCaseOpen(true);
                  }}
                >
                  New case
                </Button>
              </div>
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
                <Label htmlFor="cases-date-from">From</Label>
                <Input
                  id="cases-date-from"
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
                <Label htmlFor="cases-date-to">To</Label>
                <Input
                  id="cases-date-to"
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
        </div>

        <div className="flex-1">{content}</div>

        <CustomFieldManager
          scope="case"
          title="Case Custom Fields"
          description="Create and manage the case-scoped fields that appear in Cases and remain editable inline."
          fields={fieldDefinitionsWithFixed}
          lockedFieldNames={["address"]}
          onChanged={refreshAll}
        />
      </PageContainer>

      <Dialog open={newCaseOpen} onOpenChange={setNewCaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New case</DialogTitle>
            <DialogDescription>
              Top: client and case contact. Bottom: finance (contract, payments,
              finance custom fields).
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1 [&_input]:!bg-white [&_textarea]:!bg-white [&_[data-slot=select-trigger]]:!bg-white dark:[&_input]:!bg-white dark:[&_textarea]:!bg-white dark:[&_[data-slot=select-trigger]]:!bg-white">
            <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/30 p-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Client &amp; case
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Title, contact, and other client-side details (same data as the
                  cases table).
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="new-case-title">Title</Label>
                  <Input
                    id="new-case-title"
                    value={newCaseDraft.title}
                    onChange={(event) =>
                      setNewCaseDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Enter case title"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-case-client-name">Client name</Label>
                  <Input
                    id="new-case-client-name"
                    value={
                      newCaseDraft.custom_fields[CASE_CLIENT_NAME_FIELD] ?? ""
                    }
                    onChange={(event) =>
                      setNewCaseDraft((current) => ({
                        ...current,
                        custom_fields: {
                          ...current.custom_fields,
                          [CASE_CLIENT_NAME_FIELD]: event.target.value,
                        },
                      }))
                    }
                    placeholder="Client name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-case-phone">Phone</Label>
                  <Input
                    id="new-case-phone"
                    value={newCaseDraft.phone}
                    onChange={(event) =>
                      setNewCaseDraft((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    placeholder="Phone"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-case-email">Email</Label>
                  <Input
                    id="new-case-email"
                    type="email"
                    autoComplete="email"
                    value={newCaseDraft.custom_fields[CASE_EMAIL_FIELD] ?? ""}
                    onChange={(event) =>
                      setNewCaseDraft((current) => ({
                        ...current,
                        custom_fields: {
                          ...current.custom_fields,
                          [CASE_EMAIL_FIELD]: event.target.value,
                        },
                      }))
                    }
                    placeholder="Email"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="new-case-alt-emails">Alternate emails</Label>
                  <Input
                    id="new-case-alt-emails"
                    value={
                      newCaseDraft.custom_fields[CASE_ALT_EMAILS_FIELD] ?? ""
                    }
                    onChange={(event) =>
                      setNewCaseDraft((current) => ({
                        ...current,
                        custom_fields: {
                          ...current.custom_fields,
                          [CASE_ALT_EMAILS_FIELD]: event.target.value,
                        },
                      }))
                    }
                    placeholder="Extra addresses, comma or semicolon separated"
                  />
                </div>
              </div>
              {createFormGeneralFields.length > 0 ? (
                <div className="space-y-3 border-t border-border/60 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    More client / case details
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {createFormGeneralFields.map((definition) => {
                      const value =
                        newCaseDraft.custom_fields[definition.name] ?? "";
                      if (
                        definition.type.toLowerCase() === "dropdown" &&
                        definition.options.length
                      ) {
                        return (
                          <div key={definition.name} className="space-y-1.5">
                            <Label>{getCaseFieldLabel(definition.name)}</Label>
                            <Select
                              value={value || EMPTY_VALUE}
                              onValueChange={(nextValue) =>
                                setNewCaseDraft((current) => ({
                                  ...current,
                                  custom_fields: {
                                    ...current.custom_fields,
                                    [definition.name]:
                                      nextValue === EMPTY_VALUE
                                        ? ""
                                        : nextValue,
                                  },
                                }))
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select value" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={EMPTY_VALUE}>
                                  Empty
                                </SelectItem>
                                {definition.options.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      }
                      return (
                        <div key={definition.name} className="space-y-1.5">
                          <Label htmlFor={`new-case-custom-${definition.name}`}>
                            {getCaseFieldLabel(definition.name)}
                          </Label>
                          <Input
                            id={`new-case-custom-${definition.name}`}
                            value={value}
                            onChange={(event) =>
                              setNewCaseDraft((current) => ({
                                ...current,
                                custom_fields: {
                                  ...current.custom_fields,
                                  [definition.name]: event.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/40 p-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Finance</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Contract, payments, and finance-only custom fields.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="new-case-fin-service-type">Service type</Label>
                  <Input
                    id="new-case-fin-service-type"
                    value={newCaseDraft.finance.service_type}
                    onChange={(event) =>
                      setNewCaseDraft((current) => ({
                        ...current,
                        finance: {
                          ...current.finance,
                          service_type: event.target.value,
                        },
                      }))
                    }
                    placeholder="e.g. urban planning, permit"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-case-fin-contract-sum">Contract amount</Label>
                  <Input
                    id="new-case-fin-contract-sum"
                    type="number"
                    step="any"
                    min={0}
                    value={newCaseDraft.finance.contract_sum}
                    onChange={(event) =>
                      setNewCaseDraft((current) => ({
                        ...current,
                        finance: {
                          ...current.finance,
                          contract_sum: event.target.value,
                        },
                      }))
                    }
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-case-fin-currency">Currency</Label>
                  <Input
                    id="new-case-fin-currency"
                    value={newCaseDraft.finance.currency}
                    onChange={(event) =>
                      setNewCaseDraft((current) => ({
                        ...current,
                        finance: {
                          ...current.finance,
                          currency: event.target.value,
                        },
                      }))
                    }
                    placeholder="MKD"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-case-fin-paid">Paid amount</Label>
                  <Input
                    id="new-case-fin-paid"
                    type="number"
                    step="any"
                    min={0}
                    value={newCaseDraft.finance.paid_amount}
                    onChange={(event) =>
                      setNewCaseDraft((current) => ({
                        ...current,
                        finance: {
                          ...current.finance,
                          paid_amount: event.target.value,
                        },
                      }))
                    }
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="new-case-fin-notes">Finance notes</Label>
                  <Textarea
                    id="new-case-fin-notes"
                    value={newCaseDraft.finance.notes}
                    onChange={(event) =>
                      setNewCaseDraft((current) => ({
                        ...current,
                        finance: {
                          ...current.finance,
                          notes: event.target.value,
                        },
                      }))
                    }
                    placeholder="Internal finance notes"
                    rows={3}
                    className="resize-y"
                  />
                </div>
              </div>
              {createFormFinanceFields.length > 0 ? (
                <div className="space-y-3 border-t border-border/60 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Finance custom fields
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {createFormFinanceFields.map((definition) => {
                      const value =
                        newCaseDraft.custom_fields[definition.name] ?? "";
                      if (
                        definition.type.toLowerCase() === "dropdown" &&
                        definition.options.length
                      ) {
                        return (
                          <div key={definition.name} className="space-y-1.5">
                            <Label>{getCaseFieldLabel(definition.name)}</Label>
                            <Select
                              value={value || EMPTY_VALUE}
                              onValueChange={(nextValue) =>
                                setNewCaseDraft((current) => ({
                                  ...current,
                                  custom_fields: {
                                    ...current.custom_fields,
                                    [definition.name]:
                                      nextValue === EMPTY_VALUE
                                        ? ""
                                        : nextValue,
                                  },
                                }))
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select value" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={EMPTY_VALUE}>
                                  Empty
                                </SelectItem>
                                {definition.options.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      }
                      return (
                        <div key={definition.name} className="space-y-1.5">
                          <Label htmlFor={`new-case-custom-${definition.name}`}>
                            {getCaseFieldLabel(definition.name)}
                          </Label>
                          <Input
                            id={`new-case-custom-${definition.name}`}
                            value={value}
                            onChange={(event) =>
                              setNewCaseDraft((current) => ({
                                ...current,
                                custom_fields: {
                                  ...current.custom_fields,
                                  [definition.name]: event.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            {createError ? (
              <p className="text-sm text-destructive">{createError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewCaseOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateCase}
              disabled={isCreating}
            >
              {isCreating ? "Creating..." : "Create case"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent className="flex h-[90vh] max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-4xl">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DialogHeader className="sticky top-0 z-10 shrink-0 border-b border-border/60 bg-background px-6 py-4">
              <DialogTitle>Case {selected?.case_id ?? "—"}</DialogTitle>
              <DialogDescription>
                All case data in one scroll. Edit custom fields and phone, then
                save.
              </DialogDescription>
              {selected && editor ? (
                <nav
                  className="flex flex-wrap gap-2 pt-2"
                  aria-label="Jump to section"
                >
                  <button
                    type="button"
                    onClick={() => scrollToSection(sectionCustomFieldsRef)}
                    className="rounded bg-muted/80 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    Custom fields
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection(sectionCaseInfoRef)}
                    className="rounded bg-muted/80 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    Case information
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection(sectionMovementRef)}
                    className="rounded bg-muted/80 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    Movement history
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection(sectionDocumentsRef)}
                    className="rounded bg-muted/80 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    Documents
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection(sectionDiscussionRef)}
                    className="rounded bg-muted/80 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    Discussion
                  </button>
                </nav>
              ) : null}
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-5">
              {isDetailLoading ? (
                <LoadingState label="Loading case..." />
              ) : detailError ? (
                <ErrorState message={detailError} />
              ) : !selected || !editor ? (
                <LoadingState label="Preparing case..." />
              ) : (
                <div className="space-y-8">
                  {/* 1. Custom fields (top, editable) */}
                  <div
                    ref={sectionCustomFieldsRef}
                    className="scroll-mt-4 rounded-2xl border border-border/60 bg-background p-4"
                  >
                    <h2 className="mb-1 text-sm font-semibold text-foreground">
                      Custom fields
                    </h2>
                    <p className="mb-4 text-xs text-muted-foreground">
                      Operator-managed fields. Edit and save below.
                    </p>
                    {resolvedDefinitions.length ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        {resolvedDefinitions.map((definition) => {
                          const value =
                            editor.custom_fields[definition.name] ?? "";
                          if (
                            definition.type.toLowerCase() === "dropdown" &&
                            definition.options.length
                          ) {
                            return (
                              <div key={definition.name} className="space-y-2">
                                <Label>{getCaseFieldLabel(definition.name)}</Label>
                                <Select
                                  value={value || EMPTY_VALUE}
                                  onValueChange={(nextValue) =>
                                    updateCustomField(
                                      definition.name,
                                      nextValue === EMPTY_VALUE
                                        ? ""
                                        : nextValue,
                                    )
                                  }
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select value" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={EMPTY_VALUE}>
                                      Empty
                                    </SelectItem>
                                    {definition.options.map((option) => (
                                      <SelectItem key={option} value={option}>
                                        {option}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          }
                          return (
                            <div key={definition.name} className="space-y-2">
                              <Label htmlFor={`custom-${definition.name}`}>
                                {getCaseFieldLabel(definition.name)}
                              </Label>
                              <Input
                                id={`custom-${definition.name}`}
                                value={value}
                                onChange={(event) =>
                                  updateCustomField(
                                    definition.name,
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No custom fields defined.
                      </p>
                    )}
                  </div>

                  {/* 2. Case information (DB + phone editable) */}
                  <div
                    ref={sectionCaseInfoRef}
                    className="scroll-mt-4 rounded-2xl border border-border/60 bg-muted/40 p-4"
                  >
                    <h2 className="mb-4 text-sm font-semibold text-foreground">
                      Case information
                    </h2>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <dl className="space-y-3 text-sm">
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Title
                          </dt>
                          <dd className="mt-0.5 text-foreground">
                            {displayText(selected.title, "—")}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Status
                          </dt>
                          <dd className="mt-0.5">
                            <StatusBadge status={selected.status} />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Request type
                          </dt>
                          <dd className="mt-0.5 text-foreground">
                            {displayText(selected.request_type, "—")}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Latest document
                          </dt>
                          <dd
                            className="mt-0.5 text-foreground"
                            title={selected.latest_document_name ?? ""}
                          >
                            {displayText(selected.latest_document_name, "—")}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Created
                          </dt>
                          <dd className="mt-0.5 text-muted-foreground">
                            {formatDateTime(selected.created_at) || "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Last change
                          </dt>
                          <dd className="mt-0.5 text-muted-foreground">
                            {formatDateTime(selected.updated_at) || "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Previous
                          </dt>
                          <dd className="mt-0.5 text-muted-foreground">
                            {formatDateTime(selected.prev_change_at) || "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            First seen
                          </dt>
                          <dd className="mt-0.5 text-muted-foreground">
                            {displayText(selected.first_seen, "—")}
                          </dd>
                        </div>
                      </dl>
                      <div className="space-y-3">
                        <div>
                          <Label htmlFor="case-phone">Phone</Label>
                          <Input
                            id="case-phone"
                            className="mt-1"
                            value={editor.phone}
                            onChange={(event) =>
                              updateEditorField("phone", event.target.value)
                            }
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <AttentionPills item={toCaseSummary(selected)} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. Movement history (placeholder) */}
                  <div
                    ref={sectionMovementRef}
                    className="scroll-mt-4 rounded-2xl border border-border/60 bg-muted/40 p-4"
                  >
                    <h2 className="mb-2 text-sm font-semibold text-foreground">
                      Movement history
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      No info available.
                    </p>
                  </div>

                  {/* 4. Documents (placeholder) */}
                  <div
                    ref={sectionDocumentsRef}
                    className="scroll-mt-4 rounded-2xl border border-border/60 bg-muted/40 p-4"
                  >
                    <h2 className="mb-2 text-sm font-semibold text-foreground">
                      Documents
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      No info available.
                    </p>
                  </div>

                  {/* 5. Discussion (placeholder) */}
                  <div
                    ref={sectionDiscussionRef}
                    className="scroll-mt-4 rounded-2xl border border-border/60 bg-muted/40 p-4"
                  >
                    <h2 className="mb-2 text-sm font-semibold text-foreground">
                      Discussion
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      No info available.
                    </p>
                  </div>

                  {saveError ? (
                    <p className="text-sm text-red-600">{saveError}</p>
                  ) : null}
                  {saveMessage ? (
                    <p className="text-sm text-emerald-700">{saveMessage}</p>
                  ) : null}
                </div>
              )}
            </div>

            <DialogFooter className="shrink-0 border-t border-border/60 bg-background px-6 py-4">
              <div className="mr-auto hidden text-xs text-muted-foreground sm:block">
                Saved values update the live data in the cases overview.
              </div>
              <Button
                variant="outline"
                onClick={() => setDrawerOpen(false)}
                disabled={isSaving}
              >
                Close
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !editor}>
                {isSaving ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}
