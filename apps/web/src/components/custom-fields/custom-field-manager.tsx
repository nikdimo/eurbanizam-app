"use client";

import * as React from "react";

import { apiClient } from "@/lib/api/client";
import {
  CaseCustomFieldDefinition,
  CaseCustomFieldDefinitionSchema,
} from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Scope = "case" | "finance";
type EditableRow = {
  originalName: string;
  name: string;
  type: string;
  optionsText: string;
  enabled: boolean;
};

function parseOptions(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(",")) {
    const option = part.trim();
    if (!option || seen.has(option)) {
      continue;
    }
    seen.add(option);
    out.push(option);
  }
  return out;
}

function optionText(value: string[]): string {
  return value.join(", ");
}

function toEditableRow(
  definition: CaseCustomFieldDefinition,
): EditableRow {
  return {
    originalName: definition.name,
    name: definition.name,
    type: definition.type,
    optionsText: optionText(definition.options),
    enabled: definition.enabled,
  };
}

type CustomFieldManagerProps = {
  scope: Scope;
  title: string;
  description: string;
  fields: CaseCustomFieldDefinition[];
  lockedFieldNames?: string[];
  onChanged?: () => Promise<void> | void;
};

export function CustomFieldManager({
  scope,
  title,
  description,
  fields,
  lockedFieldNames = [],
  onChanged,
}: CustomFieldManagerProps) {
  const [rows, setRows] = React.useState<EditableRow[]>([]);
  const [createName, setCreateName] = React.useState("");
  const [createType, setCreateType] = React.useState("Text");
  const [createOptions, setCreateOptions] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRows(fields.map(toEditableRow));
  }, [fields]);

  const lockedFieldNameSet = React.useMemo(
    () => new Set(lockedFieldNames.map((name) => name.trim().toLowerCase())),
    [lockedFieldNames],
  );

  const handleRowChange = React.useCallback(
    (
      originalName: string,
      patch: Partial<EditableRow>,
    ) => {
      setRows((current) =>
        current.map((row) =>
          row.originalName === originalName
            ? { ...row, ...patch }
            : row,
        ),
      );
    },
    [],
  );

  const handleSaveRow = React.useCallback(
    async (row: EditableRow) => {
      if (lockedFieldNameSet.has(row.originalName.trim().toLowerCase())) {
        return;
      }

      setIsSaving(true);
      setError(null);
      setMessage(null);

      const response = await apiClient.put<unknown>(
        `/api/custom-fields/${encodeURIComponent(row.originalName)}`,
        {
          name: row.name,
          type: row.type,
          options:
            row.type.toLowerCase() === "dropdown"
              ? parseOptions(row.optionsText)
              : [],
          enabled: row.enabled,
        },
      );

      if (response.error || response.data == null) {
        setError(response.error ?? "Unable to save field.");
        setIsSaving(false);
        return;
      }

      const parsed = CaseCustomFieldDefinitionSchema.safeParse(response.data);
      if (!parsed.success) {
        setError("Unexpected custom field response.");
        setIsSaving(false);
        return;
      }

      setMessage(`Saved ${parsed.data.name}.`);
      await onChanged?.();
      setIsSaving(false);
    },
    [lockedFieldNameSet, onChanged],
  );

  const handleCreate = React.useCallback(async () => {
    const normalizedCreateName = createName.trim().toLowerCase();
    if (lockedFieldNameSet.has(normalizedCreateName)) {
      setError(`${createName.trim() || "That field"} is built in and cannot be recreated.`);
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    const response = await apiClient.post<unknown>("/api/custom-fields", {
      name: createName,
      type: createType,
      options:
        createType.toLowerCase() === "dropdown"
          ? parseOptions(createOptions)
          : [],
      enabled: true,
      scope,
    });

    if (response.error || response.data == null) {
      setError(response.error ?? "Unable to create field.");
      setIsSaving(false);
      return;
    }

    const parsed = CaseCustomFieldDefinitionSchema.safeParse(response.data);
    if (!parsed.success) {
      setError("Unexpected custom field response.");
      setIsSaving(false);
      return;
    }

    setCreateName("");
    setCreateType("Text");
    setCreateOptions("");
    setMessage(`Created ${parsed.data.name}.`);
    await onChanged?.();
    setIsSaving(false);
  }, [createName, createOptions, createType, lockedFieldNameSet, onChanged, scope]);

  return (
    <section className="rounded-2xl border border-border/60 bg-background/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {scope === "case" ? "Cases scope" : "Finance scope"}
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {rows.length ? (
          rows.map((row) => {
            const isLocked = lockedFieldNameSet.has(
              row.originalName.trim().toLowerCase(),
            );

            return (
              <div
                key={row.originalName}
                className="grid gap-3 rounded-xl border border-border/60 bg-muted/30 p-3 lg:grid-cols-[minmax(0,1.1fr)_12rem_minmax(0,1.2fr)_auto_auto]"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label>Field name</Label>
                    {isLocked ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-primary">
                        Locked
                      </span>
                    ) : null}
                  </div>
                  <Input
                    value={row.name}
                    disabled={isLocked}
                    onChange={(event) =>
                      handleRowChange(row.originalName, {
                        name: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select
                    value={row.type}
                    disabled={isLocked}
                    onValueChange={(value) =>
                      handleRowChange(row.originalName, {
                        type: value,
                        optionsText:
                          value.toLowerCase() === "dropdown"
                            ? row.optionsText
                            : "",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Text">Text</SelectItem>
                      <SelectItem value="Dropdown">Dropdown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Options</Label>
                  <Input
                    value={row.optionsText}
                    disabled={isLocked || row.type.toLowerCase() !== "dropdown"}
                    placeholder="Comma-separated values"
                    onChange={(event) =>
                      handleRowChange(row.originalName, {
                        optionsText: event.target.value,
                      })
                    }
                  />
                </div>
                <label className="flex items-end gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    disabled={isLocked}
                    onChange={(event) =>
                      handleRowChange(row.originalName, {
                        enabled: event.target.checked,
                      })
                    }
                    className="mb-2 h-4 w-4 rounded border border-input"
                  />
                  <span className="pb-1">Enabled</span>
                </label>
                <div className="flex items-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleSaveRow(row)}
                    disabled={isSaving || isLocked}
                  >
                    Save
                  </Button>
                </div>
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-border/60 px-4 py-5 text-sm text-muted-foreground">
            No custom fields in this scope yet.
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 p-4 lg:grid-cols-[minmax(0,1.1fr)_12rem_minmax(0,1.2fr)_auto]">
        <div className="space-y-1.5">
          <Label htmlFor={`${scope}-new-field-name`}>New field</Label>
          <Input
            id={`${scope}-new-field-name`}
            value={createName}
            placeholder="Field name"
            onChange={(event) => setCreateName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={createType} onValueChange={setCreateType}>
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Text">Text</SelectItem>
              <SelectItem value="Dropdown">Dropdown</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${scope}-new-field-options`}>Options</Label>
          <Input
            id={`${scope}-new-field-options`}
            value={createOptions}
            disabled={createType.toLowerCase() !== "dropdown"}
            placeholder="Comma-separated values"
            onChange={(event) => setCreateOptions(event.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isSaving}
          >
            Create field
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      ) : null}
      {message ? (
        <p className="mt-3 text-sm text-emerald-700">{message}</p>
      ) : null}
    </section>
  );
}
