import { z } from "zod";

export const CaseSchema = z.object({
  case_id: z.string(),
  status: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  request_type: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  prev_change_at: z.string().nullable().optional(),
  first_seen: z.string().nullable().optional(),
  days_since_update: z.number().nullable().optional(),
  phone: z.string().nullable().optional(),
  latest_document_name: z.string().nullable().optional(),
  custom_fields: z
    .record(z.string(), z.string().nullable().optional())
    .default({}),
});

export type Case = z.infer<typeof CaseSchema>;

export const CaseDetailSchema = CaseSchema.extend({});

export type CaseDetail = z.infer<typeof CaseDetailSchema>;

export const CaseCustomFieldDefinitionSchema = z.object({
  name: z.string(),
  type: z.string(),
  options: z.array(z.string()),
  enabled: z.boolean().default(true),
  scope: z.string().default("case"),
});

export type CaseCustomFieldDefinition = z.infer<
  typeof CaseCustomFieldDefinitionSchema
>;

export const FilterOptionsSchema = z.object({
  request_types: z.array(z.string()).default([]),
  statuses: z.array(z.string()).default([]),
});

export type FilterOptions = z.infer<typeof FilterOptionsSchema>;

export const PaginatedCaseListSchema = z.object({
  items: CaseSchema.array().default([]),
  total: z.number().default(0),
  limit: z.number().default(0),
  offset: z.number().default(0),
});

export type PaginatedCaseList = z.infer<typeof PaginatedCaseListSchema>;

export const FinanceSummarySchema = z.object({
  contract_total: z.number(),
  paid_total: z.number(),
  outstanding_total: z.number(),
  overdue_invoices: z.number(),
  needs_action_count: z.number().default(0),
});

export type FinanceSummary = z.infer<typeof FinanceSummarySchema>;

export const FinanceCaseSchema = z.object({
  case_id: z.string(),
  title: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  request_type: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  first_seen: z.string().nullable().optional(),
  days_since_update: z.number().nullable().optional(),
  phone: z.string().nullable().optional(),
  contract_sum: z.number().default(0),
  contract_amount: z.number().nullable().optional(),
  paid_total: z.number().default(0),
  remaining: z.number().default(0),
  payments_count: z.number().default(0),
  overdue_amount: z.number().default(0),
  currency: z.string().nullable().optional(),
  service_type: z.string().nullable().optional(),
  custom_fields: z
    .record(z.string(), z.string().nullable().optional())
    .default({}),
});

export type FinanceCase = z.infer<typeof FinanceCaseSchema>;

export const PaginatedFinanceCaseListSchema = z.object({
  items: FinanceCaseSchema.array().default([]),
  total: z.number().default(0),
  limit: z.number().default(0),
  offset: z.number().default(0),
});

export type PaginatedFinanceCaseList = z.infer<
  typeof PaginatedFinanceCaseListSchema
>;

export const FinanceCaseDetailSchema = FinanceCaseSchema.extend({
  client_name: z.string().nullable().optional(),
  client_phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  invoiced_total: z.number().default(0),
  payments: z
    .array(
      z.object({
        payment_id: z.number(),
        case_id: z.string(),
        payment_date: z.string().nullable().optional(),
        amount: z.number(),
        currency: z.string().default("MKD"),
        note: z.string().nullable().optional(),
        created_at: z.string().nullable().optional(),
        updated_at: z.string().nullable().optional(),
      }),
    )
    .default([]),
  invoices: z
    .array(
      z.object({
        invoice_id: z.number(),
        case_id: z.string(),
        invoice_number: z.string().nullable().optional(),
        issue_date: z.string().nullable().optional(),
        due_date: z.string().nullable().optional(),
        amount: z.number(),
        currency: z.string().default("MKD"),
        status: z.string().nullable().optional(),
        client_name: z.string().nullable().optional(),
        client_email: z.string().nullable().optional(),
        client_address: z.string().nullable().optional(),
        service_description: z.string().nullable().optional(),
        items_json: z.string().nullable().optional(),
        file_path: z.string().nullable().optional(),
        reminders_enabled: z.number().nullable().optional(),
        reminder_first_after_days: z.number().nullable().optional(),
        reminder_repeat_days: z.number().nullable().optional(),
        reminder_max_count: z.number().nullable().optional(),
        reminder_sent_count: z.number().nullable().optional(),
        last_reminder_sent_at: z.string().nullable().optional(),
        created_at: z.string().nullable().optional(),
        updated_at: z.string().nullable().optional(),
      }),
    )
    .default([]),
  email_log: z
    .array(
      z.object({
        log_id: z.number(),
        case_id: z.string(),
        invoice_id: z.number().nullable().optional(),
        email_type: z.string().nullable().optional(),
        to_email: z.string().nullable().optional(),
        subject: z.string().nullable().optional(),
        body_preview: z.string().nullable().optional(),
        attachment_filename: z.string().nullable().optional(),
        attachment_size_bytes: z.number().nullable().optional(),
        reminder_sequence: z.number().nullable().optional(),
        sent_at: z.string().nullable().optional(),
        created_at: z.string().nullable().optional(),
      }),
    )
    .default([]),
  recipients: z
    .array(
      z.object({
        email: z.string(),
        last_used_at: z.string().nullable().optional(),
        label: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

export type FinanceCaseDetail = z.infer<typeof FinanceCaseDetailSchema>;

export const FinanceSettingsSchema = z.object({
  company_name: z.string().nullable().optional(),
  company_address: z.string().nullable().optional(),
  company_city: z.string().nullable().optional(),
  company_tax_number: z.string().nullable().optional(),
  company_bank_name: z.string().nullable().optional(),
  company_bank_account: z.string().nullable().optional(),
  company_iban: z.string().nullable().optional(),
  company_email: z.string().nullable().optional(),
  company_phone: z.string().nullable().optional(),
  smtp_host: z.string().nullable().optional(),
  smtp_port: z.number().nullable().optional(),
  smtp_username: z.string().nullable().optional(),
  smtp_password: z.string().nullable().optional(),
  smtp_use_tls: z.boolean().nullable().optional(),
  smtp_from_email: z.string().nullable().optional(),
  smtp_bcc: z.string().nullable().optional(),
  default_currency: z.string().nullable().optional(),
  invoice_email_subject_template: z.string().nullable().optional(),
  invoice_email_body_template: z.string().nullable().optional(),
  reminder_email_subject_template: z.string().nullable().optional(),
  reminder_email_body_template: z.string().nullable().optional(),
});

export type FinanceSettings = z.infer<typeof FinanceSettingsSchema>;

export const OperationalSettingsSchema = z.object({
  portal_username: z.string().nullable().optional(),
  portal_password: z.string().nullable().optional(),
  report_sender_email: z.string().nullable().optional(),
  report_sender_password: z.string().nullable().optional(),
  report_recipient_emails: z.string().nullable().optional(),
  smtp_server: z.string().nullable().optional(),
  smtp_port: z.number().nullable().optional(),
  telegram_chat_id: z.string().nullable().optional(),
  telegram_bot_token: z.string().nullable().optional(),
  google_api_key: z.string().nullable().optional(),
});

export type OperationalSettings = z.infer<typeof OperationalSettingsSchema>;

export const ProjectManagementConfigSchema = z.object({
  finance_pin: z.string().nullable().optional(),
  deployment_label: z.string().nullable().optional(),
  api_service_name: z.string().nullable().optional(),
  web_service_name: z.string().nullable().optional(),
  bot_service_name: z.string().nullable().optional(),
  automation_timezone: z.string().default("Europe/Copenhagen"),
  smart_sync_schedule_enabled: z.boolean().default(false),
  smart_sync_time: z.string().default("04:00"),
  full_scrape_schedule_enabled: z.boolean().default(false),
  full_scrape_time: z.string().default("03:00"),
  full_scrape_day_of_week: z.number().default(0),
  daily_report_schedule_enabled: z.boolean().default(false),
  daily_report_time: z.string().default("04:15"),
  daily_report_hours: z.number().default(24),
  healthcheck_schedule_enabled: z.boolean().default(false),
  healthcheck_interval_minutes: z.number().default(15),
  healthcheck_stale_hours: z.number().default(36),
  healthcheck_remind_hours: z.number().default(12),
  smart_sync_test_pages: z.number().default(2),
  full_scrape_test_pages: z.number().default(2),
  headless_mode: z.boolean().nullable().optional(),
});

export type ProjectManagementConfig = z.infer<
  typeof ProjectManagementConfigSchema
>;

export const RuntimeStatusSchema = z.object({
  os_name: z.string(),
  platform: z.string(),
  python_executable: z.string(),
  project_root: z.string(),
  runtime_root: z.string().nullable().optional(),
  db_path: z.string().nullable().optional(),
  json_dir: z.string().nullable().optional(),
  logs_dir: z.string().nullable().optional(),
  db_exists: z.boolean().default(false),
  json_dir_exists: z.boolean().default(false),
  logs_dir_exists: z.boolean().default(false),
  secrets_file_exists: z.boolean().default(false),
  storage_state_exists: z.boolean().default(false),
  wkhtmltopdf_available: z.boolean().default(false),
  cron_available: z.boolean().default(false),
  systemctl_available: z.boolean().default(false),
  node_available: z.boolean().default(false),
  npm_available: z.boolean().default(false),
  portal_credentials_configured: z.boolean().default(false),
  email_credentials_configured: z.boolean().default(false),
  telegram_credentials_configured: z.boolean().default(false),
  google_api_key_configured: z.boolean().default(false),
});

export type RuntimeStatus = z.infer<typeof RuntimeStatusSchema>;

export const RuntimeMetricsSchema = z.object({
  case_count: z.number().default(0),
  document_count: z.number().default(0),
  invoice_count: z.number().default(0),
  payment_count: z.number().default(0),
  email_log_count: z.number().default(0),
  json_file_count: z.number().default(0),
});

export type RuntimeMetrics = z.infer<typeof RuntimeMetricsSchema>;

export const HealthStatusSchema = z.object({
  status: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  last_email_subject_state: z.string().nullable().optional(),
  last_email_ok: z.boolean().nullable().optional(),
  last_email_msg: z.string().nullable().optional(),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const SchedulerEntrySchema = z.object({
  job: z.string(),
  enabled: z.boolean().default(false),
  schedule: z.string(),
  command_preview: z.string(),
});

export type SchedulerEntry = z.infer<typeof SchedulerEntrySchema>;

export const SchedulerStatusSchema = z.object({
  driver: z.string().default("manual"),
  available: z.boolean().default(false),
  applied: z.boolean().default(false),
  timezone: z.string().nullable().optional(),
  entries: z.array(SchedulerEntrySchema).default([]),
});

export type SchedulerStatus = z.infer<typeof SchedulerStatusSchema>;

export const JobRunSummarySchema = z.object({
  job: z.string(),
  started_at: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
  status: z.string().default("unknown"),
});

export type JobRunSummary = z.infer<typeof JobRunSummarySchema>;

export const ManagedProcessStatusSchema = z.object({
  job: z.string(),
  label: z.string(),
  running: z.boolean().default(false),
  pid: z.number().nullable().optional(),
  started_at: z.string().nullable().optional(),
  command: z.string().nullable().optional(),
});

export type ManagedProcessStatus = z.infer<typeof ManagedProcessStatusSchema>;

export const ProjectManagementStateSchema = z.object({
  config: ProjectManagementConfigSchema,
  operations: OperationalSettingsSchema,
  runtime: RuntimeStatusSchema,
  metrics: RuntimeMetricsSchema,
  health: HealthStatusSchema,
  scheduler: SchedulerStatusSchema,
  runs: z.array(JobRunSummarySchema).default([]),
  processes: z.array(ManagedProcessStatusSchema).default([]),
});

export type ProjectManagementState = z.infer<
  typeof ProjectManagementStateSchema
>;

export const JobActionResultSchema = z.object({
  job: z.string(),
  action: z.string(),
  accepted: z.boolean(),
  message: z.string(),
  pid: z.number().nullable().optional(),
  log_path: z.string().nullable().optional(),
});

export type JobActionResult = z.infer<typeof JobActionResultSchema>;

export const PinStatusSchema = z.object({
  has_pin: z.boolean().default(false),
});

export type PinStatus = z.infer<typeof PinStatusSchema>;

export const PinVerifyResultSchema = z.object({
  verified: z.literal(true),
});

export type PinVerifyResult = z.infer<typeof PinVerifyResultSchema>;
