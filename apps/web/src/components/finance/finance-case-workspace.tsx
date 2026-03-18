"use client";

import * as React from "react";
import {
  BanknoteIcon,
  ArrowRightIcon,
  Building2Icon,
  AlertTriangleIcon,
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CheckIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CreditCardIcon,
  ClockIcon,
  FileCheckIcon,
  CopyIcon,
  PencilLineIcon,
  FileTextIcon,
  PlayIcon,
  Loader2,
  MailIcon,
  PlusIcon,
  SendIcon,
  RefreshCwIcon,
  SaveIcon,
  SparklesIcon,
  Trash2Icon,
  WalletIcon,
  XIcon,
} from "lucide-react";

import { PageContainer } from "@/components/layout/PagePrimitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiClient, API_BASE } from "@/lib/api/client";
import { useToast } from "@/hooks/use-toast";
import {
  CaseCustomFieldDefinition,
  CaseCustomFieldDefinitionSchema,
  FinanceCaseDetail,
  FinanceCaseDetailSchema,
  FinanceSettings,
  FinanceSettingsSchema,
} from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { StatPill } from "@/components/finance/StatPill";

type WorkspaceTab = "workbench" | "communication" | "profile";
type WorkbenchDraftMode = "invoice" | "payment";

type FinanceInvoice = FinanceCaseDetail["invoices"][number];
type FinancePayment = FinanceCaseDetail["payments"][number];
type FinanceEmail = FinanceCaseDetail["email_log"][number];
type Tone = "default" | "warning" | "success";
type TimelineItem = {
  id: string;
  kind: "payment" | "invoice" | "email";
  timestamp: string | null | undefined;
  title: string;
  description: string;
  tone: Tone;
};

type ProfileDraft = {
  client_name: string;
  client_phone: string;
  service_type: string;
  contract_sum: string;
  currency: string;
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

type MessageMode = "invoice" | "reminder" | "general";

type CommunicationStep = "pick-type" | "pick-invoice" | "compose" | "sent";

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

const FIXED_PROFILE_CUSTOM_FIELDS = new Set([
  "Name / Last name",
  "email",
  "address",
  "alternate_emails",
  "company",
]);

// Enables the verbatim “Replit UI port” markup inside this component.
const VERBATIM_REPLIT_UI_PORT = true;

type TimelineBadge = {
  label: string;
  tone: Tone;
};

type ActivityRow = {
  id: string;
  kind: "payment" | "invoice" | "email";
  timestamp: string | null | undefined;
  dateLabel: string;
  title: string;
  description: string;
  tone: Tone;
  amount?: number;
  currency?: string | null;
  invoiceId?: number;
  paymentId?: number;
  emailLogId?: number;
  badges?: TimelineBadge[];
};

type Recommendation = {
  title: string;
  description: string;
  tab: WorkspaceTab;
  intent: "payment" | "invoice" | "reminder" | "contact" | "review";
  tone: Tone;
};

const WORKSPACE_TABS: Array<{
  value: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "workbench", label: "Invoices & Payments", icon: CreditCardIcon },
  { value: "communication", label: "Communication", icon: MailIcon },
  { value: "profile", label: "Contract Profile", icon: FileTextIcon },
];

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
  return parsed
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
        .format(parsed)
        .replace(/\s+/g, "/")
    : "-";
}

function formatDateTime(value?: string | null): string {
  return formatDate(value);
}

function formatMoney(value?: number | null, currency?: string | null): string {
  const amount = Number(value ?? 0);
  const code = String(currency ?? "").trim().toUpperCase();
  if (code.length === 3) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code,
        minimumFractionDigits: 0,
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

function formatAmountNumber(value?: number | null): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
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

function splitMultiValueText(value?: string | null): string[] {
  return String(value ?? "")
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
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
      getCustomFieldValue(detail, "Name / Last name"),
      invoice?.client_name,
      detail.client_name,
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
  const sharedPhone = String(detail.phone ?? detail.client_phone ?? "");
  return {
    client_name: getPreferredName(detail),
    client_phone: sharedPhone,
    service_type: String(detail.service_type ?? ""),
    contract_sum: String(detail.contract_sum ?? 0),
    currency: String(detail.currency ?? "MKD"),
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
  if (!Object.prototype.hasOwnProperty.call(customFields, "company")) {
    customFields.company = "";
  }
  if (!Object.prototype.hasOwnProperty.call(customFields, "address")) {
    customFields.address =
      mergeUniqueValues(
        detail.invoices.map((invoice) => invoice.client_address),
      )[0] ?? "";
  }
  if (
    !Object.prototype.hasOwnProperty.call(customFields, "Name / Last name") &&
    getPreferredName(detail)
  ) {
    customFields["Name / Last name"] = getPreferredName(detail);
  }

  return {
    phone: String(detail.phone ?? detail.client_phone ?? ""),
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
  const preferredAddress =
    mergeUniqueValues([
      sourceInvoice?.client_address,
      getCustomFieldValue(detail, "address"),
      detail.invoices[0]?.client_address,
    ])[0] ?? "";

  return {
    invoice_number: "",
    issue_date: todayString(),
    due_date: String(sourceInvoice?.due_date ?? "").trim() || "",
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
    client_address: preferredAddress,
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
      mode === "invoice" || mode === "general"
        ? String(settings?.invoice_email_subject_template ?? "").trim()
          ? renderTemplate(
              String(settings?.invoice_email_subject_template ?? ""),
              invoice,
            )
          : defaultInvoiceSubject(invoice)
        : defaultReminderSubject(invoice, settings),
    body:
      mode === "invoice" || mode === "general"
        ? defaultInvoiceBody(invoice, settings)
        : defaultReminderBody(invoice, settings),
  };
}

function buildBlankMessageDraft(
  detail: FinanceCaseDetail,
  invoice?: FinanceInvoice | null,
): MessageDraft {
  return {
    to_email: getPreferredEmail(detail, invoice),
    subject: "",
    body: "",
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
      tab: "workbench",
      intent: "invoice",
      tone: "default",
    };
  }

  if (detail.remaining > 0 && detail.payments.length === 0) {
    return {
      title: "Capture payment progress",
      description: "Outstanding balance is still open and no payments have been logged.",
      tab: "workbench",
      intent: "payment",
      tone: "default",
    };
  }

  if (!getPreferredEmail(detail)) {
    return {
      title: "Store a reusable contact email",
      description: "Save the client email once so invoice and reminder drafts stop asking for it.",
      tab: "profile",
      intent: "contact",
      tone: "warning",
    };
  }

  if (detail.contract_sum > 0 && detail.remaining <= 0) {
    return {
      title: "Case is financially settled",
      description: "Everything due on this case appears collected. Keep the activity trail clean and up to date.",
      tab: "workbench",
      intent: "review",
      tone: "success",
    };
  }

  return {
    title: "Keep the record current",
    description: "Review the workspace, confirm automation settings, and tighten the next handoff.",
    tab: "profile",
    intent: "review",
    tone: "default",
  };
}

function buildTimeline(detail: FinanceCaseDetail): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const payment of detail.payments) {
    items.push({
      id: `payment-${payment.payment_id}`,
      kind: "payment",
      timestamp: payment.payment_date ?? payment.created_at,
      title: "Payment received",
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
      kind: "invoice",
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
    const emailType = String(email.email_type ?? "").trim().toLowerCase();
    items.push({
      id: `email-${email.log_id}`,
      kind: "email",
      timestamp: email.sent_at ?? email.created_at,
      title:
        emailType === "reminder"
          ? "Reminder sent"
          : emailType === "general"
            ? "General email sent"
            : "Invoice email sent",
      description: `${displayText(email.to_email)} · ${displayText(email.subject)}`,
      tone:
        emailType === "reminder" ? "warning" : "default",
    });
  }

  if (detail.updated_at) {
    items.push({
      id: "case-updated",
      kind: "invoice",
      timestamp: detail.updated_at,
      title: "Finance record updated",
      description: `Balance ${formatMoney(detail.remaining, detail.currency)}`,
      tone: "default",
    });
  }

  return items.sort((left, right) => {
    const leftDate = parseDateValue(left.timestamp)?.getTime() ?? 0;
    const rightDate = parseDateValue(right.timestamp)?.getTime() ?? 0;
    return rightDate - leftDate;
  });
}

function buildActivityRows(detail: FinanceCaseDetail): ActivityRow[] {
  const rows: ActivityRow[] = [];

  for (const payment of detail.payments) {
    rows.push({
      id: `payment-${payment.payment_id}`,
      kind: "payment",
      timestamp: payment.payment_date ?? payment.created_at,
      dateLabel: "Received",
      title: "Payment received",
      description: payment.note ? payment.note : "Captured in ledger",
      tone: "success",
      amount: payment.amount,
      currency: payment.currency,
      paymentId: payment.payment_id,
    });
  }

  for (const invoice of detail.invoices) {
    const status = String(invoice.status ?? "").trim().toUpperCase();
    const badges: TimelineBadge[] = [];

    if (status) {
      badges.push({
        label: status,
        tone:
          status === "PAID"
            ? "success"
            : status === "SENT"
              ? "default"
              : "warning",
      });
    }
    if (isInvoiceOverdue(invoice) && status !== "PAID") {
      badges.push({ label: "OVERDUE", tone: "warning" });
    }

    rows.push({
      id: `invoice-${invoice.invoice_id}`,
      kind: "invoice",
      timestamp: invoice.updated_at ?? invoice.issue_date,
      dateLabel:
        status === "PAID"
          ? "Paid"
          : status === "SENT"
            ? "Sent"
            : "Created",
      title: `Invoice ${
        String(invoice.invoice_number ?? "").trim() || `#${invoice.invoice_id}`
      }`,
      description:
        String(invoice.service_description ?? "").trim() ||
        String(detail.service_type ?? "").trim() ||
        "Invoice record",
      tone:
        status === "PAID"
          ? "success"
          : status === "CANCELLED"
            ? "warning"
            : "default",
      amount: invoice.amount,
      currency: invoice.currency,
      invoiceId: invoice.invoice_id,
      badges,
    });
  }

  for (const email of detail.email_log) {
    const isReminder =
      String(email.email_type ?? "").trim().toLowerCase() === "reminder";
    const isGeneral =
      String(email.email_type ?? "").trim().toLowerCase() === "general";

    rows.push({
      id: `email-${email.log_id}`,
      kind: "email",
      timestamp: email.sent_at ?? email.created_at,
      dateLabel: "Sent",
      title: isReminder ? "Reminder sent" : isGeneral ? "General email sent" : "Invoice email sent",
      description: `${displayText(email.to_email)} · ${displayText(email.subject)}`,
      tone: isReminder ? "warning" : "default",
      emailLogId: email.log_id,
      badges: [
        {
          label: isReminder ? "REMINDER" : isGeneral ? "GENERAL" : "INVOICE",
          tone: isReminder ? "warning" : "default",
        },
      ],
    });
  }

  return rows.sort((left, right) => {
    const leftDate = parseDateValue(left.timestamp)?.getTime() ?? 0;
    const rightDate = parseDateValue(right.timestamp)?.getTime() ?? 0;
    return rightDate - leftDate;
  });
}

function groupActivityByCalendarDay(
  rows: ActivityRow[],
): { dateLabel: string; rows: ActivityRow[] }[] {
  const groups: { dateLabel: string; rows: ActivityRow[] }[] = [];
  for (const row of rows) {
    const d = parseDateValue(row.timestamp);
    const dateLabel = d
      ? d
          .toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
          .toUpperCase()
      : "—";
    const last = groups[groups.length - 1];
    if (last && last.dateLabel === dateLabel) {
      last.rows.push(row);
    } else {
      groups.push({ dateLabel, rows: [row] });
    }
  }
  return groups;
}

function getToneClasses(tone: Tone): string {
  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  return "border-blue-200 bg-blue-50 text-blue-900";
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
    <Card
      className={cn(
        "overflow-hidden rounded-[24px] border border-border/70 bg-background shadow-sm",
        className,
      )}
    >
      <CardHeader className="border-b border-border/60 bg-background/95">
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
        "inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </button>
  );
}

function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="inline-flex rounded-full border border-border/70 bg-background p-1 shadow-sm">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function HeaderMetric({
  label,
  value,
  amount,
  currency,
  accent = "default",
}: {
  label: string;
  value?: string;
  amount?: number | null;
  currency?: string | null;
  accent?: "default" | "success" | "warning";
}) {
  return (
    <div className="min-w-0 px-4 py-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate text-lg font-semibold",
          accent === "success"
            ? "text-emerald-600"
            : accent === "warning"
              ? "text-amber-600"
              : "text-foreground",
        )}
      >
        {typeof amount === "number" ? (
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-[0.62em] font-semibold uppercase tracking-[0.12em] opacity-70">
              {String(currency ?? "").trim().toUpperCase()}
            </span>
            <span>{formatAmountNumber(amount)}</span>
          </span>
        ) : (
          value
        )}
      </p>
    </div>
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
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<WorkspaceTab>("workbench");
  const tabsValue: "invoices" | "communication" | "contract" =
    activeTab === "workbench"
      ? "invoices"
      : activeTab === "communication"
        ? "communication"
        : "contract";
  function handleTabsValueChange(nextValue: string) {
    if (nextValue === "invoices") {
      setActiveTab("workbench");
      return;
    }
    if (nextValue === "communication") {
      setActiveTab("communication");
      return;
    }
    setActiveTab("profile");
  }
  const [draftMode, setDraftMode] = React.useState<WorkbenchDraftMode>("invoice");
  const [profileDraft, setProfileDraft] = React.useState<ProfileDraft>({
    client_name: "",
    client_phone: "",
    service_type: "",
    contract_sum: "0",
    currency: "MKD",
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
  const [caseFieldDefinitions, setCaseFieldDefinitions] = React.useState<
    CaseCustomFieldDefinition[]
  >([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState<number | null>(
    null,
  );
  const [editingInvoiceId, setEditingInvoiceId] = React.useState<number | null>(
    null,
  );
  const [messageMode, setMessageMode] = React.useState<MessageMode | null>(null);
  const [mailResult, setMailResult] = React.useState<MailResult | null>(null);
  const [commStep, setCommStep] =
    React.useState<CommunicationStep>("pick-type");
  const [expandedLogId, setExpandedLogId] = React.useState<number | null>(null);
  const [workbenchPanel, setWorkbenchPanel] = React.useState<"draft" | "email">(
    "draft",
  );
  const [workbenchEmailLogId, setWorkbenchEmailLogId] = React.useState<
    number | null
  >(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [showSettingsEditor, setShowSettingsEditor] = React.useState(false);
  const [notice, setNotice] = React.useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [highlightDraft, setHighlightDraft] = React.useState(false);
  const [profileSaveStatus, setProfileSaveStatus] = React.useState<
    "idle" | "saving" | "saved"
  >("idle");
  const draftFormRef = React.useRef<HTMLDivElement | null>(null);
  const invoiceNumberInputRef = React.useRef<HTMLInputElement | null>(null);

  const selectedInvoice =
    data?.invoices.find((invoice) => invoice.invoice_id === selectedInvoiceId) ??
    data?.invoices[0] ??
    null;
  const editingInvoice =
    data?.invoices.find((invoice) => invoice.invoice_id === editingInvoiceId) ??
    null;
  const recommendation = data ? buildRecommendation(data) : null;
  const timeline = data ? buildTimeline(data) : [];
  const activityRows = data ? buildActivityRows(data) : [];
  const activityByDay = React.useMemo(
    () => groupActivityByCalendarDay(activityRows),
    [activityRows],
  );
  const workbenchPreviewEmail =
    data && workbenchEmailLogId != null
      ? (data.email_log.find((e) => e.log_id === workbenchEmailLogId) ?? null)
      : null;
  const invoicesSortedByDueDate = React.useMemo(() => {
    if (!data) return [];
    return [...data.invoices].sort((a, b) => {
      const aMs = parseDateValue(a.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bMs = parseDateValue(b.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
      return aMs - bMs;
    });
  }, [data]);
  const currencyOptions = getCurrencyOptions(data, settings);
  const preferredName = data ? getPreferredName(data, selectedInvoice) : "";
  const rememberedRecipients = data
    ? mergeUniqueValues([
        ...data.recipients.map((entry) => entry.email),
        ...splitMultiValueText(getCustomFieldValue(data, "alternate_emails")),
      ])
    : [];
  const overdueInvoices = data
    ? data.invoices.filter((invoice) => isInvoiceOverdue(invoice))
    : [];
  const needsReminder =
    overdueInvoices.find((invoice) => !isInvoiceClosed(invoice)) ?? null;
  const hasAnyFinanceActivity =
    !!data && (data.invoices.length > 0 || data.payments.length > 0);

  React.useEffect(() => {
    async function loadWorkspace() {
      setIsLoading(true);
      setError(null);

      const [detailResponse, settingsResponse, fieldDefinitionsResponse] =
        await Promise.all([
        apiClient.getParsed(
          `/api/finance/cases/${caseId}`,
          FinanceCaseDetailSchema,
        ),
        apiClient.getParsed("/api/finance/settings", FinanceSettingsSchema, {
          cache: "force-cache",
        }),
        apiClient.getParsed(
          "/api/custom-fields?scope=case",
          CaseCustomFieldDefinitionSchema.array(),
        ),
      ]);

      if (detailResponse.error || !detailResponse.data) {
        setError(detailResponse.error ?? "Finance case not found.");
        setData(null);
        setIsLoading(false);
        return;
      }

      const loadedDetail = detailResponse.data;
      const loadedSettings = settingsResponse.data ?? {};
      const loadedCaseFieldDefinitions = fieldDefinitionsResponse.data ?? [];
      const initialInvoice = loadedDetail.invoices[0] ?? null;
      setData(loadedDetail);
      setSettings(loadedSettings);
      setCaseFieldDefinitions(loadedCaseFieldDefinitions);
      setProfileDraft(buildProfileDraft(loadedDetail));
      setContactDraft(buildContactDraft(loadedDetail));
      setPaymentDraft(buildPaymentDraft(loadedDetail, loadedSettings));
      setSettingsDraft(buildSettingsDraft(loadedSettings));
      setSelectedInvoiceId(initialInvoice?.invoice_id ?? null);
      setEditingInvoiceId(null);
      setInvoiceDraft(buildNewInvoiceDraft(loadedDetail, loadedSettings));
      setDraftMode("invoice");
      setMessageMode(null);
      setMessageDraft(buildBlankMessageDraft(loadedDetail, initialInvoice));
      setMailResult(null);
      setActiveTab(loadedDetail.invoices.length === 0 ? "profile" : "workbench");
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
    selectedInvoiceId?: number | null;
    editingInvoiceId?: number | null;
    resetInvoiceDraft?: boolean;
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
    const nextSelectedInvoiceId =
      options?.selectedInvoiceId !== undefined
        ? options.selectedInvoiceId
        : selectedInvoiceId;
    const nextEditingInvoiceId =
      options?.editingInvoiceId !== undefined
        ? options.editingInvoiceId
        : editingInvoiceId;
    const refreshedSelected =
      nextSelectedInvoiceId != null
        ? refreshed.invoices.find(
            (invoice) => invoice.invoice_id === nextSelectedInvoiceId,
          ) ??
          refreshed.invoices[0] ??
          null
        : refreshed.invoices[0] ?? null;

    setData(refreshed);
    setProfileDraft(buildProfileDraft(refreshed));
    setContactDraft(buildContactDraft(refreshed));
    setPaymentDraft(buildPaymentDraft(refreshed, settings));
    setSelectedInvoiceId(refreshedSelected?.invoice_id ?? null);

    if (nextEditingInvoiceId != null) {
      const refreshedEditing = refreshed.invoices.find(
        (invoice) => invoice.invoice_id === nextEditingInvoiceId,
      );
      setEditingInvoiceId(refreshedEditing?.invoice_id ?? null);
      setInvoiceDraft(
        refreshedEditing
          ? buildExistingInvoiceDraft(refreshedEditing)
          : buildNewInvoiceDraft(refreshed, settings),
      );
    } else if (options?.editingInvoiceId !== undefined) {
      setEditingInvoiceId(null);
      if (options.resetInvoiceDraft) {
        setInvoiceDraft(buildNewInvoiceDraft(refreshed, settings));
      }
    }

    if (!options?.keepMailResult) {
      setMailResult(null);
    }
    if (options?.successMessage) {
      setNotice({ tone: "success", message: options.successMessage });
    }
    return true;
  }

  // Recipient label editing is not part of the current active layout.

  function runRecommendationAction() {
    if (!data || !recommendation) {
      return;
    }

    setActiveTab(recommendation.tab);
    if (recommendation.intent === "invoice") {
      prepareNewInvoice();
    }
    if (recommendation.intent === "payment") {
      setDraftMode("payment");
      setPaymentDraft(buildPaymentDraft(data, settings));
    }
    if (recommendation.intent === "reminder" && needsReminder) {
      setSelectedInvoiceId(needsReminder.invoice_id);
      setMessageMode("reminder");
      setMessageDraft(
        buildMessageDraft("reminder", data, needsReminder, settings),
      );
    }
    if (recommendation.intent === "contact") {
      setActiveTab("profile");
    }
  }

  function loadMessageDefaults(nextMode: MessageMode) {
    if (!data || !selectedInvoice) {
      return;
    }
    setMessageMode(nextMode);
    setMessageDraft(buildMessageDraft(nextMode, data, selectedInvoice, settings));
    setMailResult(null);
    setCommStep("compose");
  }

  function prepareNewInvoice(sourceInvoice?: FinanceInvoice | null) {
    if (!data) {
      return;
    }
    setWorkbenchPanel("draft");
    setWorkbenchEmailLogId(null);
    setDraftMode("invoice");
    setEditingInvoiceId(null);
    setInvoiceDraft(buildNewInvoiceDraft(data, settings, sourceInvoice));
    setActiveTab("workbench");
  }

  function prepareExistingInvoice(invoice: FinanceInvoice) {
    setWorkbenchPanel("draft");
    setWorkbenchEmailLogId(null);
    setDraftMode("invoice");
    setEditingInvoiceId(invoice.invoice_id);
    setSelectedInvoiceId(invoice.invoice_id);
    setInvoiceDraft(buildExistingInvoiceDraft(invoice));
    setActiveTab("workbench");
  }

  function resetInvoiceDraft() {
    if (!data) {
      return;
    }

    setInvoiceDraft(
      editingInvoice
        ? buildExistingInvoiceDraft(editingInvoice)
        : buildNewInvoiceDraft(data, settings),
    );
  }

  function cancelInvoiceEditing() {
    if (!data) {
      return;
    }

    setWorkbenchPanel("draft");
    setWorkbenchEmailLogId(null);
    setDraftMode("invoice");
    setEditingInvoiceId(null);
    setInvoiceDraft(buildNewInvoiceDraft(data, settings));
  }

  function openInvoiceCommunication(nextMode: MessageMode) {
    if (!data || !editingInvoice) {
      return;
    }

    setSelectedInvoiceId(editingInvoice.invoice_id);
    setActiveTab("communication");
    setMessageMode(nextMode);
    setMessageDraft(buildMessageDraft(nextMode, data, editingInvoice, settings));
    setMailResult(null);
  }

  function openCommunicationForInvoice(
    nextMode: MessageMode,
    invoice: FinanceInvoice,
  ) {
    if (!data) {
      return;
    }

    setSelectedInvoiceId(invoice.invoice_id);
    setActiveTab("communication");
    setMessageMode(nextMode);
    setMessageDraft(buildMessageDraft(nextMode, data, invoice, settings));
    setMailResult(null);
    setCommStep("compose");
  }

  const saveProfile = React.useCallback(async () => {
    const contractSum = toNumber(profileDraft.contract_sum);
    if (contractSum == null) {
      setNotice({ tone: "error", message: "Contract sum must be a valid number." });
      return;
    }

    setProfileSaveStatus("saving");
    setBusyAction("save-profile");
    const sharedClientName = profileDraft.client_name.trim();
    const sharedPhone = profileDraft.client_phone.trim() || contactDraft.phone.trim();
    const sharedCustomFields = {
      ...contactDraft.customFields,
      "Name / Last name": sharedClientName,
      email: String(contactDraft.customFields.email ?? "").trim(),
      address: String(contactDraft.customFields.address ?? "").trim(),
    };

    const response = await apiClient.put<unknown>(
      `/api/finance/cases/${caseId}/profile`,
      {
        client_name: sharedClientName || null,
        client_phone: sharedPhone || null,
        service_type: profileDraft.service_type || null,
        contract_sum: contractSum,
        currency: profileDraft.currency || null,
        notes: profileDraft.notes || null,
      },
    );
    if (response.error) {
      setBusyAction(null);
      setProfileSaveStatus("idle");
      setNotice({ tone: "error", message: response.error });
      return;
    }

    const overviewResponse = await apiClient.patch<unknown>(
      `/api/finance/cases/${caseId}/overview`,
      {
        phone: sharedPhone || null,
        custom_fields: sharedCustomFields,
      },
    );
    setBusyAction(null);

    if (overviewResponse.error) {
      setProfileSaveStatus("idle");
      setNotice({ tone: "error", message: overviewResponse.error });
      return;
    }

    const parsed = FinanceCaseDetailSchema.safeParse(overviewResponse.data);
    if (!parsed.success) {
      setProfileSaveStatus("idle");
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
    setProfileSaveStatus("saved");
    window.setTimeout(() => setProfileSaveStatus("idle"), 2000);
  }, [
    caseId,
    contactDraft,
    profileDraft,
    settings,
  ]);

  // Profile submit wrapper not needed in current layout.

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

    const isEditingInvoice = editingInvoiceId != null;
    const response =
      !isEditingInvoice
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
    const nextInvoiceId =
      typeof raw.invoice_id === "number" ? raw.invoice_id : editingInvoiceId;
    await refreshCase({
      successMessage: isEditingInvoice ? "Invoice updated." : "Invoice created.",
      selectedInvoiceId: nextInvoiceId ?? selectedInvoiceId,
      editingInvoiceId: nextInvoiceId ?? null,
    });
  }

  const handleDraftFieldKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const scrollDraftIntoView = React.useCallback(
    (nextMode: WorkbenchDraftMode = "invoice") => {
      setDraftMode(nextMode);

      if (typeof window === "undefined") {
        return;
      }

      window.setTimeout(() => {
        if (!draftFormRef.current) {
          return;
        }
        draftFormRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        setHighlightDraft(true);
        window.setTimeout(() => {
          setHighlightDraft(false);
        }, 1200);
      }, 0);
    },
    [],
  );

  const goToDraftNewInvoiceAndFocusNumber = React.useCallback(() => {
    if (!data) return;
    prepareNewInvoice(selectedInvoice ?? undefined);
    setActiveTab("workbench");
    scrollDraftIntoView("invoice");
    window.setTimeout(() => {
      invoiceNumberInputRef.current?.focus();
    }, 150);
  }, [data, selectedInvoice, scrollDraftIntoView]);

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

    const wasSelected = selectedInvoiceId === invoice.invoice_id;
    const wasEditing = editingInvoiceId === invoice.invoice_id;

    await refreshCase({
      successMessage: "Invoice deleted.",
      selectedInvoiceId: wasSelected ? null : selectedInvoiceId,
      editingInvoiceId: wasEditing ? null : editingInvoiceId,
      resetInvoiceDraft: wasEditing,
    });
  }

  async function handleMessageSend(dryRun: boolean) {
    if (!data || !selectedInvoice) {
      setNotice({
        tone: "error",
        message: "Select an invoice before sending email.",
      });
      return;
    }
    if (!messageMode) {
      setNotice({
        tone: "error",
        message: "Choose Invoice, Reminder, or General before sending email.",
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
      messageMode === "reminder"
        ? `/api/finance/invoices/${selectedInvoice.invoice_id}/send-reminder`
        : `/api/finance/invoices/${selectedInvoice.invoice_id}/send-email`;
    const response = await apiClient.post<MailResult>(endpoint, {
      to_email: messageDraft.to_email,
      subject: messageDraft.subject,
      body: messageDraft.body,
      dry_run: dryRun,
      email_type: messageMode,
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
        message:
          response.data.message ??
          `${
            messageMode === "invoice"
              ? "Invoice"
              : messageMode === "reminder"
                ? "Reminder"
                : "General"
          } draft generated.`,
      });
      return;
    }

    await refreshCase({
      successMessage:
        response.data.message ??
        `${
          messageMode === "invoice"
            ? "Invoice"
            : messageMode === "reminder"
              ? "Reminder"
              : "General"
        } email sent to ${displayText(
          response.data.to_email ?? messageDraft.to_email,
        )}.`,
      keepMailResult: true,
    });

    setCommStep("sent");
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

  /*
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
      <div className="hidden">
        <PageHeader
          title={data.title ?? "Finance case"}
          description={`${data.case_id} · ${displayText(
            data.request_type,
          )} · last updated ${formatDateTime(data.updated_at)}`}
          actions={
            <>
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
      </div>

      <PageContainer className="gap-5 overflow-y-auto bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.08),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.10),_transparent_26%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(248,250,252,0.96))]">
        {notice ? (
          <NoticeBanner tone={notice.tone}>{notice.message}</NoticeBanner>
        ) : null}

        <section className="hidden relative overflow-hidden rounded-[28px] border border-border/70 bg-background/80 p-5 shadow-sm">
          <div className="absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_center,_rgba(56,189,248,0.16),_transparent_64%)]" />
          <div className="relative grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-900">
                  Finance workspace
                </span>
                {data.status ? <StatusBadge status={data.status} /> : null}
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
                  description={displayText(data.service_type) ? "Contract service type" : ""}
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
                <form className="space-y-3" onSubmit={handlePaymentCreate}>
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
                  <Field label="Amount" tone="compact">
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
                    <TableHead className="min-w-[80px] whitespace-nowrap">View</TableHead>
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
                            size="sm"
                            variant="outline"
                            asChild
                            title="View invoice (print from browser)"
                            className="gap-1.5"
                          >
                            <a
                              href={`${API_BASE.replace(/\/$/, "")}/api/finance/invoices/${invoice.invoice_id}/html`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <FileTextIcon className="size-4 shrink-0" />
                              View
                            </a>
                          </Button>
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
                        colSpan={6}
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
                        onKeyDown={handleDraftFieldKeyDown}
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
                        onKeyDown={handleDraftFieldKeyDown}
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
                        onKeyDown={handleDraftFieldKeyDown}
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setActiveTab("communication");
                          loadMessageDefaults("general");
                        }}
                      >
                        <MailIcon className="size-4" />
                        Send general
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
            {hasAnyFinanceActivity ? (
              <div className="space-y-4">
                    {commStep === "sent" ? (
                      <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                        <p className="text-sm font-semibold">Email sent.</p>
                        <p className="mt-1 text-sm opacity-90">
                          You can send another message or review the updated email history.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              setMailResult(null);
                              setCommStep("pick-type");
                              setMessageMode(null);
                            }}
                          >
                            Send another
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCommStep("compose")}
                            disabled={messageMode == null}
                          >
                            Back to compose
                          </Button>
                        </div>
                      </div>
                    ) : null}
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
                      <Button
                        size="sm"
                        variant={messageMode === "general" ? "default" : "outline"}
                        onClick={() => loadMessageDefaults("general")}
                      >
                        <MailIcon className="size-4" />
                        General
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

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Saved recipients (click to use, edit label or remove)
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {data.recipients.map((entry) => (
                            <span
                              key={entry.email}
                              className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-sm"
                            >
                              {editingRecipientEmail === entry.email ? (
                                <>
                                  <Input
                                    className="h-7 w-32 text-sm"
                                    placeholder="e.g. finance"
                                    value={editingRecipientLabel}
                                    onChange={(e) =>
                                      setEditingRecipientLabel(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        void handleSaveRecipientLabel(
                                          entry.email,
                                          editingRecipientLabel,
                                        );
                                      }
                                      if (e.key === "Escape") {
                                        setEditingRecipientEmail(null);
                                        setEditingRecipientLabel("");
                                      }
                                    }}
                                  />
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() =>
                                      void handleSaveRecipientLabel(
                                        entry.email,
                                        editingRecipientLabel,
                                      )
                                    }
                                    disabled={busyAction === "update-recipient-label"}
                                  >
                                    <SaveIcon className="size-3.5" />
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() => {
                                      setEditingRecipientEmail(null);
                                      setEditingRecipientLabel("");
                                    }}
                                  >
                                    <X className="size-3.5" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="text-left hover:underline"
                                    onClick={() =>
                                      setMessageDraft((current) => ({
                                        ...current,
                                        to_email: entry.email,
                                      }))
                                    }
                                  >
                                    {entry.label
                                      ? `${entry.label}: ${entry.email}`
                                      : entry.email}
                                  </button>
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                      setEditingRecipientEmail(entry.email);
                                      setEditingRecipientLabel(
                                        entry.label ?? "",
                                      );
                                    }}
                                    disabled={busyAction != null}
                                    title="Edit label"
                                  >
                                    <PencilIcon className="size-3.5" />
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                    onClick={() =>
                                      void handleDeleteRecipient(entry.email)
                                    }
                                    disabled={busyAction != null}
                                    title="Remove from case"
                                  >
                                    <X className="size-3.5" />
                                  </Button>
                                </>
                              )}
                            </span>
                          ))}
                        </div>
                        {mergeUniqueValues([
                          selectedInvoice.client_email,
                          preferredEmail,
                        ]).filter(
                          (e) =>
                            e &&
                            !data.recipients.some((r) => r.email === e),
                        ).length > 0 ? (
                          <>
                            <p className="text-xs font-medium text-muted-foreground">
                              Quick add (not saved yet)
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {mergeUniqueValues([
                                selectedInvoice.client_email,
                                preferredEmail,
                              ])
                                .filter(
                                  (e) =>
                                    e &&
                                    !data.recipients.some((r) => r.email === e),
                                )
                                .map((email) => (
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
                          </>
                        ) : null}
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
                              mailResult.error ||
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
                            .map((entry) =>
                              entry.label
                                ? `${entry.label}: ${entry.email}`
                                : entry.email,
                            )
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
  */

  const primaryEmail = contactDraft.customFields.email ?? "";
  const companyValue = contactDraft.customFields.company ?? "";
  const addressValue = contactDraft.customFields.address ?? "";
  const alternateEmailsValue = contactDraft.customFields.alternate_emails ?? "";
  const caseFieldDefinitionMap = new Map(
    caseFieldDefinitions.map((definition) => [definition.name, definition]),
  );
  const additionalMemoryFields = Object.entries(contactDraft.customFields)
    .filter(([key]) => !FIXED_PROFILE_CUSTOM_FIELDS.has(key))
    .sort(([left], [right]) => left.localeCompare(right));
  const emailSuggestions = mergeUniqueValues([
    selectedInvoice?.client_email,
    primaryEmail,
    ...rememberedRecipients,
  ]);
  const compactTitle =
    preferredName && preferredName !== "-"
      ? preferredName
      : data.title || `Finance case ${data.case_id}`;
  const secondaryTitle = displayText(
    data.service_type || data.request_type,
    "Finance workspace",
  );
  const automationReady = Boolean(
    settings?.smtp_from_email || settings?.company_email,
  );

  return (
    <PageContainer className="financeWorkspaceTokens gap-5 overflow-visible rounded-none border-0 bg-[#f5f7fb] p-0 shadow-none">
      <section className="border-b border-[#d8dde6] bg-[#fffdf8]">
        <div className="flex flex-col gap-5 px-6 py-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[1.15rem] font-medium tracking-[-0.01em] text-slate-950 sm:text-[1.35rem]">
                {compactTitle}
              </h1>
              <span className="rounded-full border border-[#e0e6ef] bg-white px-3 py-1 text-xs font-semibold text-slate-800">
                {data.case_id}
              </span>
            </div>
            <p className="max-w-5xl text-[0.95rem] leading-7 text-slate-500">
              {secondaryTitle}
            </p>
          </div>

          <div className="w-full max-w-4xl xl:w-auto">
            <div className="grid overflow-hidden rounded-[22px] border border-[#d8dde6] bg-white shadow-sm sm:grid-cols-[repeat(4,minmax(0,1fr))_58px]">
              <div className="border-b border-[#e7ebf2] sm:border-b-0 sm:border-r">
                <HeaderMetric
                  label="Contract"
                  amount={data.contract_sum}
                  currency={data.currency}
                />
              </div>
              <div className="border-b border-[#e7ebf2] sm:border-b-0 sm:border-r">
                <HeaderMetric
                  label="Invoiced"
                  amount={data.invoiced_total}
                  currency={data.currency}
                />
              </div>
              <div className="border-b border-[#e7ebf2] sm:border-b-0 sm:border-r">
                <HeaderMetric
                  label="Paid"
                  amount={data.paid_total}
                  currency={data.currency}
                  accent="success"
                />
              </div>
              <div className="border-b border-[#e7ebf2] sm:border-b-0 sm:border-r">
                <HeaderMetric
                  label="Outstanding"
                  amount={data.remaining}
                  currency={data.currency}
                  accent={data.remaining > 0 ? "warning" : "default"}
                />
              </div>
              <button
                type="button"
                onClick={() => void refreshCase()}
                disabled={busyAction != null}
                className="flex min-h-14 items-center justify-center text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCwIcon className="size-4" />
                <span className="sr-only">Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <Tabs
        value={tabsValue}
        onValueChange={handleTabsValueChange}
        className="w-full"
      >
        {/* Only the tab strip; title + StatPills are already shown in your app shell. */}
        <TabsList className="flex w-full justify-start overflow-x-auto rounded-none border-b bg-transparent px-6 py-0">
          {[
            {
              value: "invoices",
              label: "Invoices & Payments",
              icon: FileCheckIcon,
            },
            { value: "communication", label: "Communication", icon: MailIcon },
            { value: "contract", label: "Contract Profile", icon: FileTextIcon },
          ].map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="relative h-10 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              <Icon className="mr-2 h-4 w-4" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {activeTab === "workbench" ? (
          <div className="px-6 pt-4">
            <div className="rounded-lg border border-border/70 bg-background/80 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Invoices
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.invoices.length} invoice(s)
                </p>
              </div>

              <div className="mt-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[1%] whitespace-nowrap text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesSortedByDueDate.length ? (
                      invoicesSortedByDueDate.map((invoice) => (
                        <TableRow key={invoice.invoice_id}>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium">
                                {invoice.invoice_number ||
                                  `#${invoice.invoice_id}`}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(invoice.due_date)}</TableCell>
                          <TableCell>
                            {formatMoney(invoice.amount, invoice.currency)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={invoice.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                asChild
                                title="View invoice (print from browser)"
                              >
                                <a
                                  href={`${API_BASE.replace(/\/$/, "")}/api/finance/invoices/${invoice.invoice_id}/html`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <FileTextIcon className="mr-1 size-4 shrink-0" />
                                  View
                                </a>
                              </Button>
                              <Button
                                size="sm"
                                disabled={isInvoiceClosed(invoice)}
                                onClick={() =>
                                  openCommunicationForInvoice(
                                    "invoice",
                                    invoice,
                                  )
                                }
                              >
                                Send invoice email
                              </Button>
                              <Button
                                size="sm"
                                disabled={isInvoiceClosed(invoice)}
                                onClick={() =>
                                  openCommunicationForInvoice(
                                    "reminder",
                                    invoice,
                                  )
                                }
                              >
                                Send reminder
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center">
                          <span className="text-sm text-muted-foreground">
                            No invoices recorded yet.
                          </span>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        ) : null}
      </Tabs>

      {activeTab === "workbench" ? (
        VERBATIM_REPLIT_UI_PORT ? (
          <div className="space-y-5 px-6 pb-5">
            {/* Verbatim Replit UI port: Invoices & Payments */}
            {(() => {
              const panelEmail = workbenchPreviewEmail;
              const panelView: "invoice" | "payment" | "email" =
                workbenchPanel === "email" && panelEmail
                  ? "email"
                  : draftMode;
              const outstanding = data.remaining;
              const paidTotal = Math.max(0, data.contract_sum - outstanding);

              return (
                <div
                  className="grid gap-6 lg:grid-cols-[1fr_440px]"
                  data-timeline-count={activityByDay.length}
                >
                  {/* LEFT: unified timeline */}
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        All Activity
                      </h3>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setWorkbenchPanel("draft");
                            setWorkbenchEmailLogId(null);
                            setDraftMode("payment");
                            setEditingInvoiceId(null);
                            setPaymentDraft(buildPaymentDraft(data, settings));
                          }}
                        >
                          <CreditCardIcon className="mr-1.5 h-3.5 w-3.5" />{" "}
                          New Payment
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            prepareNewInvoice();
                            setInvoiceDraft((f) => ({
                              ...f,
                              invoice_number: `INV-${Date.now()
                                .toString()
                                .slice(-4)}`,
                              status: "DRAFT",
                            }));
                          }}
                        >
                          <PlusIcon className="mr-1.5 h-3.5 w-3.5" /> New Invoice
                        </Button>
                      </div>
                    </div>

                    {activityByDay.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-10 text-center">
                        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <ClockIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">
                          No activity yet
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Create an invoice or log a payment to get started.
                        </p>
                      </div>
                    ) : (
                      <div className="relative ml-5 pb-4">
                        {/* Timeline vertical line */}
                        <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />

                        {activityByDay.map(({ dateLabel, rows: groupItems }) => (
                          <div key={dateLabel} className="mb-2">
                            {/* Date group separator */}
                            <div className="relative mb-3 flex items-center gap-3 pl-6">
                              <div className="absolute -left-[5px] h-2.5 w-2.5 rounded-full border-2 border-background bg-border" />
                              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                {dateLabel}
                              </span>
                              <div className="flex-1 h-px bg-border/50" />
                            </div>

                            {/* Items within this date */}
                            <div className="space-y-2 pl-6">
                              {groupItems.map((row) => {
                                if (row.kind === "invoice") {
                                  const inv =
                                    row.invoiceId != null
                                      ? data.invoices.find(
                                          (entry) =>
                                            entry.invoice_id === row.invoiceId,
                                        ) ?? null
                                      : null;
                                  if (!inv) return null;

                                  const isOverdue = isInvoiceOverdue(inv);
                                  const isActive =
                                    editingInvoiceId === inv.invoice_id;
                                  const dotColor =
                                    inv.status === "PAID"
                                      ? "bg-emerald-500"
                                      : isOverdue
                                        ? "bg-red-500"
                                        : "bg-blue-500";

                                  return (
                                    <div key={row.id} className="relative">
                                      <div
                                        className={`absolute -left-[28px] top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-background ${dotColor}`}
                                      />
                                      <button
                                        className={`group w-full text-left rounded-xl border bg-card p-4 shadow-xs transition-all hover:shadow-md hover:border-primary/40 ${
                                          isActive
                                            ? "ring-2 ring-primary/60 border-primary/30 bg-primary/[0.03]"
                                            : ""
                                        }`}
                                        onClick={() => {
                                          prepareExistingInvoice(inv);
                                        }}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                Invoice
                                              </span>
                                              <span className="text-[10px] text-muted-foreground">
                                                ·
                                              </span>
                                              <code className="text-xs font-semibold text-foreground">
                                                #{inv.invoice_number}
                                              </code>
                                              <StatusBadge
                                                status={inv.status}
                                              />
                                              {isOverdue && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">
                                                  <AlertTriangleIcon className="h-2.5 w-2.5" />{" "}
                                                  Overdue
                                                </span>
                                              )}
                                            </div>
                                            <p className="text-xs text-muted-foreground truncate">
                                              {inv.service_description}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                              Due {formatDate(inv.due_date)}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-sm font-bold tabular-nums">
                                              {formatMoney(
                                                inv.amount,
                                                inv.currency,
                                              )}
                                            </span>
                                            <ChevronRightIcon className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                                          </div>
                                        </div>
                                      </button>
                                    </div>
                                  );
                                }

                                if (row.kind === "payment") {
                                  const p =
                                    row.paymentId != null
                                      ? data.payments.find(
                                          (entry) =>
                                            entry.payment_id === row.paymentId,
                                        ) ?? null
                                      : null;
                                  if (!p) return null;

                                  return (
                                    <div key={row.id} className="relative">
                                      <div className="absolute -left-[28px] top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" />
                                      <div className="group rounded-xl border bg-card p-4 shadow-xs">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 mb-1">
                                              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                                                Payment Received
                                              </span>
                                            </div>
                                            {p.note && (
                                              <p className="text-xs text-muted-foreground">
                                                {p.note}
                                              </p>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <span className="text-sm font-bold tabular-nums text-emerald-600">
                                              +{formatMoney(p.amount, p.currency)}
                                            </span>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                                              onClick={() => {
                                                void handlePaymentDelete(p);
                                              }}
                                              disabled={
                                                busyAction ===
                                                `delete-payment-${p.payment_id}`
                                              }
                                            >
                                              <Trash2Icon className="h-3.5 w-3.5" />
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }

                                if (row.kind === "email") {
                                  const log =
                                    row.emailLogId != null
                                      ? data.email_log.find(
                                          (e) => e.log_id === row.emailLogId,
                                        ) ?? null
                                      : null;
                                  if (!log) return null;

                                  const emailType = String(log.email_type ?? "")
                                    .trim()
                                    .toLowerCase();
                                  const isReminder = emailType === "reminder";
                                  const isGeneral = emailType === "general";
                                  const isActive =
                                    panelView === "email" &&
                                    panelEmail?.log_id === log.log_id;

                                  return (
                                    <div key={row.id} className="relative">
                                      <div
                                        className={`absolute -left-[28px] top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-background ${isReminder ? "bg-amber-400" : "bg-sky-400"}`}
                                      />
                                      <button
                                        className={`w-full text-left rounded-xl border bg-card p-4 shadow-xs transition-all hover:shadow-sm hover:border-foreground/20 ${
                                          isActive
                                            ? isReminder
                                              ? "ring-2 ring-amber-400 border-amber-300"
                                              : "ring-2 ring-sky-400 border-sky-300"
                                            : ""
                                        }`}
                                        onClick={() => {
                                          setWorkbenchPanel("email");
                                          setWorkbenchEmailLogId(log.log_id);
                                        }}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 mb-1">
                                              <MailIcon
                                                className={`h-3 w-3 shrink-0 ${isReminder ? "text-amber-500" : isGeneral ? "text-muted-foreground" : "text-sky-500"}`}
                                              />
                                              <span
                                                className={`text-[10px] font-bold uppercase tracking-wider ${isReminder ? "text-amber-700" : isGeneral ? "text-muted-foreground" : "text-sky-700"}`}
                                              >
                                                {isReminder
                                                  ? "Reminder Sent"
                                                  : isGeneral
                                                    ? "General Email Sent"
                                                    : "Invoice Email Sent"}
                                              </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground truncate">
                                              To: {log.to_email}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                                              {log.subject}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">
                                              {new Date(
                                                log.sent_at ??
                                                  log.created_at ??
                                                  "",
                                              ).toLocaleTimeString(
                                                "en-GB",
                                                {
                                                  hour: "2-digit",
                                                  minute: "2-digit",
                                                },
                                              )}
                                            </span>
                                            <span
                                              className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${isActive ? (isReminder ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700") : "bg-muted text-muted-foreground"}`}
                                            >
                                              {isActive ? "Viewing" : "View →"}
                                            </span>
                                          </div>
                                        </div>
                                      </button>
                                    </div>
                                  );
                                }

                                return null;
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* RIGHT: Draft / Edit / Email Preview panel */}
                  <div className="space-y-0">
                    <Card className="sticky top-[100px] overflow-hidden">
                      {/* ── EMAIL PREVIEW MODE ── */}
                      {panelView === "email" && panelEmail ? (
                        <>
                          {(() => {
                            const emailType = String(
                              panelEmail.email_type ?? "",
                            )
                              .trim()
                              .toLowerCase();
                            const isReminder = emailType === "reminder";
                            const isGeneral = emailType === "general";

                            return (
                              <>
                                <CardHeader
                                  className={`border-b pb-3 pt-4 px-5 ${
                                    isReminder ? "bg-amber-50" : "bg-sky-50"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        {isReminder ? (
                                          <AlertCircleIcon className="h-4 w-4 text-amber-500 shrink-0" />
                                        ) : isGeneral ? (
                                          <MailIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                                        ) : (
                                          <FileCheckIcon className="h-4 w-4 text-sky-500 shrink-0" />
                                        )}
                                        <span
                                          className={`text-[10px] font-bold uppercase tracking-wider ${isReminder ? "text-amber-700" : isGeneral ? "text-muted-foreground" : "text-sky-700"}`}
                                        >
                                          {isReminder
                                            ? "Reminder Sent"
                                            : isGeneral
                                              ? "General Email Sent"
                                              : "Invoice Email Sent"}
                                        </span>
                                      </div>
                                      <p className="text-sm font-semibold leading-tight truncate">
                                        {panelEmail.subject}
                                      </p>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                                      onClick={() => {
                                        setWorkbenchPanel("draft");
                                        setWorkbenchEmailLogId(null);
                                        setDraftMode("invoice");
                                      }}
                                    >
                                      <XIcon className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                                    <div>
                                      <span className="font-medium text-foreground">
                                        To:
                                      </span>{" "}
                                      {panelEmail.to_email}
                                    </div>
                                    <div>
                                      <span className="font-medium text-foreground">
                                        Sent:
                                      </span>{" "}
                                      {formatDateTime(panelEmail.sent_at)}
                                    </div>
                                  </div>
                                </CardHeader>
                                <CardContent className="px-5 pt-4 pb-5">
                                  <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground leading-relaxed">
                                    {panelEmail.body_preview ||
                                      "(No body recorded)"}
                                  </pre>
                                </CardContent>
                                <CardFooter className="border-t bg-muted/10 px-5 py-3 gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 text-xs"
                                    onClick={() => {
                                      prepareNewInvoice();
                                    }}
                                  >
                                    <PlusIcon className="mr-1.5 h-3.5 w-3.5" /> New
                                    Invoice
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="flex-1 text-xs"
                                    onClick={() => {
                                      const type: MessageMode =
                                        emailType === "reminder"
                                          ? "reminder"
                                          : emailType === "general"
                                            ? "general"
                                            : "invoice";
                                      setMessageMode(type);
                                      setMailResult(null);
                                      setSelectedInvoiceId(
                                        type === "general"
                                          ? null
                                          : panelEmail.invoice_id ?? null,
                                      );
                                      setMessageDraft({
                                        to_email: panelEmail.to_email ?? "",
                                        subject: `Re: ${panelEmail.subject ?? ""}`,
                                        body: "",
                                      });
                                      setCommStep("compose");
                                      setActiveTab("communication");
                                      setWorkbenchPanel("draft");
                                      setWorkbenchEmailLogId(null);
                                    }}
                                  >
                                    <SendIcon className="mr-1.5 h-3.5 w-3.5" />{" "}
                                    Reply / Follow up
                                  </Button>
                                </CardFooter>
                              </>
                            );
                          })()}
                        </>
                      ) : (
                        <>
                          {/* ── EDIT MODE header ── */}
                          {editingInvoiceId !== null &&
                          panelView === "invoice" ? (
                            <div className="border-b border-blue-200 bg-blue-50 px-5 pb-3 pt-4">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <PencilLineIcon className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                                      Editing Invoice
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-base font-bold text-foreground">
                                      #{invoiceDraft.invoice_number}
                                    </span>
                                    <StatusBadge status={invoiceDraft.status} />
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {invoiceDraft.service_description}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    asChild
                                    variant="outline"
                                    size="sm"
                                    className="h-7 shrink-0 gap-1 border-blue-200 bg-white text-xs text-blue-700 hover:bg-blue-50"
                                    title="View invoice (print from browser)"
                                  >
                                    <a
                                      href={`${API_BASE.replace(/\/$/, "")}/api/finance/invoices/${editingInvoiceId}/html`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <FileTextIcon className="size-4 shrink-0" />
                                      View
                                    </a>
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 shrink-0 gap-1 border-blue-200 bg-white text-xs text-blue-700 hover:bg-blue-50"
                                    onClick={() => {
                                      setEditingInvoiceId(null);
                                      setInvoiceDraft((f) => ({
                                        ...f,
                                        invoice_number: "",
                                        status: "DRAFT",
                                      }));
                                    }}
                                  >
                                    <XIcon className="h-3 w-3" /> New
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* ── DRAFT NEW header ── */
                            <CardHeader className="border-b bg-muted/20 pb-3 pt-4 px-5">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-semibold">
                                  Draft New
                                </CardTitle>
                                <div className="flex items-center gap-1 rounded-full border bg-background p-0.5 shadow-sm">
                                  <Button
                                    variant={
                                      panelView === "invoice"
                                        ? "default"
                                        : "ghost"
                                    }
                                    size="sm"
                                    className="h-7 rounded-full text-xs px-3"
                                    onClick={() => {
                                      setDraftMode("invoice");
                                    }}
                                  >
                                    Invoice
                                  </Button>
                                  <Button
                                    variant={
                                      panelView === "payment"
                                        ? "default"
                                        : "ghost"
                                    }
                                    size="sm"
                                    className="h-7 rounded-full text-xs px-3"
                                    onClick={() => {
                                      setDraftMode("payment");
                                      setEditingInvoiceId(null);
                                    }}
                                  >
                                    Payment
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                          )}

                          {panelView === "invoice" ? (
                            <>
                              <CardContent className="space-y-4 pt-5 px-5 text-sm">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label>Invoice Number</Label>
                                    <Input
                                      value={invoiceDraft.invoice_number}
                                      onChange={(e) =>
                                        setInvoiceDraft((current) => ({
                                          ...current,
                                          invoice_number: e.target.value,
                                        }))
                                      }
                                      placeholder="001"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label>Status</Label>
                                    <Select
                                      value={invoiceDraft.status}
                                      onValueChange={(v) =>
                                        setInvoiceDraft((current) => ({
                                          ...current,
                                          status: v,
                                        }))
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="DRAFT">
                                          DRAFT
                                        </SelectItem>
                                        <SelectItem value="SENT">
                                          SENT
                                        </SelectItem>
                                        <SelectItem value="PAID">
                                          PAID
                                        </SelectItem>
                                        <SelectItem value="CANCELLED">
                                          CANCELLED
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label>Issue Date</Label>
                                    <Input
                                      type="date"
                                      value={invoiceDraft.issue_date}
                                      onChange={(e) =>
                                        setInvoiceDraft((current) => ({
                                          ...current,
                                          issue_date: e.target.value,
                                        }))
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label>Due Date</Label>
                                    <Input
                                      type="date"
                                      value={invoiceDraft.due_date}
                                      onChange={(e) =>
                                        setInvoiceDraft((current) => ({
                                          ...current,
                                          due_date: e.target.value,
                                        }))
                                      }
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  <Label>Amount</Label>
                                  <div className="flex gap-2">
                                    <Input
                                      type="number"
                                      value={invoiceDraft.amount}
                                      onChange={(e) =>
                                        setInvoiceDraft((current) => ({
                                          ...current,
                                          amount: e.target.value,
                                        }))
                                      }
                                      className="flex-1"
                                    />
                                    <Select
                                      value={invoiceDraft.currency}
                                      onValueChange={(v) =>
                                        setInvoiceDraft((current) => ({
                                          ...current,
                                          currency: v,
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="w-24">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {currencyOptions.map((currency) => (
                                          <SelectItem
                                            key={currency}
                                            value={currency}
                                          >
                                            {currency}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>

                                <Separator />

                                <div className="space-y-1.5">
                                  <Label>Client Name</Label>
                                  <Input
                                    value={invoiceDraft.client_name}
                                    onChange={(e) =>
                                      setInvoiceDraft((current) => ({
                                        ...current,
                                        client_name: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Client Email</Label>
                                  <Input
                                    type="email"
                                    value={invoiceDraft.client_email}
                                    onChange={(e) =>
                                      setInvoiceDraft((current) => ({
                                        ...current,
                                        client_email: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Client Address</Label>
                                  <Input
                                    value={invoiceDraft.client_address}
                                    onChange={(e) =>
                                      setInvoiceDraft((current) => ({
                                        ...current,
                                        client_address: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Service Description</Label>
                                  <Input
                                    value={invoiceDraft.service_description}
                                    onChange={(e) =>
                                      setInvoiceDraft((current) => ({
                                        ...current,
                                        service_description: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Line Items</Label>
                                  <Textarea
                                    rows={2}
                                    value={invoiceDraft.items_json}
                                    onChange={(e) =>
                                      setInvoiceDraft((current) => ({
                                        ...current,
                                        items_json: e.target.value,
                                      }))
                                    }
                                    placeholder="Item 1 - 1000 MKD..."
                                  />
                                </div>

                                <Separator />

                                <div className="space-y-2.5">
                                  <div className="flex items-center justify-between">
                                    <Label
                                      className="cursor-pointer"
                                      htmlFor="reminders-toggle"
                                    >
                                      Auto Reminders
                                    </Label>
                                    <input
                                      id="reminders-toggle"
                                      type="checkbox"
                                      checked={
                                        invoiceDraft.reminders_enabled ===
                                        "1"
                                      }
                                      onChange={(e) =>
                                        setInvoiceDraft((current) => ({
                                          ...current,
                                          reminders_enabled: e.target.checked
                                            ? "1"
                                            : "0",
                                        }))
                                      }
                                      className="h-4 w-4 rounded border-gray-300 text-primary"
                                    />
                                  </div>
                                  {invoiceDraft.reminders_enabled === "1" && (
                                    <div className="grid grid-cols-3 gap-2">
                                      <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">
                                          First after (d)
                                        </Label>
                                        <Input
                                          type="number"
                                          value={
                                            invoiceDraft.reminder_first_after_days
                                          }
                                          onChange={(e) =>
                                            setInvoiceDraft((current) => ({
                                              ...current,
                                              reminder_first_after_days:
                                                e.target.value,
                                            }))
                                          }
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">
                                          Repeat (d)
                                        </Label>
                                        <Input
                                          type="number"
                                          value={
                                            invoiceDraft.reminder_repeat_days
                                          }
                                          onChange={(e) =>
                                            setInvoiceDraft((current) => ({
                                              ...current,
                                              reminder_repeat_days:
                                                e.target.value,
                                            }))
                                          }
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">
                                          Max count
                                        </Label>
                                        <Input
                                          type="number"
                                          value={
                                            invoiceDraft.reminder_max_count
                                          }
                                          onChange={(e) =>
                                            setInvoiceDraft((current) => ({
                                              ...current,
                                              reminder_max_count:
                                                e.target.value,
                                            }))
                                          }
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </CardContent>

                              <CardFooter className="flex-col gap-2 border-t px-5 pt-4 pb-5">
                                <div className="flex w-full gap-2">
                                  <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => {
                                      setEditingInvoiceId(null);
                                      setInvoiceDraft((f) => ({
                                        ...f,
                                        invoice_number: `INV-${Date.now()
                                          .toString()
                                          .slice(-4)}`,
                                        status: "DRAFT",
                                      }));
                                    }}
                                  >
                                    <CopyIcon className="mr-1.5 h-3.5 w-3.5" />{" "}
                                    Copy to New
                                  </Button>
                                  <Button
                                    className="flex-1"
                                    onClick={() =>
                                      void handleInvoiceSave({
                                        preventDefault: () => undefined,
                                      } as unknown as React.FormEvent<HTMLFormElement>)
                                    }
                                  >
                                    <SaveIcon className="mr-1.5 h-3.5 w-3.5" />{" "}
                                    {editingInvoiceId !== null
                                      ? "Update Invoice"
                                      : "Create Invoice"}
                                  </Button>
                                </div>
                                <div className="flex w-full gap-2">
                                  <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => {
                                      const invId = editingInvoiceId;
                                      setMessageMode("invoice");
                                      setSelectedInvoiceId(invId);
                                      setMailResult(null);
                                      if (invId !== null) {
                                        const inv = data.invoices.find(
                                          (i) => i.invoice_id === invId,
                                        );
                                        if (inv) {
                                          setMessageDraft(
                                            buildMessageDraft(
                                              "invoice",
                                              data,
                                              inv,
                                              settings,
                                            ),
                                          );
                                          setCommStep("compose");
                                        }
                                      } else {
                                        setCommStep("pick-invoice");
                                      }
                                      setActiveTab("communication");
                                    }}
                                  >
                                    <SendIcon className="mr-1.5 h-3.5 w-3.5" />{" "}
                                    Send Invoice
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => {
                                      const invId = editingInvoiceId;
                                      setMessageMode("reminder");
                                      setSelectedInvoiceId(invId);
                                      setMailResult(null);
                                      if (invId !== null) {
                                        const inv = data.invoices.find(
                                          (i) => i.invoice_id === invId,
                                        );
                                        if (inv) {
                                          setMessageDraft(
                                            buildMessageDraft(
                                              "reminder",
                                              data,
                                              inv,
                                              settings,
                                            ),
                                          );
                                          setCommStep("compose");
                                        }
                                      } else {
                                        setCommStep("pick-invoice");
                                      }
                                      setActiveTab("communication");
                                    }}
                                  >
                                    <ClockIcon className="mr-1.5 h-3.5 w-3.5" />{" "}
                                    Send Reminder
                                  </Button>
                                </div>
                              </CardFooter>
                            </>
                          ) : (
                            <>
                              <CardContent className="space-y-4 pt-5 px-5 text-sm">
                                <div className="space-y-1.5">
                                  <Label>Date</Label>
                                  <Input
                                    type="date"
                                    value={paymentDraft.payment_date}
                                    onChange={(e) =>
                                      setPaymentDraft((current) => ({
                                        ...current,
                                        payment_date: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Amount</Label>
                                  <div className="flex gap-2">
                                    <Input
                                      type="number"
                                      value={paymentDraft.amount}
                                      onChange={(e) =>
                                        setPaymentDraft((current) => ({
                                          ...current,
                                          amount: e.target.value,
                                        }))
                                      }
                                      className="flex-1"
                                    />
                                    <Select
                                      value={paymentDraft.currency}
                                      onValueChange={(v) =>
                                        setPaymentDraft((current) => ({
                                          ...current,
                                          currency: v,
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="w-24">
                                        <SelectValue placeholder="Currency" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {currencyOptions.map((currency) => (
                                          <SelectItem
                                            key={currency}
                                            value={currency}
                                          >
                                            {currency}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Note (Optional)</Label>
                                  <Input
                                    placeholder="e.g. wire transfer, cash, check"
                                    value={paymentDraft.note}
                                    onChange={(e) =>
                                      setPaymentDraft((current) => ({
                                        ...current,
                                        note: e.target.value,
                                      }))
                                    }
                                  />
                                </div>

                                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                                  <div className="flex justify-between">
                                    <span>Contract sum</span>
                                    <span className="font-medium text-foreground">
                                      {formatMoney(
                                        data.contract_sum,
                                        data.currency,
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Paid so far</span>
                                    <span className="font-medium text-emerald-600">
                                      {formatMoney(paidTotal, data.currency)}
                                    </span>
                                  </div>
                                  <Separator className="my-1" />
                                  <div className="flex justify-between font-semibold">
                                    <span>Outstanding</span>
                                    <span className="text-amber-600">
                                      {formatMoney(outstanding, data.currency)}
                                    </span>
                                  </div>
                                </div>
                              </CardContent>
                              <CardFooter className="border-t px-5 pt-4 pb-5">
                                <Button
                                  className="w-full"
                                  onClick={() =>
                                    void handlePaymentCreate({
                                      preventDefault: () => undefined,
                                    } as unknown as React.FormEvent<HTMLFormElement>)
                                  }
                                >
                                  <CheckCircle2Icon className="mr-2 h-4 w-4" />{" "}
                                  Record Payment
                                </Button>
                              </CardFooter>
                            </>
                          )}
                        </>
                      )}
                    </Card>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="space-y-5 px-6 pb-5">
          <div
            className={cn(
              "grid gap-5",
              hasAnyFinanceActivity &&
                "xl:grid-cols-[minmax(0,1.5fr)_minmax(520px,1fr)]",
            )}
            data-timeline-count={timeline.length}
          >
            {hasAnyFinanceActivity ? (
              <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
                  All activity
                </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setWorkbenchPanel("draft");
                    setWorkbenchEmailLogId(null);
                    setDraftMode("payment");
                    setPaymentDraft(buildPaymentDraft(data, settings));
                  }}
                >
                  <BanknoteIcon className="size-4" />
                  New Payment
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => prepareNewInvoice()}
                >
                  <PlusIcon className="size-4" />
                  New Invoice
                </Button>
              </div>
            </div>

            {activityByDay.length ? (
              <div className="relative pl-8">
                <div className="absolute bottom-0 left-[14px] top-0 w-px bg-[#d7deea]" />
                <div className="space-y-8">
                  {activityByDay.map((dayGroup) => (
                    <div key={dayGroup.dateLabel} className="space-y-3">
                      <p className="pl-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                        {dayGroup.dateLabel}
                      </p>
                      <div className="space-y-3">
                  {dayGroup.rows.map((row) => {
                    const Icon =
                      row.kind === "payment"
                        ? BanknoteIcon
                        : row.kind === "invoice"
                          ? FileTextIcon
                          : MailIcon;
                    const iconClassName =
                      row.kind === "payment"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                        : row.kind === "invoice"
                          ? row.tone === "warning"
                            ? "border-rose-200 bg-rose-50 text-rose-500"
                            : "border-blue-200 bg-blue-50 text-blue-500"
                          : row.tone === "warning"
                            ? "border-amber-200 bg-amber-50 text-amber-500"
                            : "border-sky-200 bg-sky-50 text-sky-500";
                    const invoice =
                      row.invoiceId != null
                        ? data.invoices.find(
                            (entry) => entry.invoice_id === row.invoiceId,
                          ) ?? null
                        : null;
                    const rowBody = (
                      <div
                        className={cn(
                          "rounded-[22px] border border-[#d9e0eb] bg-white px-4 py-3 shadow-sm transition-colors hover:border-[#bfd0e6]",
                          row.kind === "email" &&
                            workbenchPanel === "email" &&
                            workbenchEmailLogId === row.emailLogId &&
                            "border-sky-200 ring-2 ring-sky-200",
                        )}
                      >
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span>{`${row.dateLabel} ${formatDate(row.timestamp)}`}</span>
                              <span className="font-semibold text-slate-950">
                                {row.title}
                              </span>
                              {row.badges?.map((badge) => (
                                <span
                                  key={`${row.id}-${badge.label}`}
                                  className={cn(
                                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em]",
                                    badge.tone === "warning"
                                      ? "border-amber-200 bg-amber-50 text-amber-700"
                                      : badge.tone === "success"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : "border-blue-200 bg-blue-50 text-blue-700",
                                  )}
                                >
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                            <p className="truncate text-sm text-slate-600">
                              {row.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 md:pl-4">
                            {row.amount ? (
                              <span
                                className={cn(
                                  "inline-flex whitespace-nowrap items-baseline gap-1.5 text-sm font-semibold",
                                  row.kind === "payment"
                                    ? "text-emerald-600"
                                    : row.tone === "warning"
                                      ? "text-amber-700"
                                      : "text-slate-900",
                                )}
                              >
                                <span className="text-[0.62em] font-semibold uppercase tracking-[0.12em] opacity-70">
                                  {String(row.currency ?? "").trim().toUpperCase()}
                                </span>
                                <span>
                                  {row.kind === "payment" ? "+" : ""}
                                  {formatAmountNumber(row.amount)}
                                </span>
                              </span>
                            ) : null}
                            {invoice &&
                            recommendation?.intent === "reminder" &&
                            needsReminder?.invoice_id === invoice.invoice_id ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  runRecommendationAction();
                                }}
                              >
                                Take action
                              </Button>
                            ) : null}
                            {row.kind === "invoice" && row.invoiceId != null ? (
                              <Button
                                size="sm"
                                variant="outline"
                                asChild
                                title="View invoice (print from browser)"
                                className="gap-1.5"
                              >
                                <a
                                  href={`${API_BASE.replace(/\/$/, "")}/api/finance/invoices/${row.invoiceId}/html`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <FileTextIcon className="size-4 shrink-0" />
                                  View
                                </a>
                              </Button>
                            ) : null}
                            {row.kind === "payment" && row.paymentId != null ? (
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const payment = data.payments.find(
                                    (entry) => entry.payment_id === row.paymentId,
                                  );
                                  if (payment) {
                                    void handlePaymentDelete(payment);
                                  }
                                }}
                                disabled={
                                  busyAction === `delete-payment-${row.paymentId}`
                                }
                              >
                                <Trash2Icon className="size-4 text-slate-400" />
                                <span className="sr-only">Delete payment</span>
                              </Button>
                            ) : row.kind === "email" ? (
                              <span className="text-xs font-semibold text-sky-600">
                                View →
                              </span>
                            ) : row.kind === "invoice" ? (
                              <ChevronRightIcon className="size-4 text-slate-400" />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );

                    return (
                      <div key={row.id} className="relative">
                        <div
                          className={cn(
                            "absolute left-[-32px] top-5 flex size-7 items-center justify-center rounded-full border shadow-sm",
                            iconClassName,
                          )}
                        >
                          <Icon className="size-3.5" />
                        </div>
                        {invoice ? (
                          <div
                            role="button"
                            tabIndex={0}
                            className="block w-full cursor-pointer text-left"
                            onClick={() => prepareExistingInvoice(invoice)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                prepareExistingInvoice(invoice);
                              }
                            }}
                          >
                            {rowBody}
                          </div>
                        ) : row.kind === "email" &&
                          row.emailLogId != null ? (
                          <div
                            role="button"
                            tabIndex={0}
                            className="block w-full cursor-pointer text-left"
                            onClick={() => {
                              setWorkbenchPanel("email");
                              setWorkbenchEmailLogId(row.emailLogId!);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setWorkbenchPanel("email");
                                setWorkbenchEmailLogId(row.emailLogId!);
                              }
                            }}
                          >
                            {rowBody}
                          </div>
                        ) : (
                          rowBody
                        )}
                      </div>
                    );
                  })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            </div>
            ) : null}

            <div
              ref={draftFormRef}
              className={cn(
                "xl:sticky xl:top-4 xl:self-start",
                highlightDraft && "rounded-[20px] ring-2 ring-primary ring-offset-2",
              )}
            >
            {workbenchPanel === "email" && workbenchPreviewEmail ? (
              <SectionCard
                title={
                  String(
                    workbenchPreviewEmail.email_type ?? "",
                  )
                    .trim()
                    .toLowerCase() === "reminder"
                    ? "Reminder sent"
                    : String(
                          workbenchPreviewEmail.email_type ?? "",
                        )
                          .trim()
                          .toLowerCase() === "general"
                      ? "General email"
                      : "Invoice email sent"
                }
                description={`To ${displayText(workbenchPreviewEmail.to_email)} · ${formatDateTime(workbenchPreviewEmail.sent_at)}`}
              >
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Subject
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {displayText(workbenchPreviewEmail.subject, "(no subject)")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Body preview
                    </p>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-[#e7ebf2] bg-[#fafbfd] p-3 text-xs text-slate-700">
                      {displayText(
                        workbenchPreviewEmail.body_preview,
                        "—",
                      )}
                    </pre>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setWorkbenchPanel("draft");
                        setWorkbenchEmailLogId(null);
                      }}
                    >
                      Back to draft
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        const invId = workbenchPreviewEmail.invoice_id;
                        const inv =
                          invId != null
                            ? data.invoices.find((i) => i.invoice_id === invId)
                            : selectedInvoice ?? data.invoices[0] ?? null;
                        if (!inv) {
                          setNotice({
                            tone: "error",
                            message:
                              "No invoice to attach. Create or select an invoice first.",
                          });
                          return;
                        }
                        setSelectedInvoiceId(inv.invoice_id);
                        setEditingInvoiceId(inv.invoice_id);
                        setInvoiceDraft(buildExistingInvoiceDraft(inv));
                        const t = String(
                          workbenchPreviewEmail.email_type ?? "",
                        )
                          .trim()
                          .toLowerCase();
                        const mode: MessageMode =
                          t === "reminder"
                            ? "reminder"
                            : t === "general"
                              ? "general"
                              : "invoice";
                        setMessageMode(mode);
                        setMessageDraft(
                          buildMessageDraft(mode, data, inv, settings),
                        );
                        setMailResult(null);
                        setCommStep("compose");
                        setActiveTab("communication");
                        setWorkbenchPanel("draft");
                        setWorkbenchEmailLogId(null);
                      }}
                    >
                      Open in Communication
                    </Button>
                  </div>
                </div>
              </SectionCard>
            ) : (
            <SectionCard
              title={
                draftMode === "invoice"
                  ? editingInvoiceId == null
                    ? "Draft New"
                    : `Editing ${
                        editingInvoice?.invoice_number || `#${editingInvoiceId}`
                      }`
                  : "New Payment"
              }
              description={
                draftMode === "invoice"
                  ? editingInvoiceId == null
                    ? "Create a new invoice for this case."
                    : "Update the selected invoice for this case."
                  : "Capture the next payment against this case balance."
              }
              action={
                <div className="flex items-center gap-2">
                  {draftMode === "invoice" && editingInvoice ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleInvoiceDelete(editingInvoice)}
                      disabled={
                        busyAction ===
                        `delete-invoice-${editingInvoice.invoice_id}`
                      }
                    >
                      <Trash2Icon className="size-4 text-slate-400" />
                      <span className="sr-only">Delete invoice</span>
                    </Button>
                  ) : null}
                  {draftMode === "invoice" && editingInvoice ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={cancelInvoiceEditing}
                    >
                      New Draft
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      draftMode === "invoice"
                        ? resetInvoiceDraft()
                        : setPaymentDraft(buildPaymentDraft(data, settings))
                    }
                  >
                    Reset
                  </Button>
                  <SegmentedControl
                    value={draftMode}
                    onChange={(value) =>
                      setDraftMode(value as WorkbenchDraftMode)
                    }
                    options={[
                      { value: "invoice", label: "Invoice" },
                      { value: "payment", label: "Payment" },
                    ]}
                  />
                </div>
              }
            >
              {draftMode === "invoice" ? (
                <form className="space-y-4" onSubmit={handleInvoiceSave}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Invoice Number">
                      <Input
                        ref={invoiceNumberInputRef}
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
                    <Field label="Issue Date">
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
                    <Field label="Due Date">
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
                  </div>

                  <div className="grid gap-4 md:grid-cols-[1fr_110px]">
                    <Field label="Amount">
                      <Input
                        inputMode="decimal"
                        value={invoiceDraft.amount}
                        onKeyDown={handleDraftFieldKeyDown}
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
                  </div>

                  <div className="border-t border-[#edf0f5]" />

                  <Field label="Client Name">
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
                  <Field label="Client Email">
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
                  <Field label="Client Address">
                    <Input
                      value={invoiceDraft.client_address}
                      onChange={(event) =>
                        setInvoiceDraft((current) => ({
                          ...current,
                          client_address: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Service Description">
                    <Input
                      value={invoiceDraft.service_description}
                      onChange={(event) =>
                        setInvoiceDraft((current) => ({
                          ...current,
                          service_description: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Line Items">
                    <Textarea
                      className="min-h-24"
                      value={invoiceDraft.items_json}
                      onChange={(event) =>
                        setInvoiceDraft((current) => ({
                          ...current,
                          items_json: event.target.value,
                        }))
                      }
                    />
                  </Field>

                  <div className="space-y-3 rounded-[20px] border border-[#e6ebf2] bg-[#fafbfd] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Auto Reminders
                        </p>
                        <p className="text-xs text-slate-500">
                          Reuse the existing reminder cadence on this invoice.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={invoiceDraft.reminders_enabled === "1"}
                        onChange={(event) =>
                          setInvoiceDraft((current) => ({
                            ...current,
                            reminders_enabled: event.target.checked ? "1" : "0",
                          }))
                        }
                        className="size-4 rounded border-[#c8d1de] text-primary focus:ring-primary"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="First After (d)">
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
                      <Field label="Repeat (d)">
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
                      <Field label="Max Count">
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
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!editingInvoice}
                      onClick={() => prepareNewInvoice(editingInvoice)}
                    >
                      Copy to New
                    </Button>
                    <Button
                      type="submit"
                      disabled={busyAction === "save-invoice"}
                    >
                      <SaveIcon className="size-4" />
                      {editingInvoiceId == null ? "Create Invoice" : "Save Invoice"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!editingInvoice}
                      onClick={() => openInvoiceCommunication("invoice")}
                    >
                      Send Invoice
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!editingInvoice}
                      onClick={() => openInvoiceCommunication("reminder")}
                    >
                      Send Reminder
                    </Button>
                  </div>
                </form>
              ) : (
                <form className="space-y-4" onSubmit={handlePaymentCreate}>
                  <div className="rounded-[20px] border border-[#dce7dd] bg-emerald-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                      Outstanding
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-950">
                      {formatMoney(data.remaining, data.currency)}
                    </p>
                    <p className="mt-1 text-sm text-emerald-800/80">
                      {data.payments.length} payment record(s) captured so far.
                    </p>
                  </div>

                  <Field label="Payment Date">
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
                  <div className="grid gap-4 md:grid-cols-[1fr_110px]">
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
                  </div>
                  <Field label="Internal Note">
                    <Textarea
                      className="min-h-28"
                      value={paymentDraft.note}
                      onChange={(event) =>
                        setPaymentDraft((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      type="submit"
                      disabled={busyAction === "create-payment"}
                    >
                      <WalletIcon className="size-4" />
                      Record Payment
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPaymentDraft(buildPaymentDraft(data, settings))}
                    >
                      Reset
                    </Button>
                  </div>
                </form>
              )}
            </SectionCard>
            )}
          </div>
          </div>
        </div>
      ) ) : null}
      {activeTab === "communication" ? (
        VERBATIM_REPLIT_UI_PORT ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_400px] px-6 pb-5">
            {/* Verbatim Replit UI port: Communication */}
            <Card className="overflow-hidden">
              {/* ── STEP: pick-type ── */}
              {commStep === "pick-type" && (
                <>
                  <CardHeader className="border-b bg-muted/20 pb-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MailIcon className="h-4 w-4 text-primary" /> New Email
                    </CardTitle>
                    <CardDescription>
                      Choose what you would like to send
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-8 pb-10">
                    <div className="grid grid-cols-3 gap-4">
                      <button
                        className="rounded-xl border-2 border-dashed p-5 text-left transition-all hover:border-sky-400 hover:bg-sky-50 group"
                        onClick={() => {
                          setMessageMode("invoice");
                          setSelectedInvoiceId(null);
                          setCommStep("pick-invoice");
                        }}
                      >
                        <FileCheckIcon className="h-6 w-6 text-sky-500 mb-3" />
                        <p className="text-sm font-semibold">Invoice Email</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          Send an invoice to the client
                        </p>
                      </button>
                      <button
                        className="rounded-xl border-2 border-dashed p-5 text-left transition-all hover:border-amber-400 hover:bg-amber-50 group"
                        onClick={() => {
                          setMessageMode("reminder");
                          setSelectedInvoiceId(null);
                          setCommStep("pick-invoice");
                        }}
                      >
                        <AlertCircleIcon className="h-6 w-6 text-amber-500 mb-3" />
                        <p className="text-sm font-semibold">
                          Payment Reminder
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          Remind client about an outstanding invoice
                        </p>
                      </button>
                      <button
                        className="rounded-xl border-2 border-dashed p-5 text-left transition-all hover:border-primary hover:bg-primary/5 group"
                        onClick={() => {
                          const inv = selectedInvoice ?? data.invoices[0] ?? null;
                          setMessageMode("general");
                          setSelectedInvoiceId(null);
                          setMailResult(null);
                          setMessageDraft(
                            inv
                              ? buildMessageDraft("general", data, inv, settings)
                              : { to_email: "", subject: "", body: "" },
                          );
                          setCommStep("compose");
                        }}
                      >
                        <MailIcon className="h-6 w-6 text-muted-foreground mb-3" />
                        <p className="text-sm font-semibold">General Email</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          Any other message to the client
                        </p>
                      </button>
                    </div>
                  </CardContent>
                </>
              )}

              {/* ── STEP: pick-invoice ── */}
              {commStep === "pick-invoice" && (
                <>
                  <CardHeader className="border-b bg-muted/20 pb-4">
                    <div className="flex items-center gap-3">
                      <button
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => {
                          setCommStep("pick-type");
                          setMessageMode(null);
                        }}
                      >
                        <ChevronLeftIcon className="h-5 w-5" />
                      </button>
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {messageMode === "reminder" ? (
                            <>
                              <AlertCircleIcon className="h-4 w-4 text-amber-500" />{" "}
                              Payment Reminder
                            </>
                          ) : (
                            <>
                              <FileCheckIcon className="h-4 w-4 text-sky-500" />{" "}
                              Invoice Email
                            </>
                          )}
                        </CardTitle>
                        <CardDescription>
                          Select the invoice this email is about
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-5 pb-6 space-y-3">
                    {data.invoices.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-10">
                        No invoices found.
                      </p>
                    )}
                    {data.invoices.map((inv) => {
                      const isOverdue = isInvoiceOverdue(inv);
                      return (
                        <button
                          key={inv.invoice_id}
                          className="w-full text-left rounded-xl border-2 border-transparent bg-muted/30 p-4 transition-all hover:border-primary hover:bg-primary/5"
                          onClick={() => {
                            if (!messageMode) {
                              return;
                            }
                            setSelectedInvoiceId(inv.invoice_id);
                            setMessageDraft(
                              buildMessageDraft(
                                messageMode,
                                data,
                                inv,
                                settings,
                              ),
                            );
                            setMailResult(null);
                            setCommStep("compose");
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold">
                                  Invoice #{inv.invoice_number}
                                </span>
                                <StatusBadge status={inv.status} />
                                {isOverdue && (
                                  <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                                    Overdue
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {inv.service_description}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold">
                                {formatMoney(inv.amount, inv.currency)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                Due: {formatDate(inv.due_date)}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </CardContent>
                </>
              )}

              {/* ── STEP: compose ── */}
              {commStep === "compose" && (
                <>
                  <CardHeader className="border-b bg-muted/20 pb-3 pt-4">
                    <div className="flex items-center gap-3">
                      <button
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        onClick={() => {
                          if (messageMode === "general") {
                            setCommStep("pick-type");
                            setMessageMode(null);
                          } else {
                            setCommStep("pick-invoice");
                            setSelectedInvoiceId(null);
                          }
                        }}
                      >
                        <ChevronLeftIcon className="h-5 w-5" />
                      </button>
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {messageMode === "invoice" ? (
                          <>
                            <FileCheckIcon className="h-4 w-4 text-sky-500 shrink-0" />
                            <span className="text-sm font-semibold">
                              Invoice Email
                            </span>
                          </>
                        ) : messageMode === "reminder" ? (
                          <>
                            <AlertCircleIcon className="h-4 w-4 text-amber-500 shrink-0" />
                            <span className="text-sm font-semibold">
                              Payment Reminder
                            </span>
                          </>
                        ) : (
                          <>
                            <MailIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-semibold">
                              General Email
                            </span>
                          </>
                        )}
                        {selectedInvoiceId !== null &&
                          (() => {
                            const inv = data.invoices.find(
                              (i) => i.invoice_id === selectedInvoiceId,
                            );
                            return inv ? (
                              <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground shrink-0">
                                Re: Invoice #{inv.invoice_number}
                              </span>
                            ) : null;
                          })()}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-5">
                    <div className="space-y-2">
                      <Label>To</Label>
                      <Input
                        value={messageDraft.to_email}
                        onChange={(e) =>
                          setMessageDraft((current) => ({
                            ...current,
                            to_email: e.target.value,
                          }))
                        }
                        placeholder="client@example.com"
                      />
                      {rememberedRecipients.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {rememberedRecipients.map((em) => (
                            <Badge
                              key={em}
                              variant="outline"
                              className="cursor-pointer font-normal text-xs hover:bg-muted"
                              onClick={() =>
                                setMessageDraft((current) => ({
                                  ...current,
                                  to_email: em,
                                }))
                              }
                            >
                              {em}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Subject</Label>
                      <Input
                        value={messageDraft.subject}
                        onChange={(e) =>
                          setMessageDraft((current) => ({
                            ...current,
                            subject: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Message Body</Label>
                      <Textarea
                        rows={10}
                        value={messageDraft.body}
                        onChange={(e) =>
                          setMessageDraft((current) => ({
                            ...current,
                            body: e.target.value,
                          }))
                        }
                        className="font-mono text-sm leading-relaxed"
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="justify-end gap-3 border-t bg-muted/10 py-4">
                    <Button
                      variant="secondary"
                      onClick={() => void handleMessageSend(true)}
                    >
                      <PlayIcon className="mr-2 h-4 w-4" /> Dry Run
                    </Button>
                    <Button onClick={() => void handleMessageSend(false)}>
                      <SendIcon className="mr-2 h-4 w-4" /> Send Now
                    </Button>
                  </CardFooter>
                </>
              )}

              {/* ── STEP: sent ── */}
              {commStep === "sent" &&
                mailResult &&
                mailResult.ok &&
                !mailResult.dry_run && (
                <>
                  <CardHeader className="border-b bg-emerald-50 pb-4 pt-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                        <CheckCircle2Icon className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-emerald-800">
                          Email Sent
                        </CardTitle>
                        <CardDescription className="text-emerald-600 text-xs">
                          Successfully delivered
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-5 pb-2 space-y-3">
                    <div className="rounded-xl border bg-muted/20 p-4 space-y-2.5 text-sm">
                      <div className="flex gap-3">
                        <span className="text-muted-foreground w-16 shrink-0">
                          Type
                        </span>
                        <span className="font-medium capitalize">
                          {messageMode ?? ""}
                        </span>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-muted-foreground w-16 shrink-0">
                          To
                        </span>
                        <span className="font-medium">
                          {mailResult.to_email}
                        </span>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-muted-foreground w-16 shrink-0">
                          Subject
                        </span>
                        <span className="font-medium">
                          {mailResult.subject}
                        </span>
                      </div>
                      {selectedInvoiceId !== null &&
                        (() => {
                          const inv = data.invoices.find(
                            (i) => i.invoice_id === selectedInvoiceId,
                          );
                          return inv ? (
                            <div className="flex gap-3">
                              <span className="text-muted-foreground w-16 shrink-0">
                                Invoice
                              </span>
                              <span className="font-medium">
                                #{inv.invoice_number}
                              </span>
                            </div>
                          ) : null;
                        })()}
                      <div className="flex gap-3">
                        <span className="text-muted-foreground w-16 shrink-0">
                          Sent at
                        </span>
                        <span className="font-medium">
                          {formatDateTime(
                            (mailResult as unknown as { sent_at?: string | null }).sent_at,
                          )}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="gap-3 border-t bg-muted/10 py-4 mt-4">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setCommStep("pick-type");
                        setMessageMode(null);
                        setSelectedInvoiceId(null);
                        setMailResult(null);
                        setMessageDraft(buildBlankMessageDraft(data, null));
                      }}
                    >
                      <PlusIcon className="mr-2 h-4 w-4" /> New Email
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => {
                        if (selectedInvoiceId !== null) {
                          setCommStep("compose");
                        } else {
                          setCommStep("pick-type");
                          setMessageMode(null);
                        }
                        setMailResult(null);
                      }}
                    >
                      <RefreshCwIcon className="mr-2 h-4 w-4" /> Send
                      Another
                    </Button>
                  </CardFooter>
                </>
              )}
            </Card>

            {/* RIGHT: Email history — inline accordion */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold tracking-tight text-muted-foreground uppercase">
                Email History ({data.email_log.length})
              </h4>
              <div className="space-y-2">
                {[...data.email_log].reverse().map((log) => {
                  const isExpanded = expandedLogId === log.log_id;
                  const emailType = String(log.email_type ?? "")
                    .trim()
                    .toLowerCase();
                  return (
                    <div key={log.log_id}>
                      <button
                        className={`w-full text-left rounded-lg border p-3 transition-all hover:border-primary/40 hover:shadow-sm ${
                          isExpanded
                            ? "rounded-b-none border-b-0 bg-primary/5 border-primary/30"
                            : "bg-card"
                        }`}
                        onClick={() =>
                          setExpandedLogId(isExpanded ? null : log.log_id)
                        }
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {emailType === "reminder" ? (
                              <AlertCircleIcon className="h-4 w-4 shrink-0 text-amber-500" />
                            ) : emailType === "invoice" ? (
                              <FileCheckIcon className="h-4 w-4 shrink-0 text-sky-500" />
                            ) : (
                              <MailIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {log.subject}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                To: {log.to_email}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {formatDateTime(log.sent_at)}
                            </span>
                            {isExpanded ? (
                              <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                        <div className="mt-1.5">
                          <Badge
                            variant={emailType === "reminder" ? "secondary" : "outline"}
                            className="text-[10px] font-bold uppercase"
                          >
                            {emailType || "invoice"}
                          </Badge>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="rounded-b-lg border border-t-0 border-primary/30 bg-primary/5 px-4 pt-3 pb-4">
                          <div className="space-y-1 text-xs text-muted-foreground mb-3 pb-3 border-b border-primary/10">
                            <div>
                              <span className="font-medium text-foreground">
                                To:
                              </span>{" "}
                              {log.to_email}
                            </div>
                            <div>
                              <span className="font-medium text-foreground">
                                Sent:
                              </span>{" "}
                              {formatDateTime(log.sent_at)}
                            </div>
                          </div>
                          <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground leading-relaxed">
                            {log.body_preview || "(No body recorded)"}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
                {data.email_log.length === 0 && (
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      No emails sent yet.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 px-6 pb-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.8fr)]">
          <SectionCard
            title="Compose Email"
            description="Email output is driven by the currently selected invoice and stored templates."
            action={
              <SegmentedControl
                value={messageMode ?? ""}
                onChange={(value) => loadMessageDefaults(value as MessageMode)}
                options={[
                  { value: "invoice", label: "Invoice" },
                  { value: "reminder", label: "Reminder" },
                  { value: "general", label: "General" },
                ]}
              />
            }
          >
            {selectedInvoice ? (
              <div className="space-y-4">
                {commStep === "sent" && mailResult && mailResult.ok && !mailResult.dry_run ? (
                  <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
                    <p className="font-semibold">Email sent.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setCommStep("pick-type");
                          setMessageMode(null);
                          setMailResult(null);
                        }}
                      >
                        Send another
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setCommStep("compose")}
                      >
                        Back to compose
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-[20px] border border-[#dbe4ef] bg-[#f7faff] px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 shadow-sm">
                      Invoice{" "}
                      {selectedInvoice.invoice_number || `#${selectedInvoice.invoice_id}`}
                    </span>
                    <StatusBadge status={selectedInvoice.status} />
                    {isInvoiceOverdue(selectedInvoice) &&
                    !isInvoiceClosed(selectedInvoice) ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                        OVERDUE
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    {formatMoney(selectedInvoice.amount, selectedInvoice.currency)} -
                    due {formatDate(selectedInvoice.due_date)} - recipient{" "}
                    {displayText(selectedInvoice.client_email)}
                  </p>
                </div>

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

                {emailSuggestions.length ? (
                  <div className="flex flex-wrap gap-2">
                    {emailSuggestions.map((email) => (
                      <Button
                        key={email}
                        type="button"
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
                ) : null}

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
                <Field label="Message Body">
                  <Textarea
                    className="min-h-64 font-mono text-sm"
                    value={messageDraft.body}
                    onChange={(event) =>
                      setMessageDraft((current) => ({
                        ...current,
                        body: event.target.value,
                      }))
                    }
                  />
                </Field>

                {messageMode == null ? (
                  <div className="rounded-[18px] border border-[#dbe4ef] bg-[#f8fbff] px-4 py-3 text-sm text-slate-700">
                    Choose <span className="font-semibold">Invoice</span> or{" "}
                    <span className="font-semibold">Reminder</span> or{" "}
                    <span className="font-semibold">General</span> to load the
                    default subject and message text.
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleMessageSend(true)}
                    disabled={busyAction === "dry-run-email" || messageMode == null}
                  >
                    <SparklesIcon className="size-4" />
                    Dry Run
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleMessageSend(false)}
                    disabled={busyAction === "send-email" || messageMode == null}
                  >
                    <MailIcon className="size-4" />
                    {messageMode == null
                      ? "Send Email"
                      : messageMode === "invoice"
                        ? "Send Invoice"
                        : messageMode === "reminder"
                          ? "Send Reminder"
                          : "Send General"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (messageMode) {
                        loadMessageDefaults(messageMode);
                      }
                    }}
                    disabled={messageMode == null}
                  >
                    Reset to Defaults
                  </Button>
                </div>

                {mailResult ? (
                  <div
                    className={cn(
                      "rounded-[18px] border px-4 py-4 text-sm",
                      mailResult.ok
                        ? mailResult.dry_run
                          ? "border-sky-200 bg-sky-50 text-sky-900"
                          : "border-emerald-300 bg-emerald-50 text-emerald-950"
                        : "border-red-200 bg-red-50 text-red-800",
                    )}
                  >
                    <p className="text-base font-semibold">
                      {mailResult.ok
                        ? mailResult.dry_run
                          ? `${
                              messageMode === "invoice"
                                ? "Invoice"
                                : messageMode === "reminder"
                                  ? "Reminder"
                                  : "General"
                            } draft ready`
                          : `${
                              messageMode === "invoice"
                                ? "Invoice"
                                : messageMode === "reminder"
                                  ? "Reminder"
                                  : "General"
                            } email sent`
                        : "Email action failed"}
                    </p>
                    <p className="mt-1 text-sm opacity-90">
                      {mailResult.message ||
                        mailResult.error ||
                        (mailResult.ok
                          ? mailResult.dry_run
                            ? "Review the generated output before sending."
                            : `Delivered to ${displayText(mailResult.to_email)}.`
                          : "The email could not be sent.")}
                    </p>
                    <p className="mt-2 text-xs opacity-80">
                      {displayText(mailResult.to_email)} -{" "}
                      {mailResult.attachment_filename
                        ? `${mailResult.attachment_filename} (${formatStorageSize(
                            mailResult.attachment_size_bytes,
                          )})`
                        : "No attachment generated"}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState
                title="No invoice selected"
                description="Communication stays invoice-driven so the PDF, due date, and subject/body can be generated consistently."
              />
            )}
          </SectionCard>

          <div className="space-y-5">
            <SectionCard
              title={`Email History (${data.email_log.length})`}
              description="Everything sent for this case, including reminders."
            >
              <div className="space-y-3">
                {data.email_log.length ? (
                  data.email_log.map((entry: FinanceEmail) => {
                    const isReminder =
                      String(entry.email_type ?? "").trim().toLowerCase() ===
                      "reminder";
                    return (
                      <div
                        key={entry.log_id}
                        className="rounded-[20px] border border-[#dbe2ec] bg-white px-4 py-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-950">
                              {displayText(
                                entry.subject,
                                isReminder
                                  ? "Reminder email"
                                  : "Invoice email",
                              )}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              To {displayText(entry.to_email)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="whitespace-nowrap text-xs text-slate-500">
                              {formatDateTime(entry.sent_at)}
                            </span>
                            <ChevronRightIcon className="size-4 text-slate-300" />
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 font-semibold tracking-[0.12em]",
                              isReminder
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-blue-200 bg-blue-50 text-blue-700",
                            )}
                          >
                            {isReminder ? "REMINDER" : "INVOICE"}
                          </span>
                          <span className="text-slate-500">
                            {displayText(
                              entry.body_preview,
                              entry.attachment_filename
                                ? `Attachment ${entry.attachment_filename}`
                                : "Email record stored for this case.",
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState
                    title="No emails recorded"
                    description="Sent invoice emails and reminders will appear here."
                  />
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Automation Defaults"
              description="Company identity, sender setup, and reusable templates."
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowSettingsEditor((current) => !current)}
                >
                  {showSettingsEditor ? "Hide Editor" : "Edit Defaults"}
                </Button>
              }
            >
              <div className="space-y-3">
                <InsightItem
                  title={displayText(settings?.company_name, "Company not set")}
                  description={`${displayText(
                    settings?.company_email || settings?.smtp_from_email,
                  )} - ${displayText(settings?.company_phone)}`}
                  tone={automationReady ? "success" : "warning"}
                />
                <InsightItem
                  title={`Default currency ${displayText(
                    settings?.default_currency,
                    "MKD",
                  )}`}
                  description="Used when case-level finance data is still empty."
                  tone="default"
                />
                <InsightItem
                  title="Template placeholders"
                  description="{invoice_number}, {case_id}, {amount}, {currency}, {due_date}, {client_name}"
                  tone="default"
                />
              </div>

              {showSettingsEditor ? (
                <div className="mt-5 border-t border-[#ecf0f5] pt-5">
                  <form className="space-y-5" onSubmit={handleSettingsSave}>
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-slate-900">
                        Company
                      </p>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Company Name">
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
                        <Field label="Company Email">
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
                        <Field label="Company Address">
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
                        <Field label="Company City">
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
                        <Field label="Tax Number">
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
                        <Field label="Company Phone">
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
                        <Field label="Bank Name">
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
                        <Field label="Bank Account">
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
                        <Field label="Default Currency">
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
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-slate-900">SMTP</p>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="SMTP Host">
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
                        <Field label="SMTP Port">
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
                        <Field label="SMTP Username">
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
                        <Field label="SMTP Password">
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
                        <Field label="From Email">
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
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-slate-900">
                        Templates
                      </p>
                      <Field label="Invoice Email Subject Template">
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
                      <Field label="Invoice Email Body Template">
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
                      <Field label="Reminder Email Subject Template">
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
                      <Field label="Reminder Email Body Template">
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
                    </div>

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        disabled={busyAction === "save-settings"}
                      >
                        <SaveIcon className="size-4" />
                        Save Defaults
                      </Button>
                    </div>
                  </form>
                </div>
              ) : null}
            </SectionCard>
          </div>
        </div>
      ) ) : null}
      {activeTab === "profile" ? (
        VERBATIM_REPLIT_UI_PORT ? (
          <div className="flex flex-col gap-5 px-6 pb-5">
            {/* Verbatim Replit UI port: Contract Profile */}
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                {/* LEFT: Contract Details (first / most important) */}
                <Card>
                  <CardHeader className="border-b">
                    <CardTitle className="text-base">Contract Details</CardTitle>
                    <CardDescription>
                      Financial and operational parameters for this case.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Contract Sum</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          value={profileDraft.contract_sum}
                          onChange={(e) =>
                            setProfileDraft((current) => ({
                              ...current,
                              contract_sum: e.target.value,
                            }))
                          }
                          className="flex-1"
                        />
                        <Select
                          value={profileDraft.currency || "MKD"}
                          onValueChange={(value) =>
                            setProfileDraft((current) => ({
                              ...current,
                              currency: value,
                            }))
                          }
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {currencyOptions.map((currency) => (
                              <SelectItem
                                key={currency}
                                value={currency}
                              >
                                {currency}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Case / Service Type</Label>
                      <Input
                        value={profileDraft.service_type}
                        onChange={(e) =>
                          setProfileDraft((current) => ({
                            ...current,
                            service_type: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={profileDraft.notes}
                        onChange={(e) =>
                          setProfileDraft((current) => ({
                            ...current,
                            notes: e.target.value,
                          }))
                        }
                        className="resize-none"
                        rows={4}
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="justify-end gap-2 border-t py-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (!data) return;
                        setProfileDraft(buildProfileDraft(data));
                        setContactDraft(buildContactDraft(data));
                      }}
                    >
                      Reset
                    </Button>
                    <Button
                      onClick={() => {
                        void saveProfile();
                        toast({
                          title: "Saved",
                          description: "Contract details updated.",
                        });
                      }}
                    >
                      Save Changes
                    </Button>
                  </CardFooter>
                </Card>

                {/* RIGHT: Client Information */}
                <Card>
                  <CardHeader className="border-b">
                    <CardTitle className="text-base">Client Information</CardTitle>
                    <CardDescription>
                      Details used for invoice generation and communication.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Name / Last name</Label>
                      <Input
                        value={profileDraft.client_name}
                        onChange={(e) =>
                          setProfileDraft((current) => ({
                            ...current,
                            client_name: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Company</Label>
                      <Input
                        value={companyValue}
                        onChange={(e) =>
                          setContactDraft((current) => ({
                            ...current,
                            customFields: {
                              ...current.customFields,
                              company: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Phone</Label>
                      <Input
                        value={profileDraft.client_phone}
                        onChange={(e) =>
                          setProfileDraft((current) => ({
                            ...current,
                            client_phone: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Primary Email</Label>
                      <Input
                        type="email"
                        value={primaryEmail}
                        onChange={(e) =>
                          setContactDraft((current) => ({
                            ...current,
                            customFields: {
                              ...current.customFields,
                              email: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Alternative Emails</Label>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {splitMultiValueText(alternateEmailsValue).map(
                          (em) => (
                            <Badge
                              key={em}
                              variant="outline"
                              className="font-normal text-sm px-3 py-1 gap-2"
                            >
                              {em}
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  const next = splitMultiValueText(
                                    alternateEmailsValue,
                                  ).filter((x) => x !== em);
                                  setContactDraft((current) => ({
                                    ...current,
                                    customFields: {
                                      ...current.customFields,
                                      alternate_emails: next.join(", "),
                                    },
                                  }));
                                }}
                              >
                                <XIcon className="h-3 w-3" />
                              </button>
                            </Badge>
                          ),
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            const next = window.prompt(
                              "Add email (comma separated allowed):",
                            );
                            if (!next) return;
                            const current = splitMultiValueText(
                              alternateEmailsValue,
                            );
                            const merged = mergeUniqueValues([
                              ...current,
                              ...splitMultiValueText(next),
                            ]);
                            setContactDraft((currentDraft) => ({
                              ...currentDraft,
                              customFields: {
                                ...currentDraft.customFields,
                                alternate_emails: merged.join(", "),
                              },
                            }));
                          }}
                        >
                          <PlusIcon className="mr-1 h-3 w-3" /> Add Email
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Address</Label>
                      <Input
                        value={addressValue}
                        onChange={(e) =>
                          setContactDraft((current) => ({
                            ...current,
                            customFields: {
                              ...current.customFields,
                              address: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="justify-end gap-2 border-t py-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (!data) return;
                        setProfileDraft(buildProfileDraft(data));
                        setContactDraft(buildContactDraft(data));
                      }}
                    >
                      Reset
                    </Button>
                    <Button
                      onClick={() => {
                        void saveProfile();
                        toast({
                          title: "Saved",
                          description: "Client information updated.",
                        });
                      }}
                    >
                      Save Changes
                    </Button>
                  </CardFooter>
                </Card>
              </div>

              {/* Case Summary — full width below */}
              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2Icon className="h-4 w-4 text-muted-foreground" />{" "}
                    Case Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-5">
                  <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm sm:grid-cols-4">
                    {[
                      { label: "Case ID", value: data.case_id },
                      {
                        label: "Request Type",
                        value: data.request_type,
                      },
                      { label: "Status", value: data.status },
                      { label: "Currency", value: data.currency },
                      {
                        label: "Invoices",
                        value: `${data.invoices.length} issued`,
                      },
                      {
                        label: "Payments",
                        value: `${data.payments.length} logged`,
                      },
                      {
                        label: "Emails Sent",
                        value: `${data.email_log.length} total`,
                      },
                      {
                        label: "Outstanding",
                        value: formatMoney(
                          data.remaining,
                          data.currency,
                        ),
                      },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-muted-foreground mb-0.5 text-xs">
                          {label}
                        </p>
                        <p className="font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5 px-6 pb-5">
          {profileSaveStatus !== "idle" ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              {profileSaveStatus === "saving" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <CheckIcon className="size-4 text-emerald-600" />
                  <span className="text-emerald-700">Saved</span>
                </>
              )}
            </div>
          ) : null}
          <div className="mx-auto w-full max-w-2xl">
            <SectionCard
              title="Contract Details"
              description="Shared case and finance data for this contract. Changes here drive the overviews, communication defaults, and invoice drafts."
            >
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Client Name">
                  <Input
                    value={profileDraft.client_name}
                    onChange={(event) =>
                      setProfileDraft((current) => ({
                        ...current,
                        client_name: event.target.value,
                      }))
                    }
                    onBlur={() => void saveProfile()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveProfile();
                      }
                    }}
                  />
                </Field>
                <Field label="Company">
                  <Input
                    value={companyValue}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        customFields: {
                          ...current.customFields,
                          company: event.target.value,
                        },
                      }))
                    }
                    onBlur={() => void saveProfile()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveProfile();
                      }
                    }}
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    value={profileDraft.client_phone}
                    onChange={(event) =>
                      setProfileDraft((current) => ({
                        ...current,
                        client_phone: event.target.value,
                      }))
                    }
                    onBlur={() => void saveProfile()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveProfile();
                      }
                    }}
                  />
                </Field>
                <Field label="Primary Email">
                  <Input
                    type="email"
                    value={primaryEmail}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        customFields: {
                          ...current.customFields,
                          email: event.target.value,
                        },
                      }))
                    }
                    onBlur={() => void saveProfile()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveProfile();
                      }
                    }}
                  />
                </Field>
                <Field label="Address">
                  <Input
                    value={addressValue}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        customFields: {
                          ...current.customFields,
                          address: event.target.value,
                        },
                      }))
                    }
                    onBlur={() => void saveProfile()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveProfile();
                      }
                    }}
                  />
                </Field>
                <Field
                  label="Alternative Emails"
                  hint="Separate multiple emails with commas or new lines."
                >
                  <Input
                    value={alternateEmailsValue}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        customFields: {
                          ...current.customFields,
                          alternate_emails: event.target.value,
                        },
                      }))
                    }
                    onBlur={() => void saveProfile()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveProfile();
                      }
                    }}
                  />
                </Field>
              </div>

              {splitMultiValueText(alternateEmailsValue).length ? (
                <div className="flex flex-wrap gap-2">
                  {splitMultiValueText(alternateEmailsValue).map((email) => (
                    <span
                      key={email}
                      className="rounded-full border border-[#dbe4ef] bg-[#f8fbff] px-3 py-1 text-xs text-slate-700"
                    >
                      {email}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-[1fr_110px_1.1fr]">
                <Field label="Contract Sum">
                  <Input
                    inputMode="decimal"
                    value={profileDraft.contract_sum}
                    onChange={(event) =>
                      setProfileDraft((current) => ({
                        ...current,
                        contract_sum: event.target.value,
                      }))
                    }
                    onBlur={() => void saveProfile()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveProfile();
                      }
                    }}
                  />
                </Field>
                <Field label="Currency">
                  <Select
                    value={profileDraft.currency || "MKD"}
                    onValueChange={(value) => {
                      setProfileDraft((current) => ({
                        ...current,
                        currency: value,
                      }));
                      window.setTimeout(() => void saveProfile(), 0);
                    }}
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
              </div>

              <Field label="Case / Service Type">
                <Input
                  value={profileDraft.service_type}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      service_type: event.target.value,
                    }))
                  }
                  onBlur={() => void saveProfile()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveProfile();
                    }
                  }}
                />
              </Field>

              <Field label="Notes">
                <Textarea
                  className="min-h-28"
                  value={profileDraft.notes}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  onBlur={() => void saveProfile()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveProfile();
                    }
                  }}
                />
              </Field>

              {additionalMemoryFields.length ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {additionalMemoryFields.map(([key, value]) => {
                    const definition = caseFieldDefinitionMap.get(key);
                    const options = definition?.options?.filter(Boolean) ?? [];
                    const isDropdown =
                      String(definition?.type ?? "").trim().toLowerCase() ===
                        "dropdown" && options.length > 0;

                    return (
                      <Field key={key} label={key}>
                        {isDropdown ? (
                          <Select
                            value={value ?? ""}
                            onValueChange={(nextValue) => {
                              setContactDraft((current) => ({
                                ...current,
                                customFields: {
                                  ...current.customFields,
                                  [key]: nextValue,
                                },
                              }));
                              window.setTimeout(() => void saveProfile(), 0);
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={key} />
                            </SelectTrigger>
                            <SelectContent>
                              {options.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={value ?? ""}
                            onChange={(event) =>
                              setContactDraft((current) => ({
                                ...current,
                                customFields: {
                                  ...current.customFields,
                                  [key]: event.target.value,
                                },
                              }))
                            }
                            onBlur={() => void saveProfile()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void saveProfile();
                              }
                            }}
                          />
                        )}
                      </Field>
                    );
                  })}
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (!data) return;
                    setProfileDraft(buildProfileDraft(data));
                    setContactDraft(buildContactDraft(data));
                  }}
                >
                  Reset
                </Button>
                <Button
                  type="button"
                  onClick={goToDraftNewInvoiceAndFocusNumber}
                >
                  <FileTextIcon className="size-4" />
                  Create invoice / payment
                </Button>
              </div>
            </div>
          </SectionCard>
          </div>
        </div>
      ) ) : null}
    </PageContainer>
  );
}
