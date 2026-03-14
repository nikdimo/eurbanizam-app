import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";
import { GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableProps<TData> = {
  id?: string;
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  columnGroups?: ColumnSettingsGroup[];
  onRowClick?: (row: TData) => void;
  emptyMessage?: string;
  onDensityChange?: (density: Density) => void;
  initialPageSize?: number;
  pageIndex?: number;
  pageSize?: number;
  totalRows?: number;
  manualPagination?: boolean;
  onPaginationChange?: (pagination: PaginationState) => void;
};

type Density = "comfortable" | "compact";

export type ColumnWidthOption = "auto" | "narrow" | "medium" | "wide";

export type ColumnSettingsGroup = {
  id: string;
  title: string;
  description?: string;
  columnIds: string[];
};

const TABLE_LAYOUT_VERSION = 2;
const LAYOUT_KEYS = [
  "columns",
  "columnOrder",
  "columnWidths",
  "density",
] as const;

function ensureLayoutVersion(id: string): boolean {
  if (typeof window === "undefined") return true;
  const versionKey = `table:${id}:layoutVersion`;
  const current = window.localStorage.getItem(versionKey);
  if (current === String(TABLE_LAYOUT_VERSION)) return true;
  LAYOUT_KEYS.forEach((suffix) =>
    window.localStorage.removeItem(`table:${id}:${suffix}`),
  );
  window.localStorage.setItem(versionKey, String(TABLE_LAYOUT_VERSION));
  return false;
}

function getWidthClass(option: ColumnWidthOption): string {
  switch (option) {
    case "narrow":
      return "w-[80px] min-w-[80px]";
    case "medium":
      return "w-[140px] min-w-[140px]";
    case "wide":
      return "w-[220px] min-w-[220px]";
    default:
      // Auto: at least fit header/cell content so columns don't overlap
      return "min-w-max";
  }
}

type TableInstance<TData = unknown> = ReturnType<typeof useReactTable<TData>>;
type LeafColumn<TData = unknown> =
  ReturnType<TableInstance<TData>["getAllLeafColumns"]>[number];

type ColumnSettingsSection<TData = unknown> = {
  id: string;
  title: string;
  description?: string;
  columns: LeafColumn<TData>[];
};

function getColumnLabel<TData>(column: LeafColumn<TData>): string {
  return typeof column.columnDef.header === "string"
    ? column.columnDef.header
    : column.id;
}

function getOrderedColumns<TData>(
  allColumns: LeafColumn<TData>[],
  columnOrder: string[],
): LeafColumn<TData>[] {
  const columnById = new Map(allColumns.map((column) => [column.id, column]));
  const knownIds = new Set(columnById.keys());
  const orderedIds = [
    ...columnOrder.filter((columnId) => knownIds.has(columnId)),
    ...allColumns
      .map((column) => column.id)
      .filter((columnId) => !columnOrder.includes(columnId)),
  ];

  return orderedIds
    .map((columnId) => columnById.get(columnId))
    .filter((column): column is LeafColumn<TData> => column != null);
}

function buildColumnSections<TData>(
  orderedColumns: LeafColumn<TData>[],
  columnGroups?: ColumnSettingsGroup[],
): ColumnSettingsSection<TData>[] {
  if (!columnGroups?.length) {
    return [
      {
        id: "all",
        title: "All Columns",
        description: "Show, hide, resize, and reorder the table layout.",
        columns: orderedColumns,
      },
    ];
  }

  const groupedIds = new Set(columnGroups.flatMap((group) => group.columnIds));
  const sections = columnGroups.map((group) => ({
    id: group.id,
    title: group.title,
    description: group.description,
    columns: orderedColumns.filter((column) => group.columnIds.includes(column.id)),
  }));

  const ungroupedColumns = orderedColumns.filter(
    (column) => !groupedIds.has(column.id),
  );
  if (ungroupedColumns.length) {
    sections.push({
      id: "other",
      title: "Other Columns",
      description: "Columns that are not assigned to a saved section.",
      columns: ungroupedColumns,
    });
  }

  return sections;
}

function ColumnSettingsPanel<TData>({
  table,
  tableId,
  columnVisibility,
  columnGroups,
  columnOrder,
  columnWidths,
  setColumnWidths,
  setColumnOrder,
}: {
  table: TableInstance<TData>;
  tableId?: string;
  columnVisibility: VisibilityState;
  columnGroups?: ColumnSettingsGroup[];
  columnOrder: string[];
  columnWidths: Record<string, ColumnWidthOption>;
  setColumnWidths: React.Dispatch<React.SetStateAction<Record<string, ColumnWidthOption>>>;
  setColumnOrder: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const [draggedColumn, setDraggedColumn] = React.useState<{
    columnId: string;
    sectionId: string;
  } | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{
    sectionId: string;
    index: number;
  } | null>(null);
  // Optimistic visibility so checkbox updates instantly; synced from props when they change
  const [optimisticVisibility, setOptimisticVisibility] =
    React.useState<VisibilityState | null>(null);

  React.useEffect(() => {
    setOptimisticVisibility(null);
  }, [columnVisibility]);

  const effectiveVisibility = optimisticVisibility ?? columnVisibility;
  const isVisible = (columnId: string) => effectiveVisibility[columnId] !== false;

  const allColumns = table.getAllLeafColumns();
  const orderedColumns = React.useMemo(
    () => getOrderedColumns(allColumns, columnOrder),
    [allColumns, columnOrder],
  );
  const sections = React.useMemo(
    () => buildColumnSections(orderedColumns, columnGroups),
    [columnGroups, orderedColumns],
  );

  const resetLayout = React.useCallback(() => {
    if (tableId && typeof window !== "undefined") {
      LAYOUT_KEYS.forEach((suffix) =>
        window.localStorage.removeItem(`table:${tableId}:${suffix}`),
      );
      window.localStorage.setItem(
        `table:${tableId}:layoutVersion`,
        String(TABLE_LAYOUT_VERSION),
      );
    }
    setColumnOrder(allColumns.map((column) => column.id));
    setColumnWidths({});
    allColumns.forEach((column) => {
      if (column.getCanHide()) {
        column.toggleVisibility(true);
      }
    });
  }, [allColumns, setColumnOrder, setColumnWidths, tableId]);

  const setAllVisible = React.useCallback(
    (visible: boolean) => {
      allColumns.forEach((column) => {
        if (column.getCanHide()) {
          column.toggleVisibility(visible);
        }
      });
    },
    [allColumns],
  );

  const setSectionVisible = React.useCallback(
    (section: ColumnSettingsSection<TData>, visible: boolean) => {
      section.columns.forEach((column) => {
        if (column.getCanHide()) {
          column.toggleVisibility(visible);
        }
      });
    },
    [],
  );

  const moveColumnWithinSection = React.useCallback(
    (sectionId: string, nextSectionColumnIds: string[]) => {
      const nextOrder = sections.flatMap((section) =>
        section.id === sectionId
          ? nextSectionColumnIds
          : section.columns.map((column) => column.id),
      );
      setColumnOrder(nextOrder);
    },
    [sections, setColumnOrder],
  );

  const handleDragStart = React.useCallback(
    (sectionId: string, columnId: string) => {
      setDraggedColumn({ sectionId, columnId });
    },
    [],
  );

  const handleDragOver = React.useCallback(
    (event: React.DragEvent, sectionId: string, index: number) => {
      if (draggedColumn?.sectionId !== sectionId) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropTarget({ sectionId, index });
    },
    [draggedColumn],
  );

  const handleDrop = React.useCallback(
    (event: React.DragEvent, section: ColumnSettingsSection<TData>, index: number) => {
      event.preventDefault();
      if (draggedColumn == null || draggedColumn.sectionId !== section.id) {
        setDropTarget(null);
        return;
      }

      const reordered = section.columns
        .map((column) => column.id)
        .filter((columnId) => columnId !== draggedColumn.columnId);
      reordered.splice(index, 0, draggedColumn.columnId);
      moveColumnWithinSection(section.id, reordered);
      setDraggedColumn(null);
      setDropTarget(null);
    },
    [draggedColumn, moveColumnWithinSection],
  );

  const handleDragEnd = React.useCallback(() => {
    setDraggedColumn(null);
    setDropTarget(null);
  }, []);

  const setWidth = React.useCallback(
    (columnId: string, option: ColumnWidthOption) => {
      setColumnWidths((current) =>
        option === "auto"
          ? (() => {
              const next = { ...current };
              delete next[columnId];
              return next;
            })()
          : { ...current, [columnId]: option },
      );
    },
    [setColumnWidths],
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-background via-background to-muted/20">
      <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <DialogTitle className="text-base font-semibold">
            Column Layout
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => setAllVisible(true)}
            >
              Show all
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => setAllVisible(false)}
            >
              Hide all
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={resetLayout}
            >
              Reset layout
            </Button>
          </div>
        </div>
      </DialogHeader>

      <div className="shrink-0 border-b border-border/50 bg-muted/30 px-6 py-2">
        <div className="flex flex-wrap gap-2">
          {sections.map((section) => {
            const visibleCount = section.columns.filter((column) =>
              isVisible(column.id),
            ).length;
            return (
              <div
                key={section.id}
                className="rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm"
              >
                <span className="font-medium text-foreground">
                  {section.title}
                </span>{" "}
                {visibleCount}/{section.columns.length} visible
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-4">
        <div
          className={cn(
            "grid min-h-0 flex-1 gap-6",
            sections.length > 1 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {sections.map((section) => {
            const visibleCount = section.columns.filter((column) =>
              isVisible(column.id),
            ).length;

            return (
              <section
                key={section.id}
                className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-background/90 shadow-sm"
              >
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      {section.title}
                    </h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {visibleCount}/{section.columns.length}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => setSectionVisible(section, true)}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => setSectionVisible(section, false)}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 overscroll-contain">
                  {section.columns.length ? (
                    <div className="space-y-2 pr-1">
                      {section.columns.map((column, index) => {
                        const widthOpt = columnWidths[column.id] ?? "auto";
                        const canHide = column.getCanHide();
                        const visible = isVisible(column.id);
                        const isDragging =
                          draggedColumn?.columnId === column.id;
                        const showDropLine =
                          dropTarget?.sectionId === section.id &&
                          dropTarget.index === index;

                        return (
                          <React.Fragment key={column.id}>
                            {showDropLine ? (
                              <div
                                className="rounded-2xl border-2 border-dashed border-primary/60 bg-primary/5 px-3 py-2 text-[11px] font-medium text-primary"
                                onDragOver={(event) =>
                                  handleDragOver(event, section.id, index)
                                }
                                onDrop={(event) =>
                                  handleDrop(event, section, index)
                                }
                              >
                                Drop here
                              </div>
                            ) : null}

                            <div
                              draggable
                              onDragStart={() =>
                                handleDragStart(section.id, column.id)
                              }
                              onDragOver={(event) =>
                                handleDragOver(event, section.id, index)
                              }
                              onDrop={(event) =>
                                handleDrop(event, section, index)
                              }
                              onDragEnd={handleDragEnd}
                              className={cn(
                                "flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 px-3 py-2.5 transition-colors",
                                isDragging && "opacity-50",
                                visible
                                  ? "border-border/70"
                                  : "border-dashed border-border/50 bg-background",
                              )}
                            >
                              <span
                                className="cursor-grab text-muted-foreground active:cursor-grabbing"
                                aria-hidden
                              >
                                <GripVertical className="h-4 w-4" />
                              </span>

                              <div className="min-w-[14rem] flex-1">
                                {canHide ? (
                                  <label className="flex cursor-pointer items-center gap-2">
                                    <input
                                      type="checkbox"
                                      className="h-3.5 w-3.5 rounded border-border text-primary"
                                      checked={visible}
                                      onChange={() => {
                                        setOptimisticVisibility((prev) => ({
                                          ...(prev ?? columnVisibility),
                                          [column.id]: !visible,
                                        }));
                                        column.toggleVisibility(!visible);
                                      }}
                                    />
                                    <span className="text-sm text-foreground">
                                      {getColumnLabel(column)}
                                    </span>
                                  </label>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-primary">
                                      Locked
                                    </span>
                                    <span className="text-sm text-foreground">
                                      {getColumnLabel(column)}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                  Width
                                </span>
                                <select
                                  className="h-8 rounded-xl border border-border bg-background px-2.5 text-xs text-foreground"
                                  value={widthOpt}
                                  onChange={(event) =>
                                    setWidth(
                                      column.id,
                                      event.target.value as ColumnWidthOption,
                                    )
                                  }
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <option value="auto">Auto</option>
                                  <option value="narrow">Narrow</option>
                                  <option value="medium">Medium</option>
                                  <option value="wide">Wide</option>
                                </select>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}

                      {draggedColumn?.sectionId === section.id ? (
                        <div
                          className={cn(
                            "rounded-2xl border-2 border-dashed px-3 py-2 text-[11px] font-medium",
                            dropTarget?.sectionId === section.id &&
                              dropTarget.index === section.columns.length
                              ? "border-primary/60 bg-primary/5 text-primary"
                              : "border-border/60 text-muted-foreground",
                          )}
                          onDragOver={(event) =>
                            handleDragOver(
                              event,
                              section.id,
                              section.columns.length,
                            )
                          }
                          onDrop={(event) =>
                            handleDrop(event, section, section.columns.length)
                          }
                        >
                          Move to end of section
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                      No columns in this section.
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function DataTable<TData>({
  id,
  columns,
  data,
  columnGroups,
  onRowClick,
  emptyMessage = "No records found.",
  onDensityChange,
  initialPageSize = 10,
  pageIndex,
  pageSize,
  totalRows,
  manualPagination = false,
  onPaginationChange,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  });
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(() => {
      if (!id || typeof window === "undefined") return {};
      if (!ensureLayoutVersion(id)) return {};
      try {
        const stored = window.localStorage.getItem(`table:${id}:columns`);
        return stored ? (JSON.parse(stored) as VisibilityState) : {};
      } catch {
        return {};
      }
    });
  const [columnOrder, setColumnOrder] = React.useState<string[]>(() => {
    if (!id || typeof window === "undefined") return [];
    if (!ensureLayoutVersion(id)) return [];
    try {
      const stored = window.localStorage.getItem(`table:${id}:columnOrder`);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [columnWidths, setColumnWidths] = React.useState<
    Record<string, ColumnWidthOption>
  >(() => {
    if (!id || typeof window === "undefined") return {};
    if (!ensureLayoutVersion(id)) return {};
    try {
      const stored = window.localStorage.getItem(`table:${id}:columnWidths`);
      return stored
        ? (JSON.parse(stored) as Record<string, ColumnWidthOption>)
        : {};
    } catch {
      return {};
    }
  });
  const [density, setDensity] = React.useState<Density>(() => {
    if (!id || typeof window === "undefined") return "comfortable";
    if (!ensureLayoutVersion(id)) return "comfortable";
    const stored = window.localStorage.getItem(
      `table:${id}:density`,
    ) as Density | null;
    return stored ?? "comfortable";
  });

  React.useEffect(() => {
    if (!id) {
      return;
    }
    window.localStorage.setItem(`table:${id}:density`, density);
    onDensityChange?.(density);
  }, [density, id, onDensityChange]);

  React.useEffect(() => {
    if (!id) {
      return;
    }
    window.localStorage.setItem(
      `table:${id}:columns`,
      JSON.stringify(columnVisibility),
    );
  }, [columnVisibility, id]);

  React.useEffect(() => {
    if (!id || columnOrder.length === 0) {
      return;
    }
    window.localStorage.setItem(
      `table:${id}:columnOrder`,
      JSON.stringify(columnOrder),
    );
  }, [columnOrder, id]);

  React.useEffect(() => {
    if (!id) {
      return;
    }
    window.localStorage.setItem(
      `table:${id}:columnWidths`,
      JSON.stringify(columnWidths),
    );
  }, [columnWidths, id]);

  React.useEffect(() => {
    if (!manualPagination) {
      return;
    }

    setPagination({
      pageIndex: pageIndex ?? 0,
      pageSize: pageSize ?? initialPageSize,
    });
  }, [initialPageSize, manualPagination, pageIndex, pageSize]);

  // TanStack Table uses mutable internals that the React Compiler flags as incompatible.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility, columnOrder, pagination },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: (updater) => {
      const nextOrder =
        typeof updater === "function" ? updater(columnOrder) : updater;
      setColumnOrder(nextOrder);
    },
    onPaginationChange: (updater) => {
      const nextPagination =
        typeof updater === "function" ? updater(pagination) : updater;
      setPagination(nextPagination);
      onPaginationChange?.(nextPagination);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageIndex: 0, pageSize: initialPageSize },
    },
    manualPagination,
    pageCount:
      manualPagination && totalRows != null
        ? Math.max(1, Math.ceil(totalRows / Math.max(pagination.pageSize, 1)))
        : undefined,
  });

  const [focusedRowIndex, setFocusedRowIndex] =
    React.useState<number | null>(null);

  const rows = table.getRowModel().rows;
  const activePageSize = manualPagination
    ? pageSize ?? pagination.pageSize
    : pagination.pageSize;
  const activePageIndex = manualPagination
    ? pageIndex ?? pagination.pageIndex
    : pagination.pageIndex;
  const resolvedTotalRows = manualPagination ? totalRows ?? data.length : rows.length;
  const pageCount = Math.max(
    1,
    Math.ceil(resolvedTotalRows / Math.max(activePageSize, 1)),
  );

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (
    event,
  ) => {
    if (!rows.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocusedRowIndex((current) => {
        const next = current === null ? 0 : Math.min(current + 1, rows.length - 1);
        return next;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocusedRowIndex((current) => {
        const next = current === null ? rows.length - 1 : Math.max(current - 1, 0);
        return next;
      });
      return;
    }

    if (event.key === "Enter" && onRowClick != null && focusedRowIndex != null) {
      const row = rows[focusedRowIndex];
      if (row) {
        onRowClick(row.original);
      }
    }
  };

  return (
    <div className="w-full min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <div className="flex flex-wrap items-center gap-3">
          <span>{rows.length} visible</span>
          <span>
            Showing{" "}
            {resolvedTotalRows === 0
              ? 0
              : activePageIndex * activePageSize + 1}
            -
            {Math.min(
              resolvedTotalRows,
              activePageIndex * activePageSize + rows.length,
            )}{" "}
            of {resolvedTotalRows}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="xs">
                <span className="text-[11px] uppercase tracking-wide">
                  Columns
                </span>
              </Button>
            </DialogTrigger>
            <DialogContent
              className={cn(
                "flex h-[90vh] max-h-[90vh] min-w-[88vw] w-[88vw] flex-col overflow-hidden p-0 text-xs",
                "!max-w-[85rem]",
                columnGroups?.length ? "sm:min-w-[70rem]" : "sm:min-w-[40rem]",
              )}
            >
              <ColumnSettingsPanel
                table={table}
                tableId={id}
                columnVisibility={columnVisibility}
                columnGroups={columnGroups}
                columnOrder={columnOrder}
                columnWidths={columnWidths}
                setColumnWidths={setColumnWidths}
                setColumnOrder={setColumnOrder}
              />
            </DialogContent>
          </Dialog>

          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide">
              Density
            </span>
            <Button
              type="button"
              variant={density === "comfortable" ? "outline" : "ghost"}
              size="xs"
              onClick={() => setDensity("comfortable")}
            >
              Default
            </Button>
            <Button
              type="button"
              variant={density === "compact" ? "outline" : "ghost"}
              size="xs"
              onClick={() => setDensity("compact")}
            >
              Compact
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide">
                Rows
              </span>
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                value={activePageSize}
                onChange={(event) => {
                  table.setPageSize(Number(event.target.value));
                  table.setPageIndex(0);
                }}
              >
                {[25, 50, 100, 200].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={activePageIndex <= 0}
              onClick={() => table.previousPage()}
            >
              Previous
            </Button>
            <span>
              Page {Math.min(activePageIndex + 1, pageCount)} / {pageCount}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={activePageIndex + 1 >= pageCount}
              onClick={() => table.nextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <div className="w-full min-w-0">
        <div
          className={cn(
            "min-w-0 overflow-hidden rounded-2xl border bg-background/80",
            density === "compact" ? "text-xs" : "text-sm",
          )}
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <Table className="w-full min-w-max table-auto">
            <TableHeader className="bg-muted/60">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    if (header.isPlaceholder) {
                      return <TableHead key={header.id}>{header.column.id}</TableHead>;
                    }

                    const canSort = header.column.getCanSort();
                    const sortDirection = header.column.getIsSorted();
                    const columnMeta = header.column.columnDef.meta as
                      | { className?: string }
                      | undefined;
                    const widthOpt = columnWidths[header.column.id] ?? "auto";
                    const widthClass = getWidthClass(widthOpt);

                    return (
                      <TableHead
                        key={header.id}
                        className={cn(
                          "whitespace-nowrap",
                          widthClass || columnMeta?.className,
                          canSort && "cursor-pointer select-none",
                        )}
                        onClick={
                          canSort
                            ? header.column.getToggleSortingHandler()
                            : undefined
                        }
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {sortDirection === "asc" ? (
                            <span className="text-[10px] text-muted-foreground">
                              ^
                            </span>
                          ) : null}
                          {sortDirection === "desc" ? (
                            <span className="text-[10px] text-muted-foreground">
                              v
                            </span>
                          ) : null}
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      onRowClick && "cursor-pointer",
                      focusedRowIndex === index &&
                        "bg-muted/60 ring-1 ring-primary/40",
                    )}
                    onClick={
                      onRowClick ? () => onRowClick(row.original) : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => {
                      const cellWidthOpt = columnWidths[cell.column.id] ?? "auto";
                      const widthClass = getWidthClass(cellWidthOpt);
                      const shouldTruncate = cellWidthOpt !== "auto";

                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "min-w-0 px-3",
                            widthClass,
                            density === "compact" ? "py-1.5" : "py-2.5",
                          )}
                        >
                          <div
                            className={cn(
                              "min-w-0",
                              shouldTruncate && "truncate",
                              !shouldTruncate && density === "compact"
                                ? "overflow-hidden text-ellipsis whitespace-nowrap"
                                : !shouldTruncate && "whitespace-normal break-words",
                            )}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
