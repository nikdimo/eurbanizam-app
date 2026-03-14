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
  due_date: z.string().nullable().optional(),
  finance_status: z.string().nullable().optional(),
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
  finance_date: z.string().nullable().optional(),
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
