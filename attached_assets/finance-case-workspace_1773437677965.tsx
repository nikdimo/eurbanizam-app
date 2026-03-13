"use client";

import * as React from "react";
import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  BanknoteIcon,
  Clock3Icon,
  CreditCardIcon,
  FileTextIcon,
  MailIcon,
  RefreshCwIcon,
  SaveIcon,
  SparklesIcon,
  Trash2Icon,
  WalletIcon,
} from "lucide-react";

import { PageContainer, PageHeader } from "@/components/layout/PagePrimitives";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import {
  FinanceCaseDetail,
  FinanceCaseDetailSchema,
  FinanceSettings,
  FinanceSettingsSchema,
} from "@/lib/schemas";
import { cn } from "@/lib/utils";

type WorkspaceTab =
  | "overview"
  | "payments"
  | "invoices"
  | "communication"
  | "activity";

type FinanceInvoice = FinanceCaseDetail["invoices"][number];
type FinancePayment = FinanceCaseDetail["payments"][number];

type ProfileDraft = {
  client_name: string;
  client_phone: string;
  service_type: string;
  finance_date: string;
  contract_sum: string;
  currency: string;
  due_date: string;
  finance_status: string;
  notes: string;
};

type ContactDraft = {
  phone: string;
  customFields: Record<string, string>;
};

type PaymentDraft = {
  payment_date: string;
  amount: string;
  currency: string;
  note: string;
};

type InvoiceDraft = {
  invoice_number: string;
  issue_date: string;
  due_date: string;
  amount: string;
  currency: string;
  status: string;
  client_name: string;
  client_email: string;
  client_address: string;
  service_description: string;
  items_json: string;
  reminders_enabled: string;
  reminder_first_after_days: string;
  reminder_repeat_days: string;
  reminder_max_count: string;
};

type MessageMode = "invoice" | "reminder";

type MessageDraft = {
  to_email: string;
  subject: string;
  body: string;
};

type SettingsDraft = {
  company_name: string;
  company_address: string;
  company_city: string;
  company_tax_number: string;
  company_bank_name: string;
  company_bank_account: string;
  company_iban: string;
  company_email: string;
  company_phone: string;
  smtp_host: string;
  smtp_port: string;
  smtp_username: string;
  smtp_password: string;
  smtp_use_tls: string;
  smtp_from_email: string;
  smtp_bcc: string;
  default_currency: string;
  invoice_email_subject_template: string;
  invoice_email_body_template: string;
  reminder_email_subject_template: string;
  reminder_email_body_template: string;
};

type MailResult = {
  ok?: boolean;
  dry_run?: boolean;
  message?: string;
  error?: string;
  to_email?: string;
  subject?: string;
  attachment_filename?: string | null;
  attachment_size_bytes?: number | null;
  pdf_generated?: boolean;
  reminder_sequence?: number | null;
};

type TimelineItem = {
  id: string;
  timestamp: string | null | undefined;
  title: string;
  description: string;
  tone: "default" | "warning" | "success";
};

type Recommendation = {
  title: string;
  description: string;
  tab: WorkspaceTab;
  intent: "payment" | "invoice" | "reminder" | "contact" | "review";
  tone: "warning" | "default" | "success";
};

const WORKSPACE_TABS: Array<{
  value: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "overview", label: "Overview", icon: SparklesIcon },
  { value: "payments", label: "Payments", icon: WalletIcon },
  { value: "invoices", label: "Invoices", icon: FileTextIcon },
  { value: "communication", label: "Communication", icon: MailIcon },
  { value: "activity", label: "Activity", icon: Clock3Icon },
];

const FINANCE_STATUS_OPTIONS = [
  "GRAY",
  "GREEN",
  "YELLOW",
  "RED",
  "PENDING",
  "PAID",
] as const;

const INVOICE_STATUS_OPTIONS = ["DRAFT", "SENT", "PAID", "CANCELLED"] as const;
const COMMON_CURRENCIES = ["MKD", "EUR", "USD", "GBP"] as const;

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseDateValue(value?: string | null): Date | null {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const normalized = text.includes("T") ? text : `${text}T00:00:00`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function displayText(value?: string | null, fallback = "-"): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatDate(value?: string | null): string {
  const parsed = parseDateValue(value);
  return parsed ? parsed.toLocaleDateString() : "-";
}

function formatDateTime(value?: string | null): string {
  const parsed = parseDateValue(value);
  return parsed ? parsed.toLocaleString() : "-";
}

function formatMoney(value?: number | null, currency?: string | null): string {
  const amount = Number(value ?? 0);
  const code = String(currency ?? "").trim().toUpperCase();
  if (code.length === 3) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${code}`;
    }
  }

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatStorageSize(value?: number | null): string {
  const size = Number(value ?? 0);
  if (!size) {
    return "-";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  return `${(size / 1024).toFixed(1)} KB`;
}

function toNumber(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
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

function getCustomFieldValue(detail: FinanceCaseDetail, name: string): string {
  return String(detail.custom_fields?.[name] ?? "").trim();
}

function getPreferredEmail(
  detail: FinanceCaseDetail,
  invoice?: FinanceInvoice | null,
): string {
  return (
    mergeUniqueValues([
      invoice?.client_email,
      getCustomFieldValue(detail, "email"),
      detail.recipients[0]?.email,
      detail.invoices[0]?.client_email,
    ])[0] ?? ""
  );
}

function getPreferredName(
  detail: FinanceCaseDetail,
  invoice?: FinanceInvoice | null,
): string {
  return (
    mergeUniqueValues([
      invoice?.client_name,
      detail.client_name,
      getCustomFieldValue(detail, "Name / Last name"),
      detail.title,
    ])[0] ?? ""
  );
}

function getCurrencyOptions(
  detail?: FinanceCaseDetail | null,
  settings?: FinanceSettings | null,
): string[] {
  return mergeUniqueValues([
    detail?.currency,
    settings?.default_currency,
    ...COMMON_CURRENCIES,
  ]);
}

function isInvoiceClosed(invoice: FinanceInvoice): boolean {
  const status = String(invoice.status ?? "").trim().toUpperCase();
  return status === "PAID" || status === "CANCELLED";
}

function isInvoiceOverdue(invoice: FinanceInvoice): boolean {
  if (isInvoiceClosed(invoice)) {
    return false;
  }
  const dueDate = parseDateValue(invoice.due_date);
  const today = parseDateValue(todayString());
  if (!dueDate || !today) {
    return false;
  }
  return dueDate.getTime() < today.getTime();
}

function renderTemplate(template: string, invoice: FinanceInvoice): string {
  const values: Record<string, string> = {
    invoice_number:
      String(invoice.invoice_number ?? "").trim() || String(invoice.invoice_id),
    invoice_id: String(invoice.invoice_id),
    case_id: invoice.case_id,
    amount: Number(invoice.amount ?? 0).toFixed(2),
    currency: String(invoice.currency ?? "MKD").trim() || "MKD",
    due_date: String(invoice.due_date ?? "").trim(),
    issue_date: String(invoice.issue_date ?? "").trim(),
    client_name: String(invoice.client_name ?? "").trim(),
    client_email: String(invoice.client_email ?? "").trim(),
    service_description: String(invoice.service_description ?? "").trim(),
  };

  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

function defaultInvoiceSubject(invoice: FinanceInvoice): string {
  const label =
    String(invoice.invoice_number ?? "").trim() || String(invoice.invoice_id);
  return `Invoice ${label} for case ${invoice.case_id}`;
}

function defaultInvoiceBody(
  invoice: FinanceInvoice,
  settings?: FinanceSettings | null,
): string {
  const template = String(settings?.invoice_email_body_template ?? "").trim();
  if (template) {
    return renderTemplate(template, invoice);
  }

  const lines = [
    `Please find attached invoice ${
      String(invoice.invoice_number ?? "").trim() || invoice.invoice_id
    } for case ${invoice.case_id}.`,
    `Amount: ${Number(invoice.amount ?? 0).toFixed(2)} ${
      invoice.currency || "MKD"
    }`,
  ];
  if (invoice.issue_date) {
    lines.push(`Issue date: ${invoice.issue_date}`);
  }
  if (invoice.due_date) {
    lines.push(`Due date: ${invoice.due_date}`);
  }
  return lines.join("\n");
}

function defaultReminderSubject(
  invoice: FinanceInvoice,
  settings?: FinanceSettings | null,
): string {
  const template = String(settings?.reminder_email_subject_template ?? "").trim();
  if (template) {
    return renderTemplate(template, invoice);
  }
  return `Payment reminder for invoice ${
    String(invoice.invoice_number ?? "").trim() || invoice.invoice_id
  }`;
}

function defaultReminderBody(
  invoice: FinanceInvoice,
  settings?: FinanceSettings | null,
): string {
  const template = String(settings?.reminder_email_body_template ?? "").trim();
  if (template) {
    return renderTemplate(template, invoice);
  }

  const lines = [
    `Hello ${String(invoice.client_name ?? "").trim()},`.trim(),
    "",
    "This is a reminder that the invoice below is overdue.",
    `Invoice: ${
      String(invoice.invoice_number ?? "").trim() || invoice.invoice_id
    }`,
    `Case: ${invoice.case_id}`,
    `Amount: ${Number(invoice.amount ?? 0).toFixed(2)} ${
      invoice.currency || "MKD"
    }`,
  ];
  if (invoice.due_date) {
    lines.push(`Due date: ${invoice.due_date}`);
  }
  lines.push("");
  lines.push("If payment has already been made, please disregard this reminder.");
  return lines.join("\n");
}

function buildProfileDraft(detail: FinanceCaseDetail): ProfileDraft {
  return {
    client_name: String(detail.client_name ?? ""),
    client_phone: String(detail.client_phone ?? ""),
    service_type: String(detail.service_type ?? ""),
    finance_date: String(detail.finance_date ?? ""),
    contract_sum: String(detail.contract_sum ?? 0),
    currency: String(detail.currency ?? "MKD"),
    due_date: String(detail.due_date ?? ""),
    finance_status: String(detail.finance_status ?? "GRAY"),
    notes: String(detail.notes ?? ""),
  };
}

function buildContactDraft(detail: FinanceCaseDetail): ContactDraft {
  const customFields = Object.fromEntries(
    Object.entries(detail.custom_fields ?? {}).map(([key, value]) => [
      key,
      String(value ?? ""),
    ]),
  );

  if (!Object.prototype.hasOwnProperty.call(customFields, "email")) {
    customFields.email = getPreferredEmail(detail);
  }
  if (
    !Object.prototype.hasOwnProperty.call(customFields, "Name / Last name") &&
    detail.client_name
  ) {
    customFields["Name / Last name"] = detail.client_name;
  }

  return {
    phone: String(detail.phone ?? ""),
    customFields,
  };
}

function buildPaymentDraft(
  detail: FinanceCaseDetail,
  settings?: FinanceSettings | null,
): PaymentDraft {
  return {
    payment_date: todayString(),
    amount:
      detail.remaining > 0
        ? String(detail.remaining)
        : String(detail.contract_sum ?? 0),
    currency:
      String(detail.currency ?? settings?.default_currency ?? "MKD").trim() ||
      "MKD",
    note: "",
  };
}

function buildNewInvoiceDraft(
  detail: FinanceCaseDetail,
  settings?: FinanceSettings | null,
  sourceInvoice?: FinanceInvoice | null,
): InvoiceDraft {
  return {
    invoice_number: "",
    issue_date: todayString(),
    due_date:
      String(
        sourceInvoice?.due_date ?? detail.due_date ?? detail.finance_date ?? "",
      ) || "",
    amount: String(
      sourceInvoice?.amount ??
        (detail.remaining > 0 ? detail.remaining : detail.contract_sum),
    ),
    currency:
      String(
        sourceInvoice?.currency ?? detail.currency ?? settings?.default_currency,
      ).trim() || "MKD",
    status: "DRAFT",
    client_name: getPreferredName(detail, sourceInvoice),
    client_email: getPreferredEmail(detail, sourceInvoice),
    client_address: String(sourceInvoice?.client_address ?? ""),
    service_description:
      String(sourceInvoice?.service_description ?? "").trim() ||
      String(detail.service_type ?? "").trim() ||
      String(detail.title ?? "").trim(),
    items_json: String(sourceInvoice?.items_json ?? ""),
    reminders_enabled: String(sourceInvoice?.reminders_enabled ?? 1),
    reminder_first_after_days: String(
      sourceInvoice?.reminder_first_after_days ?? 3,
    ),
    reminder_repeat_days: String(sourceInvoice?.reminder_repeat_days ?? 7),
    reminder_max_count: String(sourceInvoice?.reminder_max_count ?? 3),
  };
}

function buildExistingInvoiceDraft(invoice: FinanceInvoice): InvoiceDraft {
  return {
    invoice_number: String(invoice.invoice_number ?? ""),
    issue_date: String(invoice.issue_date ?? ""),
    due_date: String(invoice.due_date ?? ""),
    amount: String(invoice.amount ?? 0),
    currency: String(invoice.currency ?? "MKD"),
    status: String(invoice.status ?? "DRAFT"),
    client_name: String(invoice.client_name ?? ""),
    client_email: String(invoice.client_email ?? ""),
    client_address: String(invoice.client_address ?? ""),
    service_description: String(invoice.service_description ?? ""),
    items_json: String(invoice.items_json ?? ""),
    reminders_enabled: String(invoice.reminders_enabled ?? 0),
    reminder_first_after_days: String(invoice.reminder_first_after_days ?? 3),
    reminder_repeat_days: String(invoice.reminder_repeat_days ?? 7),
    reminder_max_count: String(invoice.reminder_max_count ?? 3),
  };
}

function buildMessageDraft(
  mode: MessageMode,
  detail: FinanceCaseDetail,
  invoice: FinanceInvoice,
  settings?: FinanceSettings | null,
): MessageDraft {
  return {
    to_email: getPreferredEmail(detail, invoice),
    subject:
      mode === "invoice"
        ? String(settings?.invoice_email_subject_template ?? "").trim()
          ? renderTemplate(
              String(settings?.invoice_email_subject_template ?? ""),
              invoice,
            )
          : defaultInvoiceSubject(invoice)
        : defaultReminderSubject(invoice, settings),
    body:
      mode === "invoice"
        ? defaultInvoiceBody(invoice, settings)
        : defaultReminderBody(invoice, settings),
  };
}

function buildSettingsDraft(settings?: FinanceSettings | null): SettingsDraft {
  return {
    company_name: String(settings?.company_name ?? ""),
    company_address: String(settings?.company_address ?? ""),
    company_city: String(settings?.company_city ?? ""),
    company_tax_number: String(settings?.company_tax_number ?? ""),
    company_bank_name: String(settings?.company_bank_name ?? ""),
    company_bank_account: String(settings?.company_bank_account ?? ""),
    company_iban: String(settings?.company_iban ?? ""),
    company_email: String(settings?.company_email ?? ""),
    company_phone: String(settings?.company_phone ?? ""),
    smtp_host: String(settings?.smtp_host ?? ""),
    smtp_port: settings?.smtp_port == null ? "" : String(settings.smtp_port),
    smtp_username: String(settings?.smtp_username ?? ""),
    smtp_password: String(settings?.smtp_password ?? ""),
    smtp_use_tls: settings?.smtp_use_tls === false ? "false" : "true",
    smtp_from_email: String(settings?.smtp_from_email ?? ""),
    smtp_bcc: String(settings?.smtp_bcc ?? ""),
    default_currency: String(settings?.default_currency ?? ""),
    invoice_email_subject_template: String(
      settings?.invoice_email_subject_template ?? "",
    ),
    invoice_email_body_template: String(
      settings?.invoice_email_body_template ?? "",
    ),
    reminder_email_subject_template: String(
      settings?.reminder_email_subject_template ?? "",
    ),
    reminder_email_body_template: String(
      settings?.reminder_email_body_template ?? "",
    ),
  };
}

function buildRecommendation(detail: FinanceCaseDetail): Recommendation {
  const overdueInvoices = detail.invoices.filter((invoice) =>
    isInvoiceOverdue(invoice),
  );
  if (overdueInvoices.length > 0) {
    return {
      title: "Follow up on overdue money",
      description: `${overdueInvoices.length} invoice(s) are overdue. Queue a reminder while the payment context is fresh.`,
      tab: "communication",
      intent: "reminder",
      tone: "warning",
    };
  }

  if (detail.remaining > 0 && detail.invoices.length === 0) {
    return {
      title: "Create the first invoice",
      description: "There is contract value tracked here, but no invoice exists yet.",
      tab: "invoices",
      intent: "invoice",
      tone: "default",
    };
  }

  if (detail.remaining > 0 && detail.payments.length === 0) {
    return {
      title: "Capture payment progress",
      description: "Outstanding balance is still open and no payments have been logged.",
      tab: "payments",
      intent: "payment",
      tone: "default",
    };
  }

  if (!getPreferredEmail(detail)) {
    return {
      title: "Store a reusable contact email",
      description: "Save the client email once so invoice and reminder drafts stop asking for it.",
      tab: "overview",
      intent: "contact",
      tone: "warning",
    };
  }

  if (detail.contract_sum > 0 && detail.remaining <= 0) {
    return {
      title: "Case is financially settled",
      description: "Everything due on this case appears collected. Keep the activity trail clean and up to date.",
      tab: "activity",
      intent: "review",
      tone: "success",
    };
  }

  return {
    title: "Keep the record current",
    description: "Review the workspace, confirm automation settings, and tighten the next handoff.",
    tab: "overview",
    intent: "review",
    tone: "default",
  };
}

function buildTimeline(detail: FinanceCaseDetail): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const payment of detail.payments) {
    items.push({
      id: `payment-${payment.payment_id}`,
      timestamp: payment.payment_date ?? payment.created_at,
      title: "Payment recorded",
      description: `${formatMoney(payment.amount, payment.currency)} ${
        payment.note ? `· ${payment.note}` : "captured in ledger"
      }`,
      tone: "success",
    });
  }

  for (const invoice of detail.invoices) {
    const status = String(invoice.status ?? "").trim().toUpperCase();
    items.push({
      id: `invoice-${invoice.invoice_id}`,
      timestamp: invoice.updated_at ?? invoice.issue_date,
      title:
        status === "PAID"
          ? "Invoice marked paid"
          : status === "SENT"
            ? "Invoice sent"
            : "Invoice updated",
      description: `${
        String(invoice.invoice_number ?? "").trim() || `#${invoice.invoice_id}`
      } · ${formatMoney(invoice.amount, invoice.currency)}`,
      tone:
        status === "PAID"
          ? "success"
          : status === "CANCELLED"
            ? "warning"
            : "default",
    });
  }

  for (const email of detail.email_log) {
    items.push({
      id: `email-${email.log_id}`,
      timestamp: email.sent_at ?? email.created_at,
      title:
        String(email.email_type ?? "").trim().toLowerCase() === "reminder"
          ? "Reminder sent"
          : "Invoice email sent",
      description: `${displayText(email.to_email)} · ${displayText(email.subject)}`,
      tone:
        String(email.email_type ?? "").trim().toLowerCase() === "reminder"
          ? "warning"
          : "default",
    });
  }

  if (detail.updated_at) {
    items.push({
      id: "case-updated",
      timestamp: detail.updated_at,
      title: "Finance record updated",
      description: `Finance status ${displayText(detail.finance_status)} · balance ${formatMoney(
        detail.remaining,
        detail.currency,
      )}`,
      tone: "default",
    });
  }

  return items.sort((left, right) => {
    const leftDate = parseDateValue(left.timestamp)?.getTime() ?? 0;
    const rightDate = parseDateValue(right.timestamp)?.getTime() ?? 0;
    return rightDate - leftDate;
  });
}

function getToneClasses(tone: Recommendation["tone"] | TimelineItem["tone"]): string {
  if (tone === "warning") {
    return "border-amber-200/80 bg-amber-50/80 text-amber-900";
  }
  if (tone === "success") {
    return "border-emerald-200/80 bg-emerald-50/80 text-emerald-900";
  }
  return "border-sky-200/80 bg-sky-50/80 text-sky-900";
}

function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border border-border/60 bg-background/85", className)}>
      <CardHeader className="border-b border-border/50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function InsightItem({
  title,
  description,
  tone = "default",
}: {
  title: string;
  description: string;
  tone?: Recommendation["tone"];
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-3 text-sm",
        getToneClasses(tone),
      )}
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs opacity-80">{description}</p>
    </div>
  );
}

function TabButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary/30 bg-primary text-primary-foreground shadow-sm"
          : "border-border/70 bg-background/70 text-muted-foreground hover:bg-muted",
      )}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </button>
  );
}

function NoticeBanner({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm",
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-red-200 bg-red-50 text-red-800",
      )}
    >
      {children}
    </div>
  );
}

export function FinanceCaseWorkspace({ caseId }: { caseId: string }) {
  const [data, setData] = React.useState<FinanceCaseDetail | null>(null);
  const [settings, setSettings] = React.useState<FinanceSettings | null>(null);
  const [activeTab, setActiveTab] = React.useState<WorkspaceTab>("overview");
  const [profileDraft, setProfileDraft] = React.useState<ProfileDraft>({
    client_name: "",
    client_phone: "",
    service_type: "",
    finance_date: "",
    contract_sum: "0",
    currency: "MKD",
    due_date: "",
    finance_status: "GRAY",
    notes: "",
  });
  const [contactDraft, setContactDraft] = React.useState<ContactDraft>({
    phone: "",
    customFields: {},
  });
  const [paymentDraft, setPaymentDraft] = React.useState<PaymentDraft>({
    payment_date: todayString(),
    amount: "0",
    currency: "MKD",
    note: "",
  });
  const [invoiceDraft, setInvoiceDraft] = React.useState<InvoiceDraft>({
    invoice_number: "",
    issue_date: todayString(),
    due_date: "",
    amount: "0",
    currency: "MKD",
    status: "DRAFT",
    client_name: "",
    client_email: "",
    client_address: "",
    service_description: "",
    items_json: "",
    reminders_enabled: "1",
    reminder_first_after_days: "3",
    reminder_repeat_days: "7",
    reminder_max_count: "3",
  });
  const [messageDraft, setMessageDraft] = React.useState<MessageDraft>({
    to_email: "",
    subject: "",
    body: "",
  });
  const [settingsDraft, setSettingsDraft] = React.useState<SettingsDraft>(
    buildSettingsDraft(null),
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState<number | null>(
    null,
  );
  const [editingInvoiceId, setEditingInvoiceId] = React.useState<number | null>(
    null,
  );
  const [messageMode, setMessageMode] = React.useState<MessageMode>("invoice");
  const [mailResult, setMailResult] = React.useState<MailResult | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [showSettingsEditor, setShowSettingsEditor] = React.useState(false);
  const [notice, setNotice] = React.useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const selectedInvoice =
    data?.invoices.find((invoice) => invoice.invoice_id === selectedInvoiceId) ??
    data?.invoices[0] ??
    null;
  const recommendation = data ? buildRecommendation(data) : null;
  const timeline = data ? buildTimeline(data) : [];
  const currencyOptions = getCurrencyOptions(data, settings);
  const preferredEmail = data ? getPreferredEmail(data, selectedInvoice) : "";
  const preferredName = data ? getPreferredName(data, selectedInvoice) : "";
  const overdueInvoices = data
    ? data.invoices.filter((invoice) => isInvoiceOverdue(invoice))
    : [];
  const needsReminder =
    overdueInvoices.find((invoice) => !isInvoiceClosed(invoice)) ?? null;

  React.useEffect(() => {
    async function loadWorkspace() {
      setIsLoading(true);
      setError(null);

      const [detailResponse, settingsResponse] = await Promise.all([
        apiClient.getParsed(
          `/api/finance/cases/${caseId}`,
          FinanceCaseDetailSchema,
        ),
        apiClient.getParsed("/api/finance/settings", FinanceSettingsSchema, {
          cache: "force-cache",
        }),
      ]);

      if (detailResponse.error || !detailResponse.data) {
        setError(detailResponse.error ?? "Finance case not found.");
        setData(null);
        setIsLoading(false);
        return;
      }

      const loadedDetail = detailResponse.data;
      const loadedSettings = settingsResponse.data ?? {};
      const initialInvoice = loadedDetail.invoices[0] ?? null;
      const initialMode = loadedDetail.invoices.some((invoice) =>
        isInvoiceOverdue(invoice),
      )
        ? "reminder"
        : "invoice";

      setData(loadedDetail);
      setSettings(loadedSettings);
      setProfileDraft(buildProfileDraft(loadedDetail));
      setContactDraft(buildContactDraft(loadedDetail));
      setPaymentDraft(buildPaymentDraft(loadedDetail, loadedSettings));
      setSettingsDraft(buildSettingsDraft(loadedSettings));
      setSelectedInvoiceId(initialInvoice?.invoice_id ?? null);
      setEditingInvoiceId(initialInvoice?.invoice_id ?? null);
      setInvoiceDraft(
        initialInvoice
          ? buildExistingInvoiceDraft(initialInvoice)
          : buildNewInvoiceDraft(loadedDetail, loadedSettings),
      );
      setMessageMode(initialMode);
      setMessageDraft(
        initialInvoice
          ? buildMessageDraft(
              initialMode,
              loadedDetail,
              initialInvoice,
              loadedSettings,
            )
          : {
              to_email: getPreferredEmail(loadedDetail),
              subject: "",
              body: "",
            },
      );
      setMailResult(null);
      setIsLoading(false);
    }

    void loadWorkspace();
  }, [caseId]);

  React.useEffect(() => {
    if (!data) {
      return;
    }

    setSelectedInvoiceId((current) => {
      if (
        current != null &&
        data.invoices.some((invoice) => invoice.invoice_id === current)
      ) {
        return current;
      }
      return data.invoices[0]?.invoice_id ?? null;
    });
  }, [data]);

  async function refreshCase(options?: {
    successMessage?: string;
    keepMailResult?: boolean;
  }) {
    const detailResponse = await apiClient.getParsed(
      `/api/finance/cases/${caseId}`,
      FinanceCaseDetailSchema,
    );
    if (detailResponse.error || !detailResponse.data) {
      setNotice({
        tone: "error",
        message: detailResponse.error ?? "Unable to refresh finance case.",
      });
      return false;
    }

    const refreshed = detailResponse.data;
    const refreshedSelected =
      refreshed.invoices.find((invoice) => invoice.invoice_id === selectedInvoiceId) ??
      refreshed.invoices[0] ??
      null;

    setData(refreshed);
    setProfileDraft(buildProfileDraft(refreshed));
    setContactDraft(buildContactDraft(refreshed));
    setPaymentDraft(buildPaymentDraft(refreshed, settings));
    setSelectedInvoiceId(refreshedSelected?.invoice_id ?? null);

    if (editingInvoiceId != null) {
      const refreshedEditing = refreshed.invoices.find(
        (invoice) => invoice.invoice_id === editingInvoiceId,
      );
      setEditingInvoiceId(refreshedEditing?.invoice_id ?? null);
      setInvoiceDraft(
        refreshedEditing
          ? buildExistingInvoiceDraft(refreshedEditing)
          : buildNewInvoiceDraft(refreshed, settings, refreshedSelected),
      );
    }

    if (!options?.keepMailResult) {
      setMailResult(null);
    }
    if (options?.successMessage) {
      setNotice({ tone: "success", message: options.successMessage });
    }
    return true;
  }

  function runRecommendationAction() {
    if (!data || !recommendation) {
      return;
    }

    setActiveTab(recommendation.tab);
    if (recommendation.intent === "invoice") {
      setEditingInvoiceId(null);
      setInvoiceDraft(buildNewInvoiceDraft(data, settings, selectedInvoice));
    }
    if (recommendation.intent === "reminder" && needsReminder) {
      setSelectedInvoiceId(needsReminder.invoice_id);
      setMessageMode("reminder");
      setMessageDraft(
        buildMessageDraft("reminder", data, needsReminder, settings),
      );
    }
  }

  function loadMessageDefaults(nextMode: MessageMode) {
    if (!data || !selectedInvoice) {
      return;
    }
    setMessageMode(nextMode);
    setMessageDraft(buildMessageDraft(nextMode, data, selectedInvoice, settings));
    setMailResult(null);
  }

  function prepareNewInvoice(sourceInvoice?: FinanceInvoice | null) {
    if (!data) {
      return;
    }
    setEditingInvoiceId(null);
    setInvoiceDraft(buildNewInvoiceDraft(data, settings, sourceInvoice));
    setActiveTab("invoices");
  }

  function prepareExistingInvoice(invoice: FinanceInvoice) {
    setEditingInvoiceId(invoice.invoice_id);
    setSelectedInvoiceId(invoice.invoice_id);
    setInvoiceDraft(buildExistingInvoiceDraft(invoice));
    setActiveTab("invoices");
  }

  async function handleProfileSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const contractSum = toNumber(profileDraft.contract_sum);
    if (contractSum == null) {
      setNotice({ tone: "error", message: "Contract sum must be a valid number." });
      return;
    }

    setBusyAction("save-profile");
    const response = await apiClient.put<unknown>(
      `/api/finance/cases/${caseId}/profile`,
      {
        client_name: profileDraft.client_name || null,
        client_phone: profileDraft.client_phone || null,
        service_type: profileDraft.service_type || null,
        finance_date: profileDraft.finance_date || null,
        contract_sum: contractSum,
        currency: profileDraft.currency || null,
        due_date: profileDraft.due_date || null,
        finance_status: profileDraft.finance_status || null,
        notes: profileDraft.notes || null,
      },
    );
    setBusyAction(null);

    if (response.error) {
      setNotice({ tone: "error", message: response.error });
      return;
    }

    const parsed = FinanceCaseDetailSchema.safeParse(response.data);
    if (!parsed.success) {
      setNotice({
        tone: "error",
        message: "Profile saved, but the response could not be parsed.",
      });
      return;
    }

    setData(parsed.data);
    setProfileDraft(buildProfileDraft(parsed.data));
    setContactDraft(buildContactDraft(parsed.data));
    setPaymentDraft(buildPaymentDraft(parsed.data, settings));
    setNotice({ tone: "success", message: "Finance profile updated." });
  }

  async function handleContactSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("save-contact");
    const response = await apiClient.patch<unknown>(
      `/api/finance/cases/${caseId}/overview`,
      {
        phone: contactDraft.phone || null,
        custom_fields: contactDraft.customFields,
      },
    );
    setBusyAction(null);

    if (response.error) {
      setNotice({ tone: "error", message: response.error });
      return;
    }

    const parsed = FinanceCaseDetailSchema.safeParse(response.data);
    if (!parsed.success) {
      setNotice({
        tone: "error",
        message: "Case memory saved, but the response could not be parsed.",
      });
      return;
    }

    setData(parsed.data);
    setContactDraft(buildContactDraft(parsed.data));
    setNotice({
      tone: "success",
      message: "Case memory updated. Future invoice drafts will reuse it.",
    });
  }

  async function handlePaymentCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = toNumber(paymentDraft.amount);
    if (amount == null || amount <= 0) {
      setNotice({ tone: "error", message: "Payment amount must be greater than 0." });
      return;
    }
    if (!paymentDraft.payment_date) {
      setNotice({ tone: "error", message: "Payment date is required." });
      return;
    }

    setBusyAction("create-payment");
    const response = await apiClient.post<unknown>(
      `/api/finance/cases/${caseId}/payments`,
      {
        payment_date: paymentDraft.payment_date,
        amount,
        currency: paymentDraft.currency || "MKD",
        note: paymentDraft.note || null,
      },
    );
    setBusyAction(null);

    if (response.error) {
      setNotice({ tone: "error", message: response.error });
      return;
    }

    const parsed = FinanceCaseDetailSchema.safeParse(response.data);
    if (!parsed.success) {
      setNotice({
        tone: "error",
        message: "Payment saved, but the response could not be parsed.",
      });
      return;
    }

    setData(parsed.data);
    setPaymentDraft(buildPaymentDraft(parsed.data, settings));
    setNotice({ tone: "success", message: "Payment recorded." });
  }

  async function handlePaymentDelete(payment: FinancePayment) {
    if (
      !window.confirm(
        `Delete payment ${formatMoney(payment.amount, payment.currency)} from ${formatDate(
          payment.payment_date,
        )}?`,
      )
    ) {
      return;
    }

    setBusyAction(`delete-payment-${payment.payment_id}`);
    const response = await apiClient.delete<unknown>(
      `/api/finance/payments/${payment.payment_id}`,
    );
    setBusyAction(null);

    if (response.error) {
      setNotice({ tone: "error", message: response.error });
      return;
    }

    const parsed = FinanceCaseDetailSchema.safeParse(response.data);
    if (!parsed.success) {
      setNotice({
        tone: "error",
        message: "Payment deleted, but the response could not be parsed.",
      });
      return;
    }

    setData(parsed.data);
    setPaymentDraft(buildPaymentDraft(parsed.data, settings));
    setNotice({ tone: "success", message: "Payment removed." });
  }

  async function handleInvoiceSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) {
      return;
    }

    const amount = toNumber(invoiceDraft.amount);
    if (amount == null || amount <= 0) {
      setNotice({ tone: "error", message: "Invoice amount must be greater than 0." });
      return;
    }

    setBusyAction("save-invoice");
    const payload = {
      invoice_number: invoiceDraft.invoice_number || null,
      issue_date: invoiceDraft.issue_date || null,
      due_date: invoiceDraft.due_date || null,
      amount,
      currency: invoiceDraft.currency || "MKD",
      status: invoiceDraft.status || "DRAFT",
      client_name: invoiceDraft.client_name || null,
      client_email: invoiceDraft.client_email || null,
      client_address: invoiceDraft.client_address || null,
      service_description: invoiceDraft.service_description || null,
      items_json: invoiceDraft.items_json || null,
      reminders_enabled: invoiceDraft.reminders_enabled === "1",
      reminder_first_after_days:
        Number(invoiceDraft.reminder_first_after_days || 0) || 0,
      reminder_repeat_days:
        Number(invoiceDraft.reminder_repeat_days || 0) || 0,
      reminder_max_count: Number(invoiceDraft.reminder_max_count || 0) || 0,
    };

    const response =
      editingInvoiceId == null
        ? await apiClient.post<unknown>(
            `/api/finance/cases/${caseId}/invoices`,
            payload,
          )
        : await apiClient.patch<unknown>(
            `/api/finance/invoices/${editingInvoiceId}`,
            payload,
          );
    setBusyAction(null);

    if (response.error) {
      setNotice({ tone: "error", message: response.error });
      return;
    }

    const raw =
      typeof response.data === "object" && response.data != null
        ? (response.data as { invoice_id?: number })
        : {};
    if (typeof raw.invoice_id === "number") {
      setSelectedInvoiceId(raw.invoice_id);
      setEditingInvoiceId(raw.invoice_id);
    }
    await refreshCase({
      successMessage:
        editingInvoiceId == null ? "Invoice created." : "Invoice updated.",
    });
  }

  async function handleInvoiceDelete(invoice: FinanceInvoice) {
    if (
      !window.confirm(
        `Delete invoice ${
          invoice.invoice_number || invoice.invoice_id
        }? This cannot be undone.`,
      )
    ) {
      return;
    }

    setBusyAction(`delete-invoice-${invoice.invoice_id}`);
    const response = await apiClient.delete<unknown>(
      `/api/finance/invoices/${invoice.invoice_id}`,
    );
    setBusyAction(null);

    if (response.error) {
      setNotice({ tone: "error", message: response.error });
      return;
    }

    if (editingInvoiceId === invoice.invoice_id) {
      setEditingInvoiceId(null);
    }
    await refreshCase({ successMessage: "Invoice deleted." });
  }

  async function handleMessageSend(dryRun: boolean) {
    if (!data || !selectedInvoice) {
      setNotice({
        tone: "error",
        message: "Select an invoice before sending email.",
      });
      return;
    }
    if (!messageDraft.to_email.trim()) {
      setNotice({ tone: "error", message: "Recipient email is required." });
      return;
    }

    const actionKey = dryRun ? "dry-run-email" : "send-email";
    setBusyAction(actionKey);
    const endpoint =
      messageMode === "invoice"
        ? `/api/finance/invoices/${selectedInvoice.invoice_id}/send-email`
        : `/api/finance/invoices/${selectedInvoice.invoice_id}/send-reminder`;
    const response = await apiClient.post<MailResult>(endpoint, {
      to_email: messageDraft.to_email,
      subject: messageDraft.subject,
      body: messageDraft.body,
      dry_run: dryRun,
    });
    setBusyAction(null);

    if (response.error || !response.data) {
      setNotice({
        tone: "error",
        message: response.error ?? "Unable to send email.",
      });
      return;
    }

    setMailResult(response.data);
    if (!response.data.ok) {
      setNotice({
        tone: "error",
        message: response.data.error ?? "Email sending failed.",
      });
      return;
    }

    if (dryRun) {
      setNotice({
        tone: "success",
        message: response.data.message ?? "Dry run completed.",
      });
      return;
    }

    await refreshCase({
      successMessage: response.data.message ?? "Email sent.",
      keepMailResult: true,
    });
  }

  async function handleSettingsSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyAction("save-settings");

    const response = await apiClient.patch<unknown>("/api/finance/settings", {
      company_name: settingsDraft.company_name || "",
      company_address: settingsDraft.company_address || "",
      company_city: settingsDraft.company_city || "",
      company_tax_number: settingsDraft.company_tax_number || "",
      company_bank_name: settingsDraft.company_bank_name || "",
      company_bank_account: settingsDraft.company_bank_account || "",
      company_iban: settingsDraft.company_iban || "",
      company_email: settingsDraft.company_email || "",
      company_phone: settingsDraft.company_phone || "",
      smtp_host: settingsDraft.smtp_host || "",
      smtp_port: settingsDraft.smtp_port
        ? Number(settingsDraft.smtp_port)
        : undefined,
      smtp_username: settingsDraft.smtp_username || "",
      smtp_password: settingsDraft.smtp_password || "",
      smtp_use_tls: settingsDraft.smtp_use_tls !== "false",
      smtp_from_email: settingsDraft.smtp_from_email || "",
      smtp_bcc: settingsDraft.smtp_bcc || "",
      default_currency: settingsDraft.default_currency || "",
      invoice_email_subject_template:
        settingsDraft.invoice_email_subject_template || "",
      invoice_email_body_template: settingsDraft.invoice_email_body_template || "",
      reminder_email_subject_template:
        settingsDraft.reminder_email_subject_template || "",
      reminder_email_body_template:
        settingsDraft.reminder_email_body_template || "",
    });
    setBusyAction(null);

    if (response.error) {
      setNotice({ tone: "error", message: response.error });
      return;
    }

    const parsed = FinanceSettingsSchema.safeParse(response.data);
    if (!parsed.success) {
      setNotice({
        tone: "error",
        message: "Automation defaults saved, but the response could not be parsed.",
      });
      return;
    }

    setSettings(parsed.data);
    setSettingsDraft(buildSettingsDraft(parsed.data));
    setNotice({
      tone: "success",
      message: "Automation defaults updated.",
    });
  }

  if (isLoading && !data) {
    return (
      <PageContainer className="overflow-hidden">
        <LoadingState label="Loading finance workspace..." />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer className="overflow-hidden">
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      </PageContainer>
    );
  }

  if (!data) {
    return (
      <PageContainer className="overflow-hidden">
        <EmptyState
          title="Finance case not found."
          description="We could not load this finance workspace."
        />
      </PageContainer>
    );
  }

  const actionSignals = [
    {
      title: overdueInvoices.length
        ? `${overdueInvoices.length} overdue invoice(s)`
        : "No overdue invoices",
      description: overdueInvoices.length
        ? `Outstanding overdue value ${formatMoney(
            overdueInvoices.reduce(
              (sum, invoice) => sum + Number(invoice.amount ?? 0),
              0,
            ),
            data.currency,
          )}`
        : "Reminder automation is clear right now.",
      tone: overdueInvoices.length ? "warning" : "success",
    },
    {
      title: preferredEmail ? "Reusable client email stored" : "Client email missing",
      description: preferredEmail
        ? preferredEmail
        : "Save an email in case memory so invoice sending stops asking for it.",
      tone: preferredEmail ? "success" : "warning",
    },
    {
      title:
        settings?.smtp_from_email || settings?.company_email
          ? "Email automation configured"
          : "Email sender not configured",
      description:
        settings?.smtp_from_email || settings?.company_email
          ? `From ${displayText(
              settings?.smtp_from_email || settings?.company_email,
            )}`
          : "Fill in SMTP and company details before live sending.",
      tone:
        settings?.smtp_from_email || settings?.company_email
          ? "success"
          : "warning",
    },
  ] as const;

  const paymentsSorted = [...data.payments].sort((left, right) => {
    const leftDate = parseDateValue(left.payment_date)?.getTime() ?? 0;
    const rightDate = parseDateValue(right.payment_date)?.getTime() ?? 0;
    return rightDate - leftDate;
  });

  return (
    <>
      <PageHeader
        title={data.title ?? "Finance case"}
        description={`${data.case_id} · ${displayText(
          data.request_type,
        )} · last updated ${formatDateTime(data.updated_at)}`}
        actions={
          <>
            <StatusBadge status={data.finance_status} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshCase()}
              disabled={busyAction != null}
            >
              <RefreshCwIcon className="size-4" />
              Refresh
            </Button>
          </>
        }
      />

      <PageContainer className="gap-5 overflow-y-auto bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.08),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.10),_transparent_26%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(248,250,252,0.96))]">
        {notice ? (
          <NoticeBanner tone={notice.tone}>{notice.message}</NoticeBanner>
        ) : null}

        <section className="relative overflow-hidden rounded-[28px] border border-border/70 bg-background/80 p-5 shadow-sm">
          <div className="absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_center,_rgba(56,189,248,0.16),_transparent_64%)]" />
          <div className="relative grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-900">
                  Finance workspace
                </span>
                {data.status ? <StatusBadge status={data.status} /> : null}
                {data.finance_status ? (
                  <StatusBadge status={data.finance_status} />
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Contract"
                  value={formatMoney(data.contract_sum, data.currency)}
                  hint="Tracked project value"
                />
                <StatCard
                  label="Paid"
                  value={formatMoney(data.paid_total, data.currency)}
                  hint={`${data.payments.length} payment event(s)`}
                />
                <StatCard
                  label="Outstanding"
                  value={formatMoney(data.remaining, data.currency)}
                  hint={
                    data.remaining > 0
                      ? "Still needs collection"
                      : "Nothing open right now"
                  }
                />
                <StatCard
                  label="Invoiced"
                  value={formatMoney(data.invoiced_total, data.currency)}
                  hint={`${data.invoices.length} invoice record(s)`}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <InsightItem
                  title={`Client: ${displayText(preferredName, "Unknown")}`}
                  description={`Phone ${displayText(
                    data.client_phone || data.phone,
                  )} · Email ${displayText(preferredEmail)}`}
                  tone="default"
                />
                <InsightItem
                  title={`Service: ${displayText(data.service_type)}`}
                  description={`Due ${formatDate(data.due_date)} · Finance date ${formatDate(
                    data.finance_date,
                  )}`}
                  tone="default"
                />
                <InsightItem
                  title={`Reminders sent: ${data.email_log.filter((entry) => String(entry.email_type ?? "").toLowerCase() === "reminder").length}`}
                  description={`Latest email ${formatDateTime(
                    data.email_log[0]?.sent_at,
                  )}`}
                  tone={data.email_log.length ? "success" : "default"}
                />
              </div>
            </div>

            <div className="space-y-3">
              {recommendation ? (
                <div
                  className={cn(
                    "rounded-[24px] border p-4 shadow-sm",
                    getToneClasses(recommendation.tone),
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">
                        Recommended next move
                      </p>
                      <p className="mt-2 text-lg font-semibold">
                        {recommendation.title}
                      </p>
                      <p className="mt-1 text-sm opacity-90">
                        {recommendation.description}
                      </p>
                    </div>
                    <SparklesIcon className="mt-1 size-5 shrink-0" />
                  </div>
                  <Button
                    className="mt-4"
                    variant={recommendation.tone === "warning" ? "secondary" : "default"}
                    onClick={runRecommendationAction}
                  >
                    <ArrowUpRightIcon className="size-4" />
                    Open {recommendation.tab}
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                {actionSignals.map((signal) => (
                  <InsightItem
                    key={signal.title}
                    title={signal.title}
                    description={signal.description}
                    tone={signal.tone}
                  />
                ))}
              </div>

              <div className="rounded-[24px] border border-border/70 bg-muted/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Quick actions
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setActiveTab("payments");
                      setPaymentDraft(buildPaymentDraft(data, settings));
                    }}
                  >
                    <WalletIcon className="size-4" />
                    Add payment
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => prepareNewInvoice(selectedInvoice)}
                  >
                    <FileTextIcon className="size-4" />
                    New invoice
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!selectedInvoice) {
                        setActiveTab("invoices");
                        return;
                      }
                      setActiveTab("communication");
                      loadMessageDefaults(
                        isInvoiceOverdue(selectedInvoice) ? "reminder" : "invoice",
                      );
                    }}
                  >
                    <MailIcon className="size-4" />
                    Compose mail
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          {WORKSPACE_TABS.map((tab) => (
            <TabButton
              key={tab.value}
              active={activeTab === tab.value}
              label={tab.label}
              icon={tab.icon}
              onClick={() => setActiveTab(tab.value)}
            />
          ))}
        </div>

        {activeTab === "overview" ? (
          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5">
              <SectionCard
                title="Finance profile"
                description="Core money state for this case. These values seed new invoice and payment drafts."
              >
                <form className="space-y-4" onSubmit={handleProfileSave}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Client name">
                      <Input
                        value={profileDraft.client_name}
                        onChange={(event) =>
                          setProfileDraft((current) => ({
                            ...current,
                            client_name: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Client phone">
                      <Input
                        value={profileDraft.client_phone}
                        onChange={(event) =>
                          setProfileDraft((current) => ({
                            ...current,
                            client_phone: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Service type">
                      <Input
                        value={profileDraft.service_type}
                        onChange={(event) =>
                          setProfileDraft((current) => ({
                            ...current,
                            service_type: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Finance date">
                      <Input
                        type="date"
                        value={profileDraft.finance_date}
                        onChange={(event) =>
                          setProfileDraft((current) => ({
                            ...current,
                            finance_date: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Contract sum">
                      <Input
                        inputMode="decimal"
                        value={profileDraft.contract_sum}
                        onChange={(event) =>
                          setProfileDraft((current) => ({
                            ...current,
                            contract_sum: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Currency">
                      <Select
                        value={profileDraft.currency || "MKD"}
                        onValueChange={(value) =>
                          setProfileDraft((current) => ({
                            ...current,
                            currency: value,
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Currency" />
                        </SelectTrigger>
                        <SelectContent>
                          {currencyOptions.map((currency) => (
                            <SelectItem key={currency} value={currency}>
                              {currency}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Due date">
                      <Input
                        type="date"
                        value={profileDraft.due_date}
                        onChange={(event) =>
                          setProfileDraft((current) => ({
                            ...current,
                            due_date: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Finance status">
                      <Select
                        value={profileDraft.finance_status || "GRAY"}
                        onValueChange={(value) =>
                          setProfileDraft((current) => ({
                            ...current,
                            finance_status: value,
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          {FINANCE_STATUS_OPTIONS.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  <Field label="Notes">
                    <Textarea
                      value={profileDraft.notes}
                      onChange={(event) =>
                        setProfileDraft((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </Field>

                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busyAction === "save-profile"}>
                      <SaveIcon className="size-4" />
                      Save profile
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setProfileDraft(buildProfileDraft(data))}
                    >
                      Reset
                    </Button>
                  </div>
                </form>
              </SectionCard>
            </div>

            <div className="space-y-5">
              <SectionCard
                title="Case memory"
                description="Store once, reuse everywhere. These values feed invoice recipients and communication drafts."
              >
                <form className="space-y-4" onSubmit={handleContactSave}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Primary phone">
                      <Input
                        value={contactDraft.phone}
                        onChange={(event) =>
                          setContactDraft((current) => ({
                            ...current,
                            phone: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    {Object.keys(contactDraft.customFields)
                      .sort((left, right) => {
                        if (left === "email") {
                          return -1;
                        }
                        if (right === "email") {
                          return 1;
                        }
                        return left.localeCompare(right);
                      })
                      .map((key) => (
                        <Field key={key} label={key}>
                          <Input
                            value={contactDraft.customFields[key] ?? ""}
                            onChange={(event) =>
                              setContactDraft((current) => ({
                                ...current,
                                customFields: {
                                  ...current.customFields,
                                  [key]: event.target.value,
                                },
                              }))
                            }
                          />
                        </Field>
                      ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busyAction === "save-contact"}>
                      <SaveIcon className="size-4" />
                      Save case memory
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setContactDraft(buildContactDraft(data))}
                    >
                      Reset
                    </Button>
                  </div>
                </form>
              </SectionCard>

              <SectionCard title="Case context" description="Operational context for the finance record.">
                <dl className="grid gap-4 sm:grid-cols-2">
                  {[
                    ["Case ID", data.case_id],
                    ["Request type", displayText(data.request_type)],
                    ["Created", formatDateTime(data.created_at)],
                    ["Last change", formatDateTime(data.updated_at)],
                    ["First seen", displayText(data.first_seen)],
                    ["Outstanding", formatMoney(data.remaining, data.currency)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="mt-1 text-sm text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              </SectionCard>
            </div>
          </div>
        ) : null}

        {activeTab === "payments" ? (
          <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
            <SectionCard
              title="Payment ledger"
              description="A chronological balance trail, not just a raw list."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="w-[1%] whitespace-nowrap" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentsSorted.length ? (
                    paymentsSorted.map((payment) => (
                      <TableRow key={payment.payment_id}>
                        <TableCell>{formatDate(payment.payment_date)}</TableCell>
                        <TableCell className="font-medium">
                          {formatMoney(payment.amount, payment.currency)}
                        </TableCell>
                        <TableCell>{displayText(payment.note)}</TableCell>
                        <TableCell>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => void handlePaymentDelete(payment)}
                            disabled={
                              busyAction === `delete-payment-${payment.payment_id}`
                            }
                          >
                            <Trash2Icon className="size-4 text-red-600" />
                            <span className="sr-only">Delete payment</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-6 text-center text-sm text-muted-foreground"
                      >
                        No payments recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </SectionCard>

            <div className="space-y-5">
              <SectionCard
                title="Capture payment"
                description="Defaults are seeded from outstanding balance and current case currency."
                action={<BanknoteIcon className="size-5 text-muted-foreground" />}
              >
                <form className="space-y-4" onSubmit={handlePaymentCreate}>
                  <Field label="Payment date">
                    <Input
                      type="date"
                      value={paymentDraft.payment_date}
                      onChange={(event) =>
                        setPaymentDraft((current) => ({
                          ...current,
                          payment_date: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Amount">
                    <Input
                      inputMode="decimal"
                      value={paymentDraft.amount}
                      onChange={(event) =>
                        setPaymentDraft((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Currency">
                    <Select
                      value={paymentDraft.currency}
                      onValueChange={(value) =>
                        setPaymentDraft((current) => ({
                          ...current,
                          currency: value,
                        }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {currencyOptions.map((currency) => (
                          <SelectItem key={currency} value={currency}>
                            {currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Internal note">
                    <Textarea
                      value={paymentDraft.note}
                      onChange={(event) =>
                        setPaymentDraft((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      disabled={busyAction === "create-payment"}
                    >
                      <CreditCardIcon className="size-4" />
                      Record payment
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPaymentDraft(buildPaymentDraft(data, settings))}
                    >
                      Reset to defaults
                    </Button>
                  </div>
                </form>
              </SectionCard>

              <SectionCard title="Collection snapshot" description="A quick overview while you are booking cash movements.">
                <div className="space-y-3">
                  <InsightItem
                    title={`Outstanding ${formatMoney(
                      data.remaining,
                      data.currency,
                    )}`}
                    description="This is the amount still open after all logged payments."
                    tone={data.remaining > 0 ? "warning" : "success"}
                  />
                  <InsightItem
                    title={`${data.payments.length} payment event(s)`}
                    description={`Latest payment ${formatDate(
                      data.payments[0]?.payment_date,
                    )}`}
                    tone={data.payments.length ? "success" : "default"}
                  />
                </div>
              </SectionCard>
            </div>
          </div>
        ) : null}

        {activeTab === "invoices" ? (
          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <SectionCard
              title="Invoice board"
              description="Select an invoice to edit it, or seed a new draft from existing case data."
              action={
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => prepareNewInvoice(selectedInvoice)}
                  >
                    <FileTextIcon className="size-4" />
                    New invoice
                  </Button>
                  {selectedInvoice ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => prepareExistingInvoice(selectedInvoice)}
                    >
                      <RefreshCwIcon className="size-4" />
                      Edit selected
                    </Button>
                  ) : null}
                </div>
              }
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[1%] whitespace-nowrap" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.invoices.length ? (
                    data.invoices.map((invoice) => (
                      <TableRow
                        key={invoice.invoice_id}
                        data-state={
                          selectedInvoiceId === invoice.invoice_id
                            ? "selected"
                            : undefined
                        }
                        className="cursor-pointer"
                        onClick={() => {
                          setSelectedInvoiceId(invoice.invoice_id);
                          setEditingInvoiceId(invoice.invoice_id);
                          setInvoiceDraft(buildExistingInvoiceDraft(invoice));
                        }}
                      >
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">
                              {invoice.invoice_number || `#${invoice.invoice_id}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Issued {formatDate(invoice.issue_date)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p>{formatDate(invoice.due_date)}</p>
                            {isInvoiceOverdue(invoice) ? (
                              <p className="text-xs text-red-600">Overdue</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatMoney(invoice.amount, invoice.currency)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={invoice.status} />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleInvoiceDelete(invoice);
                            }}
                            disabled={
                              busyAction === `delete-invoice-${invoice.invoice_id}`
                            }
                          >
                            <Trash2Icon className="size-4 text-red-600" />
                            <span className="sr-only">Delete invoice</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-6 text-center text-sm text-muted-foreground"
                      >
                        No invoices recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </SectionCard>

            <div className="space-y-5">
              <SectionCard
                title={
                  editingInvoiceId == null
                    ? "New invoice draft"
                    : `Editing ${selectedInvoice?.invoice_number || `#${editingInvoiceId}`}`
                }
                description="Seeded from case memory, latest invoice data, and automation defaults."
              >
                <form className="space-y-4" onSubmit={handleInvoiceSave}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Invoice number">
                      <Input
                        value={invoiceDraft.invoice_number}
                        onChange={(event) =>
                          setInvoiceDraft((current) => ({
                            ...current,
                            invoice_number: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Status">
                      <Select
                        value={invoiceDraft.status}
                        onValueChange={(value) =>
                          setInvoiceDraft((current) => ({
                            ...current,
                            status: value,
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          {INVOICE_STATUS_OPTIONS.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Issue date">
                      <Input
                        type="date"
                        value={invoiceDraft.issue_date}
                        onChange={(event) =>
                          setInvoiceDraft((current) => ({
                            ...current,
                            issue_date: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Due date">
                      <Input
                        type="date"
                        value={invoiceDraft.due_date}
                        onChange={(event) =>
                          setInvoiceDraft((current) => ({
                            ...current,
                            due_date: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Amount">
                      <Input
                        inputMode="decimal"
                        value={invoiceDraft.amount}
                        onChange={(event) =>
                          setInvoiceDraft((current) => ({
                            ...current,
                            amount: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Currency">
                      <Select
                        value={invoiceDraft.currency}
                        onValueChange={(value) =>
                          setInvoiceDraft((current) => ({
                            ...current,
                            currency: value,
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Currency" />
                        </SelectTrigger>
                        <SelectContent>
                          {currencyOptions.map((currency) => (
                            <SelectItem key={currency} value={currency}>
                              {currency}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Client name">
                      <Input
                        value={invoiceDraft.client_name}
                        onChange={(event) =>
                          setInvoiceDraft((current) => ({
                            ...current,
                            client_name: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Client email">
                      <Input
                        type="email"
                        value={invoiceDraft.client_email}
                        onChange={(event) =>
                          setInvoiceDraft((current) => ({
                            ...current,
                            client_email: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>

                  <Field label="Client address">
                    <Textarea
                      value={invoiceDraft.client_address}
                      onChange={(event) =>
                        setInvoiceDraft((current) => ({
                          ...current,
                          client_address: event.target.value,
                        }))
                      }
                    />
                  </Field>

                  <Field label="Service description">
                    <Textarea
                      value={invoiceDraft.service_description}
                      onChange={(event) =>
                        setInvoiceDraft((current) => ({
                          ...current,
                          service_description: event.target.value,
                        }))
                      }
                    />
                  </Field>

                  <Field
                    label="Line items / extra structure"
                    hint="Stored as raw text today. Useful if you want to preserve a richer breakdown for later."
                  >
                    <Textarea
                      value={invoiceDraft.items_json}
                      onChange={(event) =>
                        setInvoiceDraft((current) => ({
                          ...current,
                          items_json: event.target.value,
                        }))
                      }
                    />
                  </Field>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Reminders">
                      <Select
                        value={invoiceDraft.reminders_enabled}
                        onValueChange={(value) =>
                          setInvoiceDraft((current) => ({
                            ...current,
                            reminders_enabled: value,
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Reminder mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Enabled</SelectItem>
                          <SelectItem value="0">Disabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="First reminder after days">
                      <Input
                        inputMode="numeric"
                        value={invoiceDraft.reminder_first_after_days}
                        onChange={(event) =>
                          setInvoiceDraft((current) => ({
                            ...current,
                            reminder_first_after_days: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Repeat every days">
                      <Input
                        inputMode="numeric"
                        value={invoiceDraft.reminder_repeat_days}
                        onChange={(event) =>
                          setInvoiceDraft((current) => ({
                            ...current,
                            reminder_repeat_days: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Max reminders">
                      <Input
                        inputMode="numeric"
                        value={invoiceDraft.reminder_max_count}
                        onChange={(event) =>
                          setInvoiceDraft((current) => ({
                            ...current,
                            reminder_max_count: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busyAction === "save-invoice"}>
                      <SaveIcon className="size-4" />
                      {editingInvoiceId == null ? "Create invoice" : "Save invoice"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setInvoiceDraft(
                          editingInvoiceId == null
                            ? buildNewInvoiceDraft(data, settings, selectedInvoice)
                            : selectedInvoice
                              ? buildExistingInvoiceDraft(selectedInvoice)
                              : buildNewInvoiceDraft(data, settings, null),
                        )
                      }
                    >
                      Reset draft
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => prepareNewInvoice(selectedInvoice)}
                    >
                      Copy to new
                    </Button>
                  </div>
                </form>
              </SectionCard>

              <SectionCard title="Invoice focus" description="The selected invoice drives reminders and communication defaults.">
                <div className="space-y-3">
                  <InsightItem
                    title={
                      selectedInvoice
                        ? `Recipient ${displayText(selectedInvoice.client_email)}`
                        : "No active invoice"
                    }
                    description={
                      selectedInvoice
                        ? `Reminder count ${
                            selectedInvoice.reminder_sent_count ?? 0
                          }/${selectedInvoice.reminder_max_count ?? 0}`
                        : "Pick or create an invoice to prepare email."
                    }
                    tone={
                      selectedInvoice && isInvoiceOverdue(selectedInvoice)
                        ? "warning"
                        : "default"
                    }
                  />
                  {selectedInvoice ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setActiveTab("communication");
                          loadMessageDefaults("invoice");
                        }}
                      >
                        <MailIcon className="size-4" />
                        Send invoice
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setActiveTab("communication");
                          loadMessageDefaults("reminder");
                        }}
                      >
                        <AlertTriangleIcon className="size-4" />
                        Send reminder
                      </Button>
                    </div>
                  ) : null}
                </div>
              </SectionCard>
            </div>
          </div>
        ) : null}

        {activeTab === "communication" ? (
          <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-5">
              <SectionCard
                title="Compose email"
                description="Drafts are hydrated from saved recipients, invoice data, and your stored templates."
              >
                {selectedInvoice ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={messageMode === "invoice" ? "default" : "outline"}
                        onClick={() => loadMessageDefaults("invoice")}
                      >
                        <MailIcon className="size-4" />
                        Invoice email
                      </Button>
                      <Button
                        size="sm"
                        variant={messageMode === "reminder" ? "default" : "outline"}
                        onClick={() => loadMessageDefaults("reminder")}
                      >
                        <AlertTriangleIcon className="size-4" />
                        Reminder
                      </Button>
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-muted/30 p-3 text-sm">
                      <p className="font-medium">
                        Invoice{" "}
                        {selectedInvoice.invoice_number || `#${selectedInvoice.invoice_id}`}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {formatMoney(selectedInvoice.amount, selectedInvoice.currency)} · due{" "}
                        {formatDate(selectedInvoice.due_date)} · status{" "}
                        {displayText(selectedInvoice.status)}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <Field label="To">
                        <Input
                          type="email"
                          value={messageDraft.to_email}
                          onChange={(event) =>
                            setMessageDraft((current) => ({
                              ...current,
                              to_email: event.target.value,
                            }))
                          }
                        />
                      </Field>

                      <div className="flex flex-wrap gap-2">
                        {mergeUniqueValues([
                          selectedInvoice.client_email,
                          preferredEmail,
                          ...data.recipients.map((entry) => entry.email),
                        ]).map((email) => (
                          <Button
                            key={email}
                            size="xs"
                            variant="outline"
                            onClick={() =>
                              setMessageDraft((current) => ({
                                ...current,
                                to_email: email,
                              }))
                            }
                          >
                            {email}
                          </Button>
                        ))}
                      </div>

                      <Field label="Subject">
                        <Input
                          value={messageDraft.subject}
                          onChange={(event) =>
                            setMessageDraft((current) => ({
                              ...current,
                              subject: event.target.value,
                            }))
                          }
                        />
                      </Field>

                      <Field label="Body">
                        <Textarea
                          className="min-h-48"
                          value={messageDraft.body}
                          onChange={(event) =>
                            setMessageDraft((current) => ({
                              ...current,
                              body: event.target.value,
                            }))
                          }
                        />
                      </Field>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => void handleMessageSend(true)}
                          disabled={busyAction === "dry-run-email"}
                        >
                          <SparklesIcon className="size-4" />
                          Dry run
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void handleMessageSend(false)}
                          disabled={busyAction === "send-email"}
                        >
                          <MailIcon className="size-4" />
                          Send live
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => loadMessageDefaults(messageMode)}
                        >
                          Reset from defaults
                        </Button>
                      </div>

                      {mailResult ? (
                        <div
                          className={cn(
                            "rounded-2xl border p-3 text-sm",
                            mailResult.ok
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                              : "border-red-200 bg-red-50 text-red-800",
                          )}
                        >
                          <p className="font-medium">
                            {mailResult.message ||
                              (mailResult.ok
                                ? "Email action completed."
                                : "Email action failed.")}
                          </p>
                          <p className="mt-1 text-xs opacity-80">
                            {displayText(mailResult.to_email)} ·{" "}
                            {mailResult.attachment_filename
                              ? `${mailResult.attachment_filename} (${formatStorageSize(
                                  mailResult.attachment_size_bytes,
                                )})`
                              : "No attachment generated"}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="No invoice selected"
                    description="Create an invoice first. The email flow is invoice-driven so the PDF and subject/body can be generated consistently."
                  />
                )}
              </SectionCard>

              <SectionCard
                title="Email history"
                description="Everything sent for this case, including reminders and attachment metadata."
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sent</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Subject</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.email_log.length ? (
                      data.email_log.map((entry) => (
                        <TableRow key={entry.log_id}>
                          <TableCell>{formatDateTime(entry.sent_at)}</TableCell>
                          <TableCell>
                            <StatusBadge status={entry.email_type} />
                          </TableCell>
                          <TableCell>{displayText(entry.to_email)}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p>{displayText(entry.subject)}</p>
                              <p className="text-xs text-muted-foreground">
                                {displayText(entry.attachment_filename)} ·{" "}
                                {formatStorageSize(entry.attachment_size_bytes)}
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-6 text-center text-sm text-muted-foreground"
                        >
                          No emails recorded yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </SectionCard>
            </div>

            <div className="space-y-5">
              <SectionCard
                title="Automation defaults"
                description="Company data, sender identity, currency defaults, and reusable templates."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowSettingsEditor((current) => !current)}
                  >
                    {showSettingsEditor ? "Hide editor" : "Edit defaults"}
                  </Button>
                }
              >
                <div className="space-y-3">
                  <InsightItem
                    title={displayText(settings?.company_name, "Company not set")}
                    description={`${displayText(
                      settings?.company_email || settings?.smtp_from_email,
                    )} · ${displayText(settings?.company_phone)}`}
                    tone={
                      settings?.company_name &&
                      (settings?.company_email || settings?.smtp_from_email)
                        ? "success"
                        : "warning"
                    }
                  />
                  <InsightItem
                    title={`Default currency ${displayText(
                      settings?.default_currency,
                      "MKD",
                    )}`}
                    description="Invoice drafts start with this currency when case data is empty."
                    tone="default"
                  />
                  <InsightItem
                    title="Template placeholders"
                    description="{invoice_number}, {case_id}, {amount}, {currency}, {due_date}, {client_name}"
                    tone="default"
                  />
                </div>
              </SectionCard>

              {showSettingsEditor ? (
                <SectionCard
                  title="Edit automation defaults"
                  description="These are shared defaults for invoice PDFs and outbound mail."
                >
                  <form className="space-y-4" onSubmit={handleSettingsSave}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Company name">
                        <Input
                          value={settingsDraft.company_name}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              company_name: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Company email">
                        <Input
                          type="email"
                          value={settingsDraft.company_email}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              company_email: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Company address">
                        <Input
                          value={settingsDraft.company_address}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              company_address: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Company city">
                        <Input
                          value={settingsDraft.company_city}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              company_city: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Company phone">
                        <Input
                          value={settingsDraft.company_phone}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              company_phone: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Default currency">
                        <Input
                          value={settingsDraft.default_currency}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              default_currency: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Tax number">
                        <Input
                          value={settingsDraft.company_tax_number}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              company_tax_number: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Bank name">
                        <Input
                          value={settingsDraft.company_bank_name}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              company_bank_name: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Bank account">
                        <Input
                          value={settingsDraft.company_bank_account}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              company_bank_account: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="IBAN">
                        <Input
                          value={settingsDraft.company_iban}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              company_iban: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="SMTP host">
                        <Input
                          value={settingsDraft.smtp_host}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              smtp_host: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="SMTP port">
                        <Input
                          inputMode="numeric"
                          value={settingsDraft.smtp_port}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              smtp_port: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="SMTP username">
                        <Input
                          value={settingsDraft.smtp_username}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              smtp_username: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="SMTP password">
                        <Input
                          type="password"
                          value={settingsDraft.smtp_password}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              smtp_password: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="From email">
                        <Input
                          type="email"
                          value={settingsDraft.smtp_from_email}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              smtp_from_email: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="BCC">
                        <Input
                          value={settingsDraft.smtp_bcc}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              smtp_bcc: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Use TLS">
                        <Select
                          value={settingsDraft.smtp_use_tls}
                          onValueChange={(value) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              smtp_use_tls: value,
                            }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Enabled</SelectItem>
                            <SelectItem value="false">Disabled</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    <Field label="Invoice email subject template">
                      <Input
                        value={settingsDraft.invoice_email_subject_template}
                        onChange={(event) =>
                          setSettingsDraft((current) => ({
                            ...current,
                            invoice_email_subject_template: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Invoice email body template">
                      <Textarea
                        value={settingsDraft.invoice_email_body_template}
                        onChange={(event) =>
                          setSettingsDraft((current) => ({
                            ...current,
                            invoice_email_body_template: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Reminder email subject template">
                      <Input
                        value={settingsDraft.reminder_email_subject_template}
                        onChange={(event) =>
                          setSettingsDraft((current) => ({
                            ...current,
                            reminder_email_subject_template: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Reminder email body template">
                      <Textarea
                        value={settingsDraft.reminder_email_body_template}
                        onChange={(event) =>
                          setSettingsDraft((current) => ({
                            ...current,
                            reminder_email_body_template: event.target.value,
                          }))
                        }
                      />
                    </Field>

                    <Button
                      type="submit"
                      disabled={busyAction === "save-settings"}
                    >
                      <SaveIcon className="size-4" />
                      Save automation defaults
                    </Button>
                  </form>
                </SectionCard>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === "activity" ? (
          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <SectionCard
              title="Activity timeline"
              description="A compressed story of what happened on this finance case."
            >
              <div className="space-y-3">
                {timeline.length ? (
                  timeline.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-1 text-[11px] font-medium",
                            getToneClasses(item.tone),
                          )}
                        >
                          {formatDateTime(item.timestamp)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="No finance activity yet"
                    description="As payments, invoices, and emails are created, they will show up here."
                  />
                )}
              </div>
            </SectionCard>

            <div className="space-y-5">
              <SectionCard title="System memory" description="The shortcuts that reduce retyping and operator friction.">
                <div className="space-y-3">
                  <InsightItem
                    title={`Remembered recipients ${data.recipients.length}`}
                    description={
                      data.recipients.length
                        ? data.recipients
                            .slice(0, 3)
                            .map((entry) => entry.email)
                            .join(" · ")
                        : "Recipients are saved automatically after successful sends."
                    }
                    tone={data.recipients.length ? "success" : "default"}
                  />
                  <InsightItem
                    title={`Case email ${displayText(getCustomFieldValue(data, "email"))}`}
                    description="Stored in case memory so invoice drafts and reminder flows can reuse it."
                    tone={getCustomFieldValue(data, "email") ? "success" : "warning"}
                  />
                </div>
              </SectionCard>

              <SectionCard title="Fast actions" description="Jump straight to the next likely operation.">
                <div className="grid gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActiveTab("payments");
                      setPaymentDraft(buildPaymentDraft(data, settings));
                    }}
                  >
                    <WalletIcon className="size-4" />
                    Log another payment
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => prepareNewInvoice(selectedInvoice)}
                  >
                    <FileTextIcon className="size-4" />
                    Start a new invoice draft
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActiveTab("communication");
                      if (selectedInvoice) {
                        loadMessageDefaults(
                          isInvoiceOverdue(selectedInvoice) ? "reminder" : "invoice",
                        );
                      }
                    }}
                  >
                    <MailIcon className="size-4" />
                    Open communication
                  </Button>
                </div>
              </SectionCard>
            </div>
          </div>
        ) : null}
      </PageContainer>
    </>
  );
}
