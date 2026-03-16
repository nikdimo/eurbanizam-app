"use client";

import * as React from "react";
import {
  BotIcon,
  CheckCircle2Icon,
  Clock3Icon,
  DatabaseIcon,
  FileCheck2Icon,
  HardDriveIcon,
  MailIcon,
  PlayIcon,
  RefreshCcwIcon,
  SaveIcon,
  ShieldCheckIcon,
  SquareIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";

import {
  PageContainer,
  PageHeader,
} from "@/components/layout/PagePrimitives";
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
import { ErrorState, LoadingState } from "@/components/ui/states";
import { StatCard } from "@/components/ui/stat-card";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import { PinGate } from "@/components/ui/pin-gate";
import { useFinancePinGate } from "@/lib/hooks/use-finance-pin-gate";
import {
  FinanceSettings,
  FinanceSettingsSchema,
  JobActionResultSchema,
  ProjectManagementState,
  ProjectManagementStateSchema,
} from "@/lib/schemas";
import { cn } from "@/lib/utils";

type NoticeTone = "success" | "error" | "info";

type Notice = {
  tone: NoticeTone;
  message: string;
} | null;

type ProjectDraft = {
  finance_pin: string;
  deployment_label: string;
  api_service_name: string;
  web_service_name: string;
  bot_service_name: string;
  portal_username: string;
  portal_password: string;
  report_sender_email: string;
  report_sender_password: string;
  report_recipient_emails: string;
  smtp_server: string;
  smtp_port: string;
  telegram_chat_id: string;
  telegram_bot_token: string;
  google_api_key: string;
  automation_timezone: string;
  smart_sync_schedule_enabled: string;
  smart_sync_time: string;
  full_scrape_schedule_enabled: string;
  full_scrape_time: string;
  full_scrape_day_of_week: string;
  daily_report_schedule_enabled: string;
  daily_report_time: string;
  daily_report_hours: string;
  healthcheck_schedule_enabled: string;
  healthcheck_interval_minutes: string;
  healthcheck_stale_hours: string;
  healthcheck_remind_hours: string;
  smart_sync_test_pages: string;
  full_scrape_test_pages: string;
  headless_mode: string;
};

type FinanceDraft = {
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

const DEFAULT_PROJECT_DRAFT: ProjectDraft = {
  finance_pin: "",
  deployment_label: "",
  api_service_name: "eurbanizam-api.service",
  web_service_name: "eurbanizam-web.service",
  bot_service_name: "",
  portal_username: "",
  portal_password: "",
  report_sender_email: "",
  report_sender_password: "",
  report_recipient_emails: "",
  smtp_server: "smtp.gmail.com",
  smtp_port: "587",
  telegram_chat_id: "",
  telegram_bot_token: "",
  google_api_key: "",
  automation_timezone: "Europe/Copenhagen",
  smart_sync_schedule_enabled: "false",
  smart_sync_time: "04:00",
  full_scrape_schedule_enabled: "false",
  full_scrape_time: "03:00",
  full_scrape_day_of_week: "0",
  daily_report_schedule_enabled: "false",
  daily_report_time: "04:15",
  daily_report_hours: "24",
  healthcheck_schedule_enabled: "false",
  healthcheck_interval_minutes: "15",
  healthcheck_stale_hours: "36",
  healthcheck_remind_hours: "12",
  smart_sync_test_pages: "2",
  full_scrape_test_pages: "2",
  headless_mode: "auto",
};

const DEFAULT_FINANCE_DRAFT: FinanceDraft = {
  company_name: "",
  company_address: "",
  company_city: "",
  company_tax_number: "",
  company_bank_name: "",
  company_bank_account: "",
  company_iban: "",
  company_email: "",
  company_phone: "",
  smtp_host: "",
  smtp_port: "",
  smtp_username: "",
  smtp_password: "",
  smtp_use_tls: "true",
  smtp_from_email: "",
  smtp_bcc: "",
  default_currency: "",
  invoice_email_subject_template: "",
  invoice_email_body_template: "",
  reminder_email_subject_template: "",
  reminder_email_body_template: "",
};

const WEEKDAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const ONE_SHOT_JOBS = new Set([
  "smart_sync",
  "full_scrape",
  "report",
  "healthcheck",
  "project_checks",
]);

const TEMPLATE_PLACEHOLDERS = [
  "{invoice_number}",
  "{case_id}",
  "{amount}",
  "{currency}",
  "{issue_date}",
  "{due_date}",
  "{client_name}",
  "{client_email}",
  "{service_description}",
  "{company_name}",
  "{company_email}",
  "{company_phone}",
];

const RECOMMENDED_INVOICE_SUBJECT_TEMPLATE =
  "Invoice {invoice_number} for case {case_id}";

const RECOMMENDED_INVOICE_BODY_TEMPLATE = `Hello {client_name},

Please find attached invoice {invoice_number} for case {case_id}.

Service: {service_description}
Amount due: {amount} {currency}
Issue date: {issue_date}
Due date: {due_date}

If you have any questions, reply to this email and we will help you.

Best regards,
{company_name}
{company_email}
{company_phone}`;

const RECOMMENDED_REMINDER_SUBJECT_TEMPLATE =
  "Reminder: invoice {invoice_number} for case {case_id}";

const RECOMMENDED_REMINDER_BODY_TEMPLATE = `Hello {client_name},

This is a reminder that invoice {invoice_number} for case {case_id} is still awaiting payment.

Outstanding amount: {amount} {currency}
Due date: {due_date}

If the payment has already been sent, please ignore this reminder. Otherwise, let us know if you need any clarification before payment.

Best regards,
{company_name}
{company_email}
{company_phone}`;

function buildProjectDraft(state?: ProjectManagementState | null): ProjectDraft {
  if (!state) {
    return DEFAULT_PROJECT_DRAFT;
  }
  const config = state.config;
  const operations = state.operations;
  return {
    finance_pin: String(config.finance_pin ?? ""),
    deployment_label: String(config.deployment_label ?? ""),
    api_service_name: String(
      config.api_service_name ?? "eurbanizam-api.service",
    ),
    web_service_name: String(
      config.web_service_name ?? "eurbanizam-web.service",
    ),
    bot_service_name: String(config.bot_service_name ?? ""),
    portal_username: String(operations.portal_username ?? ""),
    portal_password: String(operations.portal_password ?? ""),
    report_sender_email: String(operations.report_sender_email ?? ""),
    report_sender_password: String(operations.report_sender_password ?? ""),
    report_recipient_emails: String(operations.report_recipient_emails ?? ""),
    smtp_server: String(operations.smtp_server ?? "smtp.gmail.com"),
    smtp_port:
      operations.smtp_port == null ? "587" : String(operations.smtp_port),
    telegram_chat_id: String(operations.telegram_chat_id ?? ""),
    telegram_bot_token: String(operations.telegram_bot_token ?? ""),
    google_api_key: String(operations.google_api_key ?? ""),
    automation_timezone: String(config.automation_timezone ?? "Europe/Copenhagen"),
    smart_sync_schedule_enabled: config.smart_sync_schedule_enabled
      ? "true"
      : "false",
    smart_sync_time: String(config.smart_sync_time ?? "04:00"),
    full_scrape_schedule_enabled: config.full_scrape_schedule_enabled
      ? "true"
      : "false",
    full_scrape_time: String(config.full_scrape_time ?? "03:00"),
    full_scrape_day_of_week: String(config.full_scrape_day_of_week ?? 0),
    daily_report_schedule_enabled: config.daily_report_schedule_enabled
      ? "true"
      : "false",
    daily_report_time: String(config.daily_report_time ?? "04:15"),
    daily_report_hours: String(config.daily_report_hours ?? 24),
    healthcheck_schedule_enabled: config.healthcheck_schedule_enabled
      ? "true"
      : "false",
    healthcheck_interval_minutes: String(
      config.healthcheck_interval_minutes ?? 15,
    ),
    healthcheck_stale_hours: String(config.healthcheck_stale_hours ?? 36),
    healthcheck_remind_hours: String(config.healthcheck_remind_hours ?? 12),
    smart_sync_test_pages: String(config.smart_sync_test_pages ?? 2),
    full_scrape_test_pages: String(config.full_scrape_test_pages ?? 2),
    headless_mode:
      config.headless_mode == null ? "auto" : config.headless_mode ? "true" : "false",
  };
}

function buildFinanceDraft(settings?: FinanceSettings | null): FinanceDraft {
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
    invoice_email_subject_template:
      String(settings?.invoice_email_subject_template ?? "").trim() ||
      RECOMMENDED_INVOICE_SUBJECT_TEMPLATE,
    invoice_email_body_template:
      String(settings?.invoice_email_body_template ?? "").trim() ||
      RECOMMENDED_INVOICE_BODY_TEMPLATE,
    reminder_email_subject_template:
      String(settings?.reminder_email_subject_template ?? "").trim() ||
      RECOMMENDED_REMINDER_SUBJECT_TEMPLATE,
    reminder_email_body_template:
      String(settings?.reminder_email_body_template ?? "").trim() ||
      RECOMMENDED_REMINDER_BODY_TEMPLATE,
  };
}

function isManualHost(state: ProjectManagementState): boolean {
  return !state.runtime.systemctl_available && !state.scheduler.available;
}

function getHealthPresentation(state: ProjectManagementState): {
  label: string;
  hint: string;
  tone: NoticeTone;
} {
  if (isManualHost(state)) {
    return {
      label: "Manual host",
      hint: state.health.updated_at
        ? `Local workspace. Last imported or server-side check ${formatDate(state.health.updated_at)}. Live service health is tracked on the VPS.`
        : "Local workspace. Runtime files and credentials are checked here, but live service health is tracked on the VPS.",
      tone: "info",
    };
  }

  const normalized = String(state.health.status ?? "").trim().toLowerCase();
  if (!normalized) {
    return {
      label: "Awaiting check",
      hint: "No healthcheck result has been recorded on this host yet.",
      tone: "info",
    };
  }
  if (normalized === "healthy") {
    return {
      label: "Healthy",
      hint: `Last check ${formatDate(state.health.updated_at)}.`,
      tone: "success",
    };
  }
  if (normalized === "unhealthy") {
    return {
      label: "Needs attention",
      hint: `Last check ${formatDate(state.health.updated_at)}.`,
      tone: "error",
    };
  }
  return {
    label: state.health.status ?? "Unknown",
    hint: `Last check ${formatDate(state.health.updated_at)}.`,
    tone: statusTone(state.health.status),
  };
}

function getProcessPresentation(
  state: ProjectManagementState,
  process: ProjectManagementState["processes"][number],
): {
  label: string;
  tone: NoticeTone;
  detail: string;
} {
  if (process.running) {
    return {
      label: "Running",
      tone: "success",
      detail: process.started_at
        ? `Started ${formatDate(process.started_at)}`
        : "Background job is active on this host.",
    };
  }
  if (ONE_SHOT_JOBS.has(process.job)) {
    return {
      label: "Idle",
      tone: "info",
      detail: "On-demand job. It starts when triggered and exits after the run completes.",
    };
  }
  if (isManualHost(state)) {
    return {
      label: "Manual",
      tone: "info",
      detail:
        "This host does not auto-manage long-running services. Start it here only when you want the local machine to own that workload.",
    };
  }
  return {
    label: "Stopped",
    tone: "info",
    detail: "Long-running job is not active on this host right now.",
  };
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatCount(value?: number | null): string {
  return new Intl.NumberFormat().format(value ?? 0);
}

function statusTone(value: string | null | undefined): NoticeTone {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["ok", "healthy", "ready", "running", "applied", "enabled", "finished"].includes(normalized)) {
    return "success";
  }
  if (
    [
      "warning",
      "stale",
      "missing",
      "manual",
      "idle",
      "never",
      "disabled",
      "stopped",
      "awaiting check",
      "unknown",
    ].includes(normalized)
  ) {
    return "info";
  }
  return "error";
}

function NoticeMessage({ notice }: { notice: Notice }) {
  if (!notice) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 text-sm",
        notice.tone === "success" &&
          "border-emerald-200 bg-emerald-50 text-emerald-900",
        notice.tone === "error" &&
          "border-red-200 bg-red-50 text-red-900",
        notice.tone === "info" &&
          "border-sky-200 bg-sky-50 text-sky-900",
      )}
    >
      {notice.message}
    </div>
  );
}

function SettingField({
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
      <div className="space-y-1">
        <Label>{label}</Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: NoticeTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
        tone === "success" && "bg-emerald-100 text-emerald-700",
        tone === "error" && "bg-red-100 text-red-700",
        tone === "info" && "bg-sky-100 text-sky-700",
      )}
    >
      {label}
    </span>
  );
}

function StatusRow({
  label,
  ok,
  detail,
  okLabel = "Ready",
  fallbackLabel = "Missing",
  okTone = "success",
  fallbackTone = "error",
}: {
  label: string;
  ok: boolean;
  detail?: string;
  okLabel?: string;
  fallbackLabel?: string;
  okTone?: NoticeTone;
  fallbackTone?: NoticeTone;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/70 px-3 py-2">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <StatusPill
        label={ok ? okLabel : fallbackLabel}
        tone={ok ? okTone : fallbackTone}
      />
    </div>
  );
}

function OperationButton({
  title,
  description,
  icon,
  onClick,
  disabled,
  variant = "outline",
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "outline" | "destructive";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex h-full min-h-[108px] flex-col items-start justify-between rounded-2xl border px-4 py-3 text-left transition-colors",
        variant === "outline" &&
          "border-border/60 bg-background/70 hover:border-foreground/20 hover:bg-muted/60",
        variant === "default" &&
          "border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10",
        variant === "destructive" &&
          "border-red-200 bg-red-50 hover:border-red-300 hover:bg-red-100",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="rounded-lg bg-background/80 p-2 shadow-sm ring-1 ring-foreground/10">
          {icon}
        </span>
        {title}
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{description}</p>
    </button>
  );
}

export default function SettingsPage() {
  const [managementState, setManagementState] =
    React.useState<ProjectManagementState | null>(null);
  const [, setFinanceSettings] = React.useState<FinanceSettings | null>(null);
  const [projectDraft, setProjectDraft] =
    React.useState<ProjectDraft>(DEFAULT_PROJECT_DRAFT);
  const [financeDraft, setFinanceDraft] =
    React.useState<FinanceDraft>(DEFAULT_FINANCE_DRAFT);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [projectSaving, setProjectSaving] = React.useState(false);
  const [financeSaving, setFinanceSaving] = React.useState(false);
  const [opsBusyKey, setOpsBusyKey] = React.useState<string | null>(null);
  const [projectNotice, setProjectNotice] = React.useState<Notice>(null);
  const [financeNotice, setFinanceNotice] = React.useState<Notice>(null);
  const [opsNotice, setOpsNotice] = React.useState<Notice>(null);
  const [, startTransition] = React.useTransition();
  const pinGate = useFinancePinGate();

  const loadData = React.useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);

    const [managementResponse, financeResponse] = await Promise.all([
      apiClient.getParsed("/api/settings/management", ProjectManagementStateSchema),
      apiClient.getParsed("/api/finance/settings", FinanceSettingsSchema),
    ]);

    if (managementResponse.error || financeResponse.error) {
      setError(managementResponse.error ?? financeResponse.error ?? "Unable to load settings.");
      if (!options?.silent) {
        setLoading(false);
      }
      return;
    }

    startTransition(() => {
      setManagementState(managementResponse.data);
      setFinanceSettings(financeResponse.data);
      setProjectDraft(buildProjectDraft(managementResponse.data));
      setFinanceDraft(buildFinanceDraft(financeResponse.data));
    });

    if (!options?.silent) {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (pinGate.pinRequired === null) {
      return;
    }

    if (pinGate.pinRequired && !pinGate.unlocked) {
      return;
    }

    void loadData();
  }, [loadData, pinGate.pinRequired, pinGate.unlocked]);

  const handleSaveProject = async () => {
    setProjectSaving(true);
    setProjectNotice(null);

    const response = await apiClient.patch<unknown>("/api/settings/management", {
      finance_pin: projectDraft.finance_pin.trim() || null,
      deployment_label: projectDraft.deployment_label.trim() || null,
      api_service_name: projectDraft.api_service_name.trim() || null,
      web_service_name: projectDraft.web_service_name.trim() || null,
      bot_service_name: projectDraft.bot_service_name.trim() || null,
      portal_username: projectDraft.portal_username.trim() || null,
      portal_password: projectDraft.portal_password.trim() || null,
      report_sender_email: projectDraft.report_sender_email.trim() || null,
      report_sender_password:
        projectDraft.report_sender_password.trim() || null,
      report_recipient_emails:
        projectDraft.report_recipient_emails.trim() || null,
      smtp_server: projectDraft.smtp_server.trim() || null,
      smtp_port: projectDraft.smtp_port ? Number(projectDraft.smtp_port) : null,
      telegram_chat_id: projectDraft.telegram_chat_id.trim() || null,
      telegram_bot_token: projectDraft.telegram_bot_token.trim() || null,
      google_api_key: projectDraft.google_api_key.trim() || null,
      automation_timezone:
        projectDraft.automation_timezone.trim() || "Europe/Copenhagen",
      smart_sync_schedule_enabled:
        projectDraft.smart_sync_schedule_enabled === "true",
      smart_sync_time: projectDraft.smart_sync_time || "04:00",
      full_scrape_schedule_enabled:
        projectDraft.full_scrape_schedule_enabled === "true",
      full_scrape_time: projectDraft.full_scrape_time || "03:00",
      full_scrape_day_of_week: Number(projectDraft.full_scrape_day_of_week || "0"),
      daily_report_schedule_enabled:
        projectDraft.daily_report_schedule_enabled === "true",
      daily_report_time: projectDraft.daily_report_time || "04:15",
      daily_report_hours: Number(projectDraft.daily_report_hours || "24"),
      healthcheck_schedule_enabled:
        projectDraft.healthcheck_schedule_enabled === "true",
      healthcheck_interval_minutes: Number(
        projectDraft.healthcheck_interval_minutes || "15",
      ),
      healthcheck_stale_hours: Number(
        projectDraft.healthcheck_stale_hours || "36",
      ),
      healthcheck_remind_hours: Number(
        projectDraft.healthcheck_remind_hours || "12",
      ),
      smart_sync_test_pages: Number(projectDraft.smart_sync_test_pages || "2"),
      full_scrape_test_pages: Number(projectDraft.full_scrape_test_pages || "2"),
      headless_mode:
        projectDraft.headless_mode === "auto"
          ? null
          : projectDraft.headless_mode === "true",
    });

    if (response.error || response.data == null) {
      setProjectNotice({
        tone: "error",
        message: response.error ?? "Unable to save project settings.",
      });
      setProjectSaving(false);
      return;
    }

    const parsed = ProjectManagementStateSchema.safeParse(response.data);
    if (!parsed.success) {
      setProjectNotice({
        tone: "error",
        message: "Unexpected response after saving project settings.",
      });
      setProjectSaving(false);
      return;
    }

    setManagementState(parsed.data);
    setProjectDraft(buildProjectDraft(parsed.data));
    setProjectNotice({
      tone: "success",
      message: "Project behavior, automation access, and scheduler settings saved.",
    });
    setProjectSaving(false);
  };

  const handleSaveFinance = async () => {
    setFinanceSaving(true);
    setFinanceNotice(null);

    const response = await apiClient.patch<unknown>("/api/finance/settings", {
      company_name: financeDraft.company_name || "",
      company_address: financeDraft.company_address || "",
      company_city: financeDraft.company_city || "",
      company_tax_number: financeDraft.company_tax_number || "",
      company_bank_name: financeDraft.company_bank_name || "",
      company_bank_account: financeDraft.company_bank_account || "",
      company_iban: financeDraft.company_iban || "",
      company_email: financeDraft.company_email || "",
      company_phone: financeDraft.company_phone || "",
      smtp_host: financeDraft.smtp_host || "",
      smtp_port: financeDraft.smtp_port ? Number(financeDraft.smtp_port) : null,
      smtp_username: financeDraft.smtp_username || "",
      smtp_password: financeDraft.smtp_password || "",
      smtp_use_tls: financeDraft.smtp_use_tls !== "false",
      smtp_from_email: financeDraft.smtp_from_email || "",
      smtp_bcc: financeDraft.smtp_bcc || "",
      default_currency: financeDraft.default_currency || "",
      invoice_email_subject_template:
        financeDraft.invoice_email_subject_template || "",
      invoice_email_body_template: financeDraft.invoice_email_body_template || "",
      reminder_email_subject_template:
        financeDraft.reminder_email_subject_template || "",
      reminder_email_body_template:
        financeDraft.reminder_email_body_template || "",
    });

    if (response.error || response.data == null) {
      setFinanceNotice({
        tone: "error",
        message: response.error ?? "Unable to save finance settings.",
      });
      setFinanceSaving(false);
      return;
    }

    const parsed = FinanceSettingsSchema.safeParse(response.data);
    if (!parsed.success) {
      setFinanceNotice({
        tone: "error",
        message: "Unexpected response after saving finance settings.",
      });
      setFinanceSaving(false);
      return;
    }

    setFinanceSettings(parsed.data);
    setFinanceDraft(buildFinanceDraft(parsed.data));
    setFinanceNotice({
      tone: "success",
      message: "Finance defaults, SMTP, and templates saved.",
    });
    setFinanceSaving(false);
  };

  const runOperation = async (
    job: string,
    payload: { action?: string; mode?: string; max_pages?: number; hours?: number },
  ) => {
    setOpsNotice(null);
    const busyKey = `${job}:${payload.action ?? "run"}:${payload.mode ?? "live"}`;
    setOpsBusyKey(busyKey);

    const response = await apiClient.post<unknown>(
      `/api/settings/management/jobs/${job}`,
      {
        action: payload.action ?? "run",
        mode: payload.mode ?? "live",
        max_pages: payload.max_pages ?? null,
        hours: payload.hours ?? null,
      },
    );

    if (response.error || response.data == null) {
      setOpsNotice({
        tone: "error",
        message: response.error ?? `Unable to run ${job}.`,
      });
      setOpsBusyKey(null);
      return;
    }

    const parsed = JobActionResultSchema.safeParse(response.data);
    if (!parsed.success) {
      setOpsNotice({
        tone: "error",
        message: "Unexpected response from operation endpoint.",
      });
      setOpsBusyKey(null);
      return;
    }

    setOpsNotice({
      tone: parsed.data.accepted ? "success" : "error",
      message: parsed.data.log_path
        ? `${parsed.data.message} Log: ${parsed.data.log_path}`
        : parsed.data.message,
    });
    setOpsBusyKey(null);
    await loadData({ silent: true });
  };

  if (pinGate.statusError) {
    return (
      <PageContainer className="overflow-auto">
        <ErrorState
          message={pinGate.statusError}
          onRetry={() => window.location.reload()}
        />
      </PageContainer>
    );
  }

  if (pinGate.pinRequired === null) {
    return (
      <PageContainer className="overflow-auto">
        <LoadingState label="Checking finance PIN requirement..." />
      </PageContainer>
    );
  }

  if (pinGate.pinRequired && !pinGate.unlocked) {
    return (
      <PageContainer className="overflow-auto">
        <PinGate
          title="Protected Settings"
          description="Enter the finance PIN to unlock this page."
          helperText="If you need to reset the PIN, edit the finance_pin value in settings.json."
          busy={pinGate.verifying}
          error={pinGate.verifyError}
          buttonLabel="Unlock settings"
          onSubmit={(pin) => void pinGate.verifyPin(pin)}
        />
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer className="overflow-auto">
        <LoadingState label="Loading project settings..." />
      </PageContainer>
    );
  }

  if (error || !managementState) {
    return (
      <PageContainer className="overflow-auto">
        <ErrorState
          message={error ?? "Unable to load settings."}
          onRetry={() => void loadData()}
        />
      </PageContainer>
    );
  }

  const activeProcesses = managementState.processes.filter((process) => process.running);
  const schedulerState = managementState.scheduler.available
    ? managementState.scheduler.applied
      ? "Applied"
      : "Pending"
    : "Manual";
  const healthPresentation = getHealthPresentation(managementState);
  const manualHost = isManualHost(managementState);

  const applyRecommendedTemplates = () => {
    setFinanceDraft((current) => ({
      ...current,
      invoice_email_subject_template: RECOMMENDED_INVOICE_SUBJECT_TEMPLATE,
      invoice_email_body_template: RECOMMENDED_INVOICE_BODY_TEMPLATE,
      reminder_email_subject_template: RECOMMENDED_REMINDER_SUBJECT_TEMPLATE,
      reminder_email_body_template: RECOMMENDED_REMINDER_BODY_TEMPLATE,
    }));
  };

  return (
    <PageContainer className="overflow-auto bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.06),transparent_28%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_24%)]">
      <PageHeader
        title="Settings"
        description="Manage finance defaults, run operations, schedule automation, and inspect the live state of the project from one place."
        actions={
          <Button
            variant="outline"
            onClick={() => void loadData()}
            className="gap-2"
          >
            <RefreshCcwIcon className="size-4" />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-col gap-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Cases"
            value={formatCount(managementState.metrics.case_count)}
            hint={`${formatCount(managementState.metrics.document_count)} documents indexed`}
          />
          <StatCard
            label="Finance Activity"
            value={formatCount(managementState.metrics.invoice_count)}
            hint={`${formatCount(managementState.metrics.payment_count)} payments, ${formatCount(managementState.metrics.email_log_count)} emails`}
          />
          <StatCard
            label="Scheduler"
            value={schedulerState}
            hint={
              managementState.scheduler.available
                ? `${managementState.scheduler.entries.filter((entry) => entry.enabled).length} active jobs`
                : "Saved here, applied manually on this machine"
            }
          />
          <StatCard
            label="Health"
            value={healthPresentation.label}
            hint={healthPresentation.hint}
          />
          <StatCard
            label="Processes"
            value={formatCount(activeProcesses.length)}
            hint={
              activeProcesses.length
                ? activeProcesses.map((process) => process.label).join(", ")
                : "No managed jobs currently running"
            }
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="space-y-6">
            <Card className="border-border/70 bg-background/90">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle>Project Behavior</CardTitle>
                    <CardDescription>
                      Global controls for scraper behavior, validation mode, and environment-wide rules.
                    </CardDescription>
                  </div>
                  <StatusPill
                    label={managementState.scheduler.available ? "Cron wired" : "Manual host"}
                    tone={managementState.scheduler.available ? "success" : "info"}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <NoticeMessage notice={projectNotice} />

                <div className="grid gap-4 md:grid-cols-2">
                  <SettingField
                    label="Finance PIN"
                    hint="Used for protected finance actions where the workflow asks for a PIN."
                  >
                    <Input
                      type="password"
                      value={projectDraft.finance_pin}
                      onChange={(event) =>
                        setProjectDraft((current) => ({
                          ...current,
                          finance_pin: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField
                    label="Deployment Label"
                    hint="Shown in automation emails so you know which machine sent them."
                  >
                    <Input
                      value={projectDraft.deployment_label}
                      onChange={(event) =>
                        setProjectDraft((current) => ({
                          ...current,
                          deployment_label: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField
                    label="API Service Name"
                    hint="Systemd unit checked by healthcheck for the backend API."
                  >
                    <Input
                      value={projectDraft.api_service_name}
                      onChange={(event) =>
                        setProjectDraft((current) => ({
                          ...current,
                          api_service_name: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField
                    label="Web Service Name"
                    hint="Systemd unit checked by healthcheck for the Next.js web app."
                  >
                    <Input
                      value={projectDraft.web_service_name}
                      onChange={(event) =>
                        setProjectDraft((current) => ({
                          ...current,
                          web_service_name: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField
                    label="Telegram Service Name"
                    hint="Service unit name when you want bot controls to match your server naming."
                  >
                    <Input
                      value={projectDraft.bot_service_name}
                      onChange={(event) =>
                        setProjectDraft((current) => ({
                          ...current,
                          bot_service_name: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField
                    label="Automation Timezone"
                    hint="The timezone used when cron schedules are rendered."
                  >
                    <Input
                      value={projectDraft.automation_timezone}
                      onChange={(event) =>
                        setProjectDraft((current) => ({
                          ...current,
                          automation_timezone: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField
                    label="Browser Headless Mode"
                    hint="Auto leaves scraper headless behavior to the environment. Override only when debugging."
                  >
                    <Select
                      value={projectDraft.headless_mode}
                      onValueChange={(value) =>
                        setProjectDraft((current) => ({
                          ...current,
                          headless_mode: value,
                        }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="true">Forced headless</SelectItem>
                        <SelectItem value="false">Visible browser</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingField>
                  <SettingField
                    label="Smart Sync Test Pages"
                    hint="Used by the test operation so you can run safe, short scraper checks."
                  >
                    <Input
                      type="number"
                      value={projectDraft.smart_sync_test_pages}
                      onChange={(event) =>
                        setProjectDraft((current) => ({
                          ...current,
                          smart_sync_test_pages: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField
                    label="Full Scrape Test Pages"
                    hint="Used by test-mode full scrapes before you launch a real run."
                  >
                    <Input
                      type="number"
                      value={projectDraft.full_scrape_test_pages}
                      onChange={(event) =>
                        setProjectDraft((current) => ({
                          ...current,
                          full_scrape_test_pages: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                </div>

                <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/30 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-foreground">
                        Automation Access and Delivery
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        These values power scrapers, the daily report, Telegram,
                        and AI-assisted bot flows.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill
                        label="Portal"
                        tone={
                          managementState.runtime.portal_credentials_configured
                            ? "success"
                            : "error"
                        }
                      />
                      <StatusPill
                        label="Report Mail"
                        tone={
                          managementState.runtime.email_credentials_configured
                            ? "success"
                            : "error"
                        }
                      />
                      <StatusPill
                        label="Telegram"
                        tone={
                          managementState.runtime.telegram_credentials_configured
                            ? "success"
                            : "error"
                        }
                      />
                      <StatusPill
                        label="Google AI"
                        tone={
                          managementState.runtime.google_api_key_configured
                            ? "success"
                            : "info"
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <SettingField
                      label="Portal Username"
                      hint="Used by smart sync and full scrape jobs."
                    >
                      <Input
                        value={projectDraft.portal_username}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            portal_username: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                    <SettingField
                      label="Portal Password"
                      hint="Stored for scraper runs. Leave empty only if you want to clear it."
                    >
                      <Input
                        type="password"
                        value={projectDraft.portal_password}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            portal_password: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                    <SettingField
                      label="Report Sender Email"
                      hint="Used by daily report and healthcheck mail."
                    >
                      <Input
                        value={projectDraft.report_sender_email}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            report_sender_email: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                    <SettingField
                      label="Report Sender Password"
                      hint="SMTP password for daily report and healthcheck delivery."
                    >
                      <Input
                        type="password"
                        value={projectDraft.report_sender_password}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            report_sender_password: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                    <SettingField
                      label="Report Recipients"
                      hint="Comma-separated. If left blank, the sender address is used."
                    >
                      <Input
                        value={projectDraft.report_recipient_emails}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            report_recipient_emails: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                    <SettingField
                      label="Report SMTP Host"
                      hint="Defaults to smtp.gmail.com when left blank."
                    >
                      <Input
                        value={projectDraft.smtp_server}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            smtp_server: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                    <SettingField
                      label="Report SMTP Port"
                      hint="Defaults to 587."
                    >
                      <Input
                        type="number"
                        value={projectDraft.smtp_port}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            smtp_port: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                    <SettingField
                      label="Telegram Chat ID"
                      hint="Used by the Telegram bot for its target chat."
                    >
                      <Input
                        value={projectDraft.telegram_chat_id}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            telegram_chat_id: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                    <SettingField
                      label="Telegram Bot Token"
                      hint="The bot token used when launching the Telegram service."
                    >
                      <Input
                        type="password"
                        value={projectDraft.telegram_bot_token}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            telegram_bot_token: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                    <SettingField
                      label="Google AI Key"
                      hint="Used by the Telegram assistant layer when AI responses are enabled."
                    >
                      <Input
                        type="password"
                        value={projectDraft.google_api_key}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            google_api_key: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/30 p-4">
                  <div className="flex items-center gap-2">
                    <Clock3Icon className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Automation Schedule
                    </h3>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <SettingField label="Smart Sync">
                      <Select
                        value={projectDraft.smart_sync_schedule_enabled}
                        onValueChange={(value) =>
                          setProjectDraft((current) => ({
                            ...current,
                            smart_sync_schedule_enabled: value,
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
                    </SettingField>
                    <SettingField label="Smart Sync Time">
                      <Input
                        type="time"
                        value={projectDraft.smart_sync_time}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            smart_sync_time: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                    <SettingField label="Full Scrape">
                      <Select
                        value={projectDraft.full_scrape_schedule_enabled}
                        onValueChange={(value) =>
                          setProjectDraft((current) => ({
                            ...current,
                            full_scrape_schedule_enabled: value,
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
                    </SettingField>
                    <SettingField label="Full Scrape Time">
                      <Input
                        type="time"
                        value={projectDraft.full_scrape_time}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            full_scrape_time: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                    <SettingField label="Full Scrape Day">
                      <Select
                        value={projectDraft.full_scrape_day_of_week}
                        onValueChange={(value) =>
                          setProjectDraft((current) => ({
                            ...current,
                            full_scrape_day_of_week: value,
                          }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEKDAY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </SettingField>
                    <SettingField label="Daily Report">
                      <Select
                        value={projectDraft.daily_report_schedule_enabled}
                        onValueChange={(value) =>
                          setProjectDraft((current) => ({
                            ...current,
                            daily_report_schedule_enabled: value,
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
                    </SettingField>
                    <SettingField label="Daily Report Time">
                      <Input
                        type="time"
                        value={projectDraft.daily_report_time}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            daily_report_time: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                    <SettingField label="Report Window (hours)">
                      <Input
                        type="number"
                        value={projectDraft.daily_report_hours}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            daily_report_hours: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                    <SettingField label="Healthcheck">
                      <Select
                        value={projectDraft.healthcheck_schedule_enabled}
                        onValueChange={(value) =>
                          setProjectDraft((current) => ({
                            ...current,
                            healthcheck_schedule_enabled: value,
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
                    </SettingField>
                    <SettingField label="Healthcheck Interval (minutes)">
                      <Input
                        type="number"
                        value={projectDraft.healthcheck_interval_minutes}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            healthcheck_interval_minutes: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                    <SettingField label="Stale Threshold (hours)">
                      <Input
                        type="number"
                        value={projectDraft.healthcheck_stale_hours}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            healthcheck_stale_hours: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                    <SettingField label="Reminder Threshold (hours)">
                      <Input
                        type="number"
                        value={projectDraft.healthcheck_remind_hours}
                        onChange={(event) =>
                          setProjectDraft((current) => ({
                            ...current,
                            healthcheck_remind_hours: event.target.value,
                          }))
                        }
                      />
                    </SettingField>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveProject}
                    disabled={projectSaving}
                    className="gap-2"
                  >
                    <SaveIcon className="size-4" />
                    {projectSaving ? "Saving..." : "Save Project Settings"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-background/90">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle>Operations</CardTitle>
                    <CardDescription>
                      Trigger scrapers, reports, health checks, tests, and bot controls without leaving the app.
                    </CardDescription>
                  </div>
                  <StatusPill
                    label={manualHost ? "Local workspace" : "Managed host"}
                    tone="info"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <NoticeMessage notice={opsNotice} />

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <OperationButton
                    title="Smart Sync Test"
                    description="Safe limited scraper run using the configured test page count."
                    icon={<PlayIcon className="size-4" />}
                    disabled={opsBusyKey !== null}
                    onClick={() =>
                      void runOperation("smart_sync", {
                        mode: "test",
                        max_pages: Number(projectDraft.smart_sync_test_pages || "2"),
                      })
                    }
                  />
                  <OperationButton
                    title="Smart Sync Live"
                    description="Run a real incremental sync immediately."
                    icon={<WrenchIcon className="size-4" />}
                    disabled={opsBusyKey !== null}
                    onClick={() => void runOperation("smart_sync", { mode: "live" })}
                    variant="default"
                  />
                  <OperationButton
                    title="Full Scrape Test"
                    description="Run the full scraper in test mode against a short page window."
                    icon={<HardDriveIcon className="size-4" />}
                    disabled={opsBusyKey !== null}
                    onClick={() =>
                      void runOperation("full_scrape", {
                        mode: "test",
                        max_pages: Number(projectDraft.full_scrape_test_pages || "2"),
                      })
                    }
                  />
                  <OperationButton
                    title="Full Scrape Live"
                    description="Run the full portal refresh. Use only when you want a real refresh cycle."
                    icon={<TriangleAlertIcon className="size-4" />}
                    disabled={opsBusyKey !== null}
                    onClick={() => void runOperation("full_scrape", { mode: "live" })}
                    variant="destructive"
                  />
                  <OperationButton
                    title="Daily Report Preview"
                    description="Generate the report in dry-run mode without sending live mail."
                    icon={<MailIcon className="size-4" />}
                    disabled={opsBusyKey !== null}
                    onClick={() =>
                      void runOperation("report", {
                        mode: "test",
                        hours: Number(projectDraft.daily_report_hours || "24"),
                      })
                    }
                  />
                  <OperationButton
                    title="Send Daily Report"
                    description="Run the report now using the live email path."
                    icon={<MailIcon className="size-4" />}
                    disabled={opsBusyKey !== null}
                    onClick={() =>
                      void runOperation("report", {
                        mode: "live",
                        hours: Number(projectDraft.daily_report_hours || "24"),
                      })
                    }
                    variant="default"
                  />
                  <OperationButton
                    title="Healthcheck Dry Run"
                    description="Verify stale thresholds and health logic without sending reminders."
                    icon={<ShieldCheckIcon className="size-4" />}
                    disabled={opsBusyKey !== null}
                    onClick={() => void runOperation("healthcheck", { mode: "test" })}
                  />
                  <OperationButton
                    title="Healthcheck Live"
                    description="Run the live healthcheck with current thresholds."
                    icon={<ShieldCheckIcon className="size-4" />}
                    disabled={opsBusyKey !== null}
                    onClick={() => void runOperation("healthcheck", { mode: "live" })}
                    variant="default"
                  />
                  <OperationButton
                    title="Project Checks"
                    description="Run Python compile checks, web lint, and TypeScript validation."
                    icon={<FileCheck2Icon className="size-4" />}
                    disabled={opsBusyKey !== null}
                    onClick={() => void runOperation("project_checks", { mode: "live" })}
                  />
                  <OperationButton
                    title="Start Telegram Bot"
                    description="Launch the Telegram bot process from this machine."
                    icon={<BotIcon className="size-4" />}
                    disabled={opsBusyKey !== null}
                    onClick={() =>
                      void runOperation("telegram_bot", {
                        action: "start",
                        mode: "live",
                      })
                    }
                  />
                  <OperationButton
                    title="Stop Telegram Bot"
                    description="Stop a managed Telegram bot process if one is running."
                    icon={<SquareIcon className="size-4" />}
                    disabled={opsBusyKey !== null}
                    onClick={() =>
                      void runOperation("telegram_bot", {
                        action: "stop",
                        mode: "live",
                      })
                    }
                    variant="destructive"
                  />
                </div>

                <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">
                    Background services stay running. Syncs, reports, checks, and
                    previews are normally idle between runs.
                  </p>
                  {managementState.processes.map((process) => (
                    (() => {
                      const presentation = getProcessPresentation(
                        managementState,
                        process,
                      );
                      return (
                        <div
                          key={process.job}
                          className="rounded-xl border border-border/60 bg-background/80 px-3 py-3"
                        >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {process.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {presentation.detail}
                          </p>
                        </div>
                        <StatusPill
                          label={presentation.label}
                          tone={presentation.tone}
                        />
                      </div>
                      {process.command ? (
                        <p className="mt-2 rounded-lg bg-muted/50 px-2.5 py-2 font-mono text-[11px] text-muted-foreground">
                          {process.command}
                        </p>
                      ) : null}
                        </div>
                      );
                    })()
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-border/70 bg-background/90">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle>Finance and Communication</CardTitle>
                    <CardDescription>
                      Reusable company identity, SMTP, and message templates used across invoices and reminders.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={applyRecommendedTemplates}
                  >
                    Use Recommended Copy
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <NoticeMessage notice={financeNotice} />

                <div className="grid gap-4 md:grid-cols-2">
                  <SettingField label="Company Name">
                    <Input
                      value={financeDraft.company_name}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          company_name: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="Default Currency">
                    <Input
                      value={financeDraft.default_currency}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          default_currency: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="Company Email">
                    <Input
                      value={financeDraft.company_email}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          company_email: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="Company Phone">
                    <Input
                      value={financeDraft.company_phone}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          company_phone: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="Company Address">
                    <Input
                      value={financeDraft.company_address}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          company_address: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="City">
                    <Input
                      value={financeDraft.company_city}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          company_city: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="Tax Number">
                    <Input
                      value={financeDraft.company_tax_number}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          company_tax_number: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="Bank Name">
                    <Input
                      value={financeDraft.company_bank_name}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          company_bank_name: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="Bank Account">
                    <Input
                      value={financeDraft.company_bank_account}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          company_bank_account: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="IBAN">
                    <Input
                      value={financeDraft.company_iban}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          company_iban: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="SMTP Host">
                    <Input
                      value={financeDraft.smtp_host}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          smtp_host: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="SMTP Port">
                    <Input
                      type="number"
                      value={financeDraft.smtp_port}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          smtp_port: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="SMTP Username">
                    <Input
                      value={financeDraft.smtp_username}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          smtp_username: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="SMTP Password">
                    <Input
                      type="password"
                      value={financeDraft.smtp_password}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          smtp_password: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="From Email">
                    <Input
                      value={financeDraft.smtp_from_email}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          smtp_from_email: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="BCC">
                    <Input
                      value={financeDraft.smtp_bcc}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          smtp_bcc: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="Use TLS">
                    <Select
                      value={financeDraft.smtp_use_tls}
                      onValueChange={(value) =>
                        setFinanceDraft((current) => ({
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
                  </SettingField>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Template Placeholders
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      These values are available in both the settings page and the
                      finance workspace message composer.
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Recommended copy is prefilled here for convenience. Save
                      finance settings to make the templates live.
                    </p>
                    <p className="mt-3 rounded-xl bg-background/80 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                      {TEMPLATE_PLACEHOLDERS.join(" ")}
                    </p>
                  </div>
                  <SettingField
                    label="Invoice Subject Template"
                    hint="Used by both draft previews and live invoice sends."
                  >
                    <Input
                      value={financeDraft.invoice_email_subject_template}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          invoice_email_subject_template: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="Invoice Body Template">
                    <Textarea
                      rows={8}
                      value={financeDraft.invoice_email_body_template}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          invoice_email_body_template: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="Reminder Subject Template">
                    <Input
                      value={financeDraft.reminder_email_subject_template}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          reminder_email_subject_template: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                  <SettingField label="Reminder Body Template">
                    <Textarea
                      rows={8}
                      value={financeDraft.reminder_email_body_template}
                      onChange={(event) =>
                        setFinanceDraft((current) => ({
                          ...current,
                          reminder_email_body_template: event.target.value,
                        }))
                      }
                    />
                  </SettingField>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveFinance}
                    disabled={financeSaving}
                    className="gap-2"
                  >
                    <SaveIcon className="size-4" />
                    {financeSaving ? "Saving..." : "Save Finance Settings"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-background/90">
              <CardHeader>
                <CardTitle>Runtime Status</CardTitle>
                <CardDescription>
                  Machine capabilities, credentials, and storage paths used by the running app.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        Monitoring Status
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {healthPresentation.hint}
                      </p>
                    </div>
                    <StatusPill
                      label={healthPresentation.label}
                      tone={healthPresentation.tone}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <StatusRow
                    label="Portal credentials"
                    ok={managementState.runtime.portal_credentials_configured}
                  />
                  <StatusRow
                    label="Email credentials"
                    ok={managementState.runtime.email_credentials_configured}
                  />
                  <StatusRow
                    label="Telegram credentials"
                    ok={managementState.runtime.telegram_credentials_configured}
                  />
                  <StatusRow
                    label="Google AI key"
                    ok={managementState.runtime.google_api_key_configured}
                  />
                  <StatusRow
                    label="Database path"
                    ok={managementState.runtime.db_exists}
                    detail={managementState.runtime.db_path ?? ""}
                  />
                  <StatusRow
                    label="JSON snapshot path"
                    ok={managementState.runtime.json_dir_exists}
                    detail={managementState.runtime.json_dir ?? ""}
                  />
                  <StatusRow
                    label="Logs path"
                    ok={managementState.runtime.logs_dir_exists}
                    detail={managementState.runtime.logs_dir ?? ""}
                  />
                  <StatusRow
                    label="Cron availability"
                    ok={managementState.runtime.cron_available}
                    detail="Required for automatic schedules on Linux hosts."
                    fallbackLabel={
                      manualHost ? "Not on this host" : "Unavailable"
                    }
                    fallbackTone="info"
                  />
                  <StatusRow
                    label="System service control"
                    ok={managementState.runtime.systemctl_available}
                    detail="Used on Linux servers to check and control API, web, and bot services."
                    fallbackLabel={
                      manualHost ? "Manual host" : "Unavailable"
                    }
                    fallbackTone="info"
                  />
                  <StatusRow
                    label="wkhtmltopdf"
                    ok={managementState.runtime.wkhtmltopdf_available}
                    detail="Needed for PDF invoice attachments."
                    fallbackLabel="Optional"
                    fallbackTone="info"
                  />
                  <StatusRow
                    label="Node.js tooling"
                    ok={
                      managementState.runtime.node_available &&
                      managementState.runtime.npm_available
                    }
                    detail="Used for web checks and build validation."
                  />
                </div>

                <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                  <div className="flex items-center gap-2">
                    <DatabaseIcon className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Runtime Details
                    </h3>
                  </div>
                  <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">Host Role:</span>{" "}
                      {manualHost
                        ? "Local workspace / manual host"
                        : managementState.runtime.systemctl_available
                          ? "Managed Linux host"
                          : "Custom host"}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Platform:</span>{" "}
                      {managementState.runtime.platform}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Python:</span>{" "}
                      {managementState.runtime.python_executable}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Project Root:</span>{" "}
                      {managementState.runtime.project_root}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Runtime Root:</span>{" "}
                      {managementState.runtime.runtime_root}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-background/90">
              <CardHeader>
                <CardTitle>Automation and Activity</CardTitle>
                <CardDescription>
                  What is scheduled, what ran recently, and what needs operator attention.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {managementState.scheduler.entries.map((entry) => (
                    <div
                      key={entry.job}
                      className="rounded-xl border border-border/60 bg-background/80 px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {entry.job.replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {entry.schedule}
                          </p>
                        </div>
                        <StatusPill
                          label={entry.enabled ? "Enabled" : "Disabled"}
                          tone={entry.enabled ? "success" : "info"}
                        />
                      </div>
                      <p className="mt-2 rounded-lg bg-muted/50 px-2.5 py-2 font-mono text-[11px] text-muted-foreground">
                        {entry.command_preview}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/30 p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2Icon className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Recent Runs
                    </h3>
                  </div>
                  {managementState.runs.map((run) => (
                    <div
                      key={run.job}
                      className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/80 px-3 py-2"
                    >
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-foreground">
                          {run.job.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Started {formatDate(run.started_at)} | Finished {formatDate(run.finished_at)}
                        </p>
                      </div>
                      <StatusPill
                        label={run.status}
                        tone={statusTone(run.status)}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
