import React, { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StatPill } from "@/components/finance/StatPill";
import { StatusBadge } from "@/components/finance/StatusBadge";
import {
  AlertTriangle, RefreshCw, CheckCircle2, ArrowRight, Wallet,
  FileText, Mail, Clock, Trash2, Plus, Send, Copy, AlertCircle,
  CreditCard, Play, FileCheck, Save, ChevronDown, ChevronRight, ChevronLeft, X, Building2, PencilLine
} from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const MOCK_DATA = {
  case_id: "76989",
  title: "Marija Dimovska - Urbanistički Projekt",
  request_type: "Urbanistički Projekt",
  status: "IN_PROGRESS",
  contract_sum: 100000,
  currency: "MKD",
  client_name: "Marija Dimovska",
  client_phone: "+38970123456",
  notes: "Client prefers email contact. Partial payment already received.",
  custom_fields: {
    "Name / Last name": "Marija Dimovska",
    email: "dimovski.niko@gmail.com",
    alternate_emails: "dimovski.niko@outlook.com",
    company: "Dimovska Consulting d.o.o.",
    address: "Partizanska 15, 1000 Skopje",
  } as Record<string, string>,
  payments: [
    { payment_id: 1, payment_date: "2026-03-11", amount: 20000, currency: "MKD", note: "down payment" },
    { payment_id: 2, payment_date: "2026-03-12", amount: 40000, currency: "MKD", note: "second installment" },
  ],
  invoices: [
    { invoice_id: 1, invoice_number: "001", status: "PAID", issue_date: "2026-02-15", due_date: "2026-03-01", amount: 60000, currency: "MKD", client_name: "Marija Dimovska", client_email: "dimovski.niko@gmail.com", client_address: "Partizanska 15, 1000 Skopje", service_description: "Urbanistički Projekt - faza 1", reminders_enabled: 1, reminder_first_after_days: 3, reminder_repeat_days: 7, reminder_max_count: 3, reminder_sent_count: 0 },
    { invoice_id: 2, invoice_number: "002", status: "SENT", issue_date: "2026-03-10", due_date: "2026-03-20", amount: 40000, currency: "MKD", client_name: "Marija Dimovska", client_email: "dimovski.niko@outlook.com", client_address: "Partizanska 15, 1000 Skopje", service_description: "Urbanistički Projekt - faza 2", reminders_enabled: 1, reminder_first_after_days: 3, reminder_repeat_days: 7, reminder_max_count: 3, reminder_sent_count: 2 },
  ],
  email_log: [
    { log_id: 1, email_type: "invoice", to_email: "dimovski.niko@gmail.com", subject: "Invoice 001 for case 76989", sent_at: "2026-02-15T11:00:00", body_preview: "Dear Marija,\n\nPlease find attached Invoice 001 for case 76989.\nAmount: 60,000.00 MKD\nDue: 01 Mar 2026\n\nThank you for your business.\n\nBest regards,\neurbanizam team" },
    { log_id: 2, email_type: "invoice", to_email: "dimovski.niko@outlook.com", subject: "Invoice 002 for case 76989", sent_at: "2026-03-12T23:29:00", body_preview: "Dear Marija,\n\nPlease find attached Invoice 002 for case 76989.\nAmount: 40,000.00 MKD\nDue: 20 Mar 2026\n\nThank you for your business.\n\nBest regards,\neurbanizam team" },
    { log_id: 3, email_type: "reminder", to_email: "dimovski.niko@outlook.com", subject: "Payment reminder for invoice 002", sent_at: "2026-03-12T23:31:00", body_preview: "Dear Marija,\n\nThis is a friendly reminder that Invoice 002 (40,000.00 MKD) is due on 20 Mar 2026.\n\nPlease arrange payment at your earliest convenience.\n\nBest regards,\neurbanizam team" },
  ],
  remembered_recipients: ["dimovski.niko@outlook.com", "dimovski.niko@gmail.com"],
  settings: { smtp_from_email: null as string | null, company_email: null as string | null },
};

const TODAY_MOCK = new Date("2026-03-21");

function formatMoney(value: number, currency: string = "MKD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(dateStr: string) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type EmailLog = {
  log_id: number;
  email_type: "invoice" | "reminder" | "general";
  to_email: string;
  subject: string;
  sent_at: string;
  body_preview: string;
};

export default function FinanceWorkspace() {
  const { toast } = useToast();
  const [data, setData] = useState(MOCK_DATA);
  const [activeTab, setActiveTab] = useState("invoices");

  // Right panel mode
  const [panelView, setPanelView] = useState<"invoice" | "payment" | "email">("invoice");
  const [activeInvoiceId, setActiveInvoiceId] = useState<number | null>(null);
  const [panelEmail, setPanelEmail] = useState<EmailLog | null>(null);

  // Communication tab flow state
  const [commStep, setCommStep] = useState<"pick-type" | "pick-invoice" | "compose" | "sent">("pick-type");
  const [commType, setCommType] = useState<"invoice" | "reminder" | "general" | null>(null);
  const [commSelectedInvoiceId, setCommSelectedInvoiceId] = useState<number | null>(null);
  const [lastSentEmail, setLastSentEmail] = useState<EmailLog | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  const paidTotal = data.payments.reduce((acc, p) => acc + p.amount, 0);
  const invoicedTotal = data.invoices.reduce((acc, i) => acc + i.amount, 0);
  const outstanding = data.contract_sum - paidTotal;

  const overdueInvoices = data.invoices.filter(
    (inv) => inv.status !== "PAID" && inv.status !== "CANCELLED" && new Date(inv.due_date) < TODAY_MOCK
  );

  const recommendation = useMemo(() => {
    if (overdueInvoices.length > 0) {
      return { title: "Follow up on overdue money", description: `${overdueInvoices.length} invoice(s) are overdue. Queue a reminder while the payment context is fresh.`, tab: "communication", tone: "warning", icon: AlertTriangle };
    }
    if (outstanding > 0 && data.invoices.length === 0) {
      return { title: "Create the first invoice", description: "There is contract value tracked here, but no invoice exists yet.", tab: "invoices", tone: "default", icon: Plus };
    }
    if (data.contract_sum > 0 && outstanding <= 0) {
      return { title: "Case is financially settled", description: "Everything due on this case appears collected.", tab: "invoices", tone: "success", icon: CheckCircle2 };
    }
    return null;
  }, [overdueInvoices, outstanding, data]);

  // Unified timeline for Invoices tab
  const unifiedTimeline = useMemo(() => {
    const items: Array<{ type: string; date: string; sortKey: string; id: string; payload: unknown }> = [];
    data.invoices.forEach(inv => items.push({ type: "invoice", date: inv.issue_date, sortKey: inv.issue_date, id: `inv-${inv.invoice_id}`, payload: inv }));
    data.payments.forEach(p => items.push({ type: "payment", date: p.payment_date, sortKey: p.payment_date, id: `pay-${p.payment_id}`, payload: p }));
    data.email_log.forEach(log => items.push({ type: "email", date: log.sent_at, sortKey: log.sent_at, id: `email-${log.log_id}`, payload: log }));
    return items.sort((a, b) => new Date(b.sortKey).getTime() - new Date(a.sortKey).getTime());
  }, [data]);

  // Group timeline by calendar date for visual separators
  const groupedTimeline = useMemo(() => {
    const groups: Array<{ dateLabel: string; items: typeof unifiedTimeline }> = [];
    unifiedTimeline.forEach(item => {
      const day = item.sortKey.split("T")[0];
      const last = groups[groups.length - 1];
      if (last && last.dateLabel === day) {
        last.items.push(item);
      } else {
        groups.push({ dateLabel: day, items: [item] });
      }
    });
    return groups;
  }, [unifiedTimeline]);

  // Forms
  const primaryEmail = data.custom_fields["email"] ?? "";
  const clientAddress = data.custom_fields["address"] ?? "";

  const [paymentForm, setPaymentForm] = useState({ payment_date: TODAY_MOCK.toISOString().split("T")[0], amount: outstanding > 0 ? outstanding.toString() : "", currency: data.currency, note: "" });
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_number: "", status: "DRAFT", issue_date: TODAY_MOCK.toISOString().split("T")[0], due_date: "",
    amount: outstanding > 0 ? outstanding.toString() : "", currency: data.currency,
    client_name: data.client_name, client_email: primaryEmail, client_address: clientAddress,
    service_description: data.request_type, line_items: "",
    reminders_enabled: 1, reminder_first_after_days: 3, reminder_repeat_days: 7, reminder_max_count: 3,
  });
  const [commForm, setCommForm] = useState({ to: primaryEmail, subject: "", body: "" });

  // Handlers
  const handleLogPayment = () => {
    if (!paymentForm.amount || !paymentForm.payment_date) { toast({ title: "Error", description: "Date and amount are required", variant: "destructive" }); return; }
    const newPayment = { payment_id: Date.now(), payment_date: paymentForm.payment_date, amount: parseFloat(paymentForm.amount), currency: paymentForm.currency, note: paymentForm.note };
    setData(prev => ({ ...prev, payments: [...prev.payments, newPayment] }));
    toast({ title: "Payment recorded" });
    setPaymentForm(prev => ({ ...prev, amount: "", note: "" }));
  };

  const handleDeletePayment = (payment_id: number) => {
    setData(prev => ({ ...prev, payments: prev.payments.filter(p => p.payment_id !== payment_id) }));
    toast({ title: "Payment deleted" });
  };

  const handleSaveInvoice = () => {
    if (!invoiceForm.invoice_number || !invoiceForm.amount) { toast({ title: "Error", description: "Invoice number and amount are required", variant: "destructive" }); return; }
    if (activeInvoiceId !== null) {
      // Update existing invoice in place
      setData(prev => ({
        ...prev,
        invoices: prev.invoices.map(inv =>
          inv.invoice_id === activeInvoiceId
            ? { ...inv, invoice_number: invoiceForm.invoice_number, status: invoiceForm.status, issue_date: invoiceForm.issue_date, due_date: invoiceForm.due_date, amount: parseFloat(invoiceForm.amount), currency: invoiceForm.currency, client_name: invoiceForm.client_name, client_email: invoiceForm.client_email, client_address: invoiceForm.client_address, service_description: invoiceForm.service_description, reminders_enabled: invoiceForm.reminders_enabled, reminder_first_after_days: invoiceForm.reminder_first_after_days, reminder_repeat_days: invoiceForm.reminder_repeat_days, reminder_max_count: invoiceForm.reminder_max_count }
            : inv
        ),
      }));
      toast({ title: "Invoice updated", description: `Invoice ${invoiceForm.invoice_number} saved.` });
    } else {
      // Create new invoice
      const newInvoice = { invoice_id: Date.now(), invoice_number: invoiceForm.invoice_number, status: invoiceForm.status, issue_date: invoiceForm.issue_date, due_date: invoiceForm.due_date, amount: parseFloat(invoiceForm.amount), currency: invoiceForm.currency, client_name: invoiceForm.client_name, client_email: invoiceForm.client_email, client_address: invoiceForm.client_address, service_description: invoiceForm.service_description, reminders_enabled: invoiceForm.reminders_enabled, reminder_first_after_days: invoiceForm.reminder_first_after_days, reminder_repeat_days: invoiceForm.reminder_repeat_days, reminder_max_count: invoiceForm.reminder_max_count, reminder_sent_count: 0 };
      setData(prev => ({ ...prev, invoices: [...prev.invoices, newInvoice] }));
      toast({ title: "Invoice created", description: `Invoice ${invoiceForm.invoice_number} created.` });
      setActiveInvoiceId(newInvoice.invoice_id);
    }
  };

  const handleSendEmail = (isDryRun: boolean = false) => {
    if (!commForm.to) { toast({ title: "Error", description: "Recipient email is required", variant: "destructive" }); return; }
    if (isDryRun) { toast({ title: "Dry run successful", description: "Email looks good and is ready to send." }); return; }
    const newLog: EmailLog = { log_id: Date.now(), email_type: commType ?? "general", to_email: commForm.to, subject: commForm.subject, sent_at: new Date().toISOString(), body_preview: commForm.body };
    setData(prev => ({ ...prev, email_log: [...prev.email_log, newLog] }));
    setLastSentEmail(newLog);
    setCommStep("sent");
    toast({ title: "Email sent", description: `Successfully sent to ${commForm.to}` });
  };

  const loadInvoiceIntoForm = (inv: (typeof MOCK_DATA.invoices)[number]) => {
    setPanelView("invoice");
    setActiveInvoiceId(inv.invoice_id);
    setInvoiceForm({ invoice_number: inv.invoice_number, status: inv.status, issue_date: inv.issue_date, due_date: inv.due_date, amount: inv.amount.toString(), currency: inv.currency, client_name: inv.client_name, client_email: inv.client_email, client_address: inv.client_address, service_description: inv.service_description, line_items: "", reminders_enabled: inv.reminders_enabled, reminder_first_after_days: inv.reminder_first_after_days, reminder_repeat_days: inv.reminder_repeat_days, reminder_max_count: inv.reminder_max_count });
  };

  const prefillCommForm = (type: "invoice" | "reminder" | "general", invoiceId: number | null) => {
    const inv = invoiceId !== null ? data.invoices.find(i => i.invoice_id === invoiceId) : null;
    if (type === "invoice" && inv) {
      return { to: inv.client_email || primaryEmail, subject: `Invoice ${inv.invoice_number} for case ${data.case_id}`, body: `Dear ${data.client_name},\n\nPlease find attached Invoice ${inv.invoice_number} for case ${data.case_id}.\nAmount: ${formatMoney(inv.amount, inv.currency)}\nDue: ${formatDate(inv.due_date)}\n\nThank you for your business.\n\nBest regards,\neurbanizam team` };
    } else if (type === "reminder" && inv) {
      return { to: inv.client_email || primaryEmail, subject: `Payment reminder for invoice ${inv.invoice_number}`, body: `Dear ${data.client_name},\n\nThis is a friendly reminder that Invoice ${inv.invoice_number} (${formatMoney(inv.amount, inv.currency)}) is due on ${formatDate(inv.due_date)}.\n\nPlease arrange payment at your earliest convenience.\n\nBest regards,\neurbanizam team` };
    }
    return { to: primaryEmail, subject: "", body: `Dear ${data.client_name},\n\n\n\nBest regards,\neurbanizam team` };
  };

  return (
    <AppShell>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* COMMAND BAR + TAB NAV — both sticky so tabs never go behind the bar */}
        <div className="sticky top-0 z-10 bg-background shadow-sm">
          {/* Info row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 border-b">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-base font-semibold tracking-tight truncate">{data.title}</h1>
              <Badge variant="outline" className="font-mono text-xs shrink-0">{data.case_id}</Badge>
              <Badge variant="secondary" className="text-xs shrink-0 hidden sm:inline-flex">{data.request_type}</Badge>
            </div>
            <div className="flex items-center gap-4 ml-auto rounded-lg border bg-card px-4 py-1.5 shadow-xs">
              <StatPill label="Contract" value={formatMoney(data.contract_sum, data.currency)} />
              <Separator orientation="vertical" className="h-7" />
              <StatPill label="Invoiced" value={formatMoney(invoicedTotal, data.currency)} />
              <Separator orientation="vertical" className="h-7" />
              <StatPill label="Paid" value={<span className="text-emerald-600">{formatMoney(paidTotal, data.currency)}</span>} />
              <Separator orientation="vertical" className="h-7" />
              <StatPill label="Outstanding" value={<span className={outstanding > 0 ? "text-amber-600" : "text-emerald-600"}>{formatMoney(outstanding, data.currency)}</span>} />
              <Separator orientation="vertical" className="h-7" />
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {/* Tab nav row */}
          <TabsList className="flex w-full justify-start overflow-x-auto rounded-none border-b bg-transparent px-6 py-0">
            {[
              { value: "invoices", label: "Invoices & Payments", icon: FileCheck },
              { value: "communication", label: "Communication", icon: Mail },
              { value: "contract", label: "Contract Profile", icon: FileText },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="relative h-10 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none">
                <Icon className="mr-2 h-4 w-4" /> {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ACTION BANNER — in scrollable area, never overlaps tabs */}
        {recommendation && (
          <div className="px-6 pt-4">
            <div className={`flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm ${
              recommendation.tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" :
              recommendation.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" :
              "border-blue-200 bg-blue-50 text-blue-900"
            }`}>
              <div className="flex items-center gap-2">
                <recommendation.icon className={`h-4 w-4 shrink-0 ${recommendation.tone === "warning" ? "text-amber-600" : recommendation.tone === "success" ? "text-emerald-600" : "text-blue-600"}`} />
                <span className="font-medium">{recommendation.title}</span>
                <span className="text-xs opacity-75 hidden sm:inline">— {recommendation.description}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setActiveTab(recommendation.tab)} className="h-7 shrink-0 bg-white/60 hover:bg-white text-xs">
                Take action <ArrowRight className="ml-1.5 h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

      {/* MAIN CONTENT */}
      <div className="px-6 pb-12 pt-4">

          {/* ─── INVOICES & PAYMENTS TAB ─── */}
          <TabsContent value="invoices" className="outline-none">
            <div className="grid gap-6 lg:grid-cols-[1fr_440px]">

              {/* LEFT: unified timeline */}
              <div className="space-y-2 min-w-0">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">All Activity</h3>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setPanelView("payment"); setActiveInvoiceId(null); }}>
                      <CreditCard className="mr-1.5 h-3.5 w-3.5" /> New Payment
                    </Button>
                    <Button size="sm" onClick={() => { setPanelView("invoice"); setActiveInvoiceId(null); setInvoiceForm(f => ({ ...f, invoice_number: `INV-${Date.now().toString().slice(-4)}` })); }}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> New Invoice
                    </Button>
                  </div>
                </div>

                {groupedTimeline.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-10 text-center">
                    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">No activity yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">Create an invoice or log a payment to get started.</p>
                  </div>
                ) : (
                  <div className="relative ml-5 pb-4">
                    {/* Timeline vertical line */}
                    <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />

                    {groupedTimeline.map(({ dateLabel, items: groupItems }) => (
                      <div key={dateLabel} className="mb-2">
                        {/* Date group separator */}
                        <div className="relative mb-3 flex items-center gap-3 pl-6">
                          <div className="absolute -left-[5px] h-2.5 w-2.5 rounded-full border-2 border-background bg-border" />
                          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                            {formatDate(dateLabel)}
                          </span>
                          <div className="flex-1 h-px bg-border/50" />
                        </div>

                        {/* Items within this date */}
                        <div className="space-y-2 pl-6">
                          {groupItems.map((item) => {
                            if (item.type === "invoice") {
                              const inv = item.payload as (typeof MOCK_DATA.invoices)[number];
                              const isOverdue = inv.status !== "PAID" && inv.status !== "CANCELLED" && new Date(inv.due_date) < TODAY_MOCK;
                              const isActive = activeInvoiceId === inv.invoice_id;
                              const dotColor = inv.status === "PAID" ? "bg-emerald-500" : isOverdue ? "bg-red-500" : "bg-blue-500";
                              return (
                                <div key={item.id} className="relative">
                                  <div className={`absolute -left-[28px] top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-background ${dotColor}`} />
                                  <button
                                    className={`group w-full text-left rounded-xl border bg-card p-4 shadow-xs transition-all hover:shadow-md hover:border-primary/40 ${isActive ? "ring-2 ring-primary/60 border-primary/30 bg-primary/[0.03]" : ""}`}
                                    onClick={() => loadInvoiceIntoForm(inv)}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Invoice</span>
                                          <span className="text-[10px] text-muted-foreground">·</span>
                                          <code className="text-xs font-semibold text-foreground">#{inv.invoice_number}</code>
                                          <StatusBadge status={inv.status} />
                                          {isOverdue && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">
                                              <AlertTriangle className="h-2.5 w-2.5" /> Overdue
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-xs text-muted-foreground truncate">{inv.service_description}</p>
                                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">Due {formatDate(inv.due_date)}</p>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-sm font-bold tabular-nums">{formatMoney(inv.amount, inv.currency)}</span>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                                      </div>
                                    </div>
                                  </button>
                                </div>
                              );
                            }

                            if (item.type === "payment") {
                              const p = item.payload as (typeof MOCK_DATA.payments)[number];
                              return (
                                <div key={item.id} className="relative">
                                  <div className="absolute -left-[28px] top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" />
                                  <div className="group rounded-xl border bg-card p-4 shadow-xs">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Payment Received</span>
                                        </div>
                                        {p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <span className="text-sm font-bold tabular-nums text-emerald-600">+{formatMoney(p.amount, p.currency)}</span>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                                          onClick={() => handleDeletePayment(p.payment_id)}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            if (item.type === "email") {
                              const log = item.payload as EmailLog;
                              const isReminder = log.email_type === "reminder";
                              const isActive = panelView === "email" && panelEmail?.log_id === log.log_id;
                              return (
                                <div key={item.id} className="relative">
                                  <div className={`absolute -left-[28px] top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-background ${isReminder ? "bg-amber-400" : "bg-sky-400"}`} />
                                  <button
                                    className={`w-full text-left rounded-xl border bg-card p-4 shadow-xs transition-all hover:shadow-sm hover:border-foreground/20 ${isActive ? (isReminder ? "ring-2 ring-amber-400 border-amber-300" : "ring-2 ring-sky-400 border-sky-300") : ""}`}
                                    onClick={() => { setPanelEmail(log); setPanelView("email"); }}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1">
                                          <Mail className={`h-3 w-3 shrink-0 ${isReminder ? "text-amber-500" : "text-sky-500"}`} />
                                          <span className={`text-[10px] font-bold uppercase tracking-wider ${isReminder ? "text-amber-700" : "text-sky-700"}`}>
                                            {isReminder ? "Reminder Sent" : "Invoice Email Sent"}
                                          </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground truncate">To: {log.to_email}</p>
                                        <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{log.subject}</p>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">
                                          {new Date(log.sent_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${isActive ? (isReminder ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700") : "bg-muted text-muted-foreground"}`}>
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
                      <CardHeader className={`border-b pb-3 pt-4 px-5 ${panelEmail.email_type === "reminder" ? "bg-amber-50" : "bg-sky-50"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {panelEmail.email_type === "reminder"
                                ? <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                                : <FileCheck className="h-4 w-4 text-sky-500 shrink-0" />}
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${panelEmail.email_type === "reminder" ? "text-amber-700" : "text-sky-700"}`}>
                                {panelEmail.email_type === "reminder" ? "Reminder Sent" : "Invoice Email Sent"}
                              </span>
                            </div>
                            <p className="text-sm font-semibold leading-tight truncate">{panelEmail.subject}</p>
                          </div>
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => { setPanelView("invoice"); setPanelEmail(null); }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                          <div><span className="font-medium text-foreground">To:</span> {panelEmail.to_email}</div>
                          <div><span className="font-medium text-foreground">Sent:</span> {formatDateTime(panelEmail.sent_at)}</div>
                        </div>
                      </CardHeader>
                      <CardContent className="px-5 pt-4 pb-5">
                        <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground leading-relaxed">{panelEmail.body_preview || "(No body recorded)"}</pre>
                      </CardContent>
                      <CardFooter className="border-t bg-muted/10 px-5 py-3 gap-2">
                        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => { setPanelView("invoice"); setActiveInvoiceId(null); setPanelEmail(null); }}>
                          <Plus className="mr-1.5 h-3.5 w-3.5" /> New Invoice
                        </Button>
                        <Button size="sm" className="flex-1 text-xs" onClick={() => {
                          const type = panelEmail.email_type === "reminder" ? "reminder" as const : "invoice" as const;
                          setCommType(type);
                          setCommSelectedInvoiceId(null);
                          setCommForm({ to: panelEmail.to_email, subject: `Re: ${panelEmail.subject}`, body: "" });
                          setLastSentEmail(null);
                          setCommStep("compose");
                          setActiveTab("communication");
                          setPanelEmail(null);
                        }}>
                          <Send className="mr-1.5 h-3.5 w-3.5" /> Reply / Follow up
                        </Button>
                      </CardFooter>
                    </>
                  ) : (
                  <>
                  {/* ── EDIT MODE header ── */}
                  {activeInvoiceId !== null && panelView === "invoice" ? (
                    <div className="border-b border-blue-200 bg-blue-50 px-5 pb-3 pt-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <PencilLine className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Editing Invoice</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-bold text-foreground">#{invoiceForm.invoice_number}</span>
                            <StatusBadge status={invoiceForm.status} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{invoiceForm.service_description}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0 gap-1 border-blue-200 bg-white text-xs text-blue-700 hover:bg-blue-50"
                          onClick={() => { setActiveInvoiceId(null); setInvoiceForm(f => ({ ...f, invoice_number: "", status: "DRAFT" })); }}
                        >
                          <X className="h-3 w-3" /> New
                        </Button>
                      </div>
                    </div>
                  ) : (
                  /* ── DRAFT NEW header ── */
                  <CardHeader className="border-b bg-muted/20 pb-3 pt-4 px-5">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">Draft New</CardTitle>
                      <div className="flex items-center gap-1 rounded-full border bg-background p-0.5 shadow-sm">
                        <Button variant={panelView === "invoice" ? "default" : "ghost"} size="sm" className="h-7 rounded-full text-xs px-3" onClick={() => { setPanelView("invoice"); }}>
                          Invoice
                        </Button>
                        <Button variant={panelView === "payment" ? "default" : "ghost"} size="sm" className="h-7 rounded-full text-xs px-3" onClick={() => { setPanelView("payment"); setActiveInvoiceId(null); }}>
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
                            <Input value={invoiceForm.invoice_number} onChange={e => setInvoiceForm({ ...invoiceForm, invoice_number: e.target.value })} placeholder="001" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Status</Label>
                            <Select value={invoiceForm.status} onValueChange={v => setInvoiceForm({ ...invoiceForm, status: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="DRAFT">DRAFT</SelectItem>
                                <SelectItem value="SENT">SENT</SelectItem>
                                <SelectItem value="PAID">PAID</SelectItem>
                                <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>Issue Date</Label>
                            <Input type="date" value={invoiceForm.issue_date} onChange={e => setInvoiceForm({ ...invoiceForm, issue_date: e.target.value })} />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Due Date</Label>
                            <Input type="date" value={invoiceForm.due_date} onChange={e => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })} />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label>Amount</Label>
                          <div className="flex gap-2">
                            <Input type="number" value={invoiceForm.amount} onChange={e => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} className="flex-1" />
                            <Select value={invoiceForm.currency} onValueChange={v => setInvoiceForm({ ...invoiceForm, currency: v })}>
                              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="MKD">MKD</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="USD">USD</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-1.5">
                          <Label>Client Name</Label>
                          <Input value={invoiceForm.client_name} onChange={e => setInvoiceForm({ ...invoiceForm, client_name: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Client Email</Label>
                          <Input type="email" value={invoiceForm.client_email} onChange={e => setInvoiceForm({ ...invoiceForm, client_email: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Client Address</Label>
                          <Input value={invoiceForm.client_address} onChange={e => setInvoiceForm({ ...invoiceForm, client_address: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Service Description</Label>
                          <Input value={invoiceForm.service_description} onChange={e => setInvoiceForm({ ...invoiceForm, service_description: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Line Items</Label>
                          <Textarea rows={2} value={invoiceForm.line_items} onChange={e => setInvoiceForm({ ...invoiceForm, line_items: e.target.value })} placeholder="Item 1 - 1000 MKD..." />
                        </div>

                        <Separator />

                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <Label className="cursor-pointer" htmlFor="reminders-toggle">Auto Reminders</Label>
                            <input id="reminders-toggle" type="checkbox" checked={invoiceForm.reminders_enabled === 1} onChange={e => setInvoiceForm({ ...invoiceForm, reminders_enabled: e.target.checked ? 1 : 0 })} className="h-4 w-4 rounded border-gray-300 text-primary" />
                          </div>
                          {invoiceForm.reminders_enabled === 1 && (
                            <div className="grid grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">First after (d)</Label>
                                <Input type="number" value={invoiceForm.reminder_first_after_days} onChange={e => setInvoiceForm({ ...invoiceForm, reminder_first_after_days: Number(e.target.value) })} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Repeat (d)</Label>
                                <Input type="number" value={invoiceForm.reminder_repeat_days} onChange={e => setInvoiceForm({ ...invoiceForm, reminder_repeat_days: Number(e.target.value) })} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Max count</Label>
                                <Input type="number" value={invoiceForm.reminder_max_count} onChange={e => setInvoiceForm({ ...invoiceForm, reminder_max_count: Number(e.target.value) })} />
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                      <CardFooter className="flex-col gap-2 border-t px-5 pt-4 pb-5">
                        <div className="flex w-full gap-2">
                          <Button variant="outline" className="flex-1" onClick={() => { setActiveInvoiceId(null); setInvoiceForm(f => ({ ...f, invoice_number: `INV-${Date.now().toString().slice(-4)}`, status: "DRAFT" })); }}>
                            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy to New
                          </Button>
                          <Button className="flex-1" onClick={handleSaveInvoice}>
                            <Save className="mr-1.5 h-3.5 w-3.5" /> {activeInvoiceId !== null ? "Update Invoice" : "Create Invoice"}
                          </Button>
                        </div>
                        <div className="flex w-full gap-2">
                          <Button variant="outline" className="flex-1" onClick={() => {
                            const invId = activeInvoiceId;
                            setCommType("invoice");
                            setCommSelectedInvoiceId(invId);
                            setLastSentEmail(null);
                            if (invId !== null) { setCommForm(prefillCommForm("invoice", invId)); setCommStep("compose"); } else { setCommStep("pick-invoice"); }
                            setActiveTab("communication");
                          }}>
                            <Send className="mr-1.5 h-3.5 w-3.5" /> Send Invoice
                          </Button>
                          <Button variant="outline" className="flex-1" onClick={() => {
                            const invId = activeInvoiceId;
                            setCommType("reminder");
                            setCommSelectedInvoiceId(invId);
                            setLastSentEmail(null);
                            if (invId !== null) { setCommForm(prefillCommForm("reminder", invId)); setCommStep("compose"); } else { setCommStep("pick-invoice"); }
                            setActiveTab("communication");
                          }}>
                            <Clock className="mr-1.5 h-3.5 w-3.5" /> Send Reminder
                          </Button>
                        </div>
                      </CardFooter>
                    </>
                  ) : (
                    <>
                      <CardContent className="space-y-4 pt-5 px-5 text-sm">
                        <div className="space-y-1.5">
                          <Label>Date</Label>
                          <Input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Amount</Label>
                          <div className="flex gap-2">
                            <Input type="number" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="flex-1" />
                            <Select value={paymentForm.currency} onValueChange={v => setPaymentForm({ ...paymentForm, currency: v })}>
                              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="MKD">MKD</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="USD">USD</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Note (Optional)</Label>
                          <Input placeholder="e.g. wire transfer, cash, check" value={paymentForm.note} onChange={e => setPaymentForm({ ...paymentForm, note: e.target.value })} />
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                          <div className="flex justify-between"><span>Contract sum</span><span className="font-medium text-foreground">{formatMoney(data.contract_sum, data.currency)}</span></div>
                          <div className="flex justify-between"><span>Paid so far</span><span className="font-medium text-emerald-600">{formatMoney(paidTotal, data.currency)}</span></div>
                          <Separator className="my-1" />
                          <div className="flex justify-between font-semibold"><span>Outstanding</span><span className="text-amber-600">{formatMoney(outstanding, data.currency)}</span></div>
                        </div>
                      </CardContent>
                      <CardFooter className="border-t px-5 pt-4 pb-5">
                        <Button className="w-full" onClick={handleLogPayment}>
                          <CheckCircle2 className="mr-2 h-4 w-4" /> Record Payment
                        </Button>
                      </CardFooter>
                    </>
                  )}
                  </>
                  )}
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ─── COMMUNICATION TAB ─── */}
          <TabsContent value="communication" className="outline-none">
            <div className="grid gap-6 lg:grid-cols-[1fr_400px]">

              {/* LEFT: Compose flow — 4 steps: pick-type / pick-invoice / compose / sent */}
              <Card className="overflow-hidden">

                {/* ── STEP: pick-type ── */}
                {commStep === "pick-type" && (
                  <>
                    <CardHeader className="border-b bg-muted/20 pb-4">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Mail className="h-4 w-4 text-primary" /> New Email
                      </CardTitle>
                      <CardDescription>Choose what you would like to send</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-8 pb-10">
                      <div className="grid grid-cols-3 gap-4">
                        <button
                          className="rounded-xl border-2 border-dashed p-5 text-left transition-all hover:border-sky-400 hover:bg-sky-50 group"
                          onClick={() => { setCommType("invoice"); setCommStep("pick-invoice"); }}
                        >
                          <FileCheck className="h-6 w-6 text-sky-500 mb-3" />
                          <p className="text-sm font-semibold">Invoice Email</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Send an invoice to the client</p>
                        </button>
                        <button
                          className="rounded-xl border-2 border-dashed p-5 text-left transition-all hover:border-amber-400 hover:bg-amber-50 group"
                          onClick={() => { setCommType("reminder"); setCommStep("pick-invoice"); }}
                        >
                          <AlertCircle className="h-6 w-6 text-amber-500 mb-3" />
                          <p className="text-sm font-semibold">Payment Reminder</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Remind client about an outstanding invoice</p>
                        </button>
                        <button
                          className="rounded-xl border-2 border-dashed p-5 text-left transition-all hover:border-primary hover:bg-primary/5 group"
                          onClick={() => { setCommType("general"); setCommSelectedInvoiceId(null); setCommForm(prefillCommForm("general", null)); setCommStep("compose"); }}
                        >
                          <Mail className="h-6 w-6 text-muted-foreground mb-3" />
                          <p className="text-sm font-semibold">General Email</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Any other message to the client</p>
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
                        <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => { setCommStep("pick-type"); setCommType(null); }}>
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            {commType === "reminder"
                              ? <><AlertCircle className="h-4 w-4 text-amber-500" /> Payment Reminder</>
                              : <><FileCheck className="h-4 w-4 text-sky-500" /> Invoice Email</>}
                          </CardTitle>
                          <CardDescription>Select the invoice this email is about</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-5 pb-6 space-y-3">
                      {data.invoices.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">No invoices found.</p>}
                      {data.invoices.map(inv => {
                        const isOverdue = inv.status !== "PAID" && inv.status !== "CANCELLED" && new Date(inv.due_date) < TODAY_MOCK;
                        return (
                          <button
                            key={inv.invoice_id}
                            className="w-full text-left rounded-xl border-2 border-transparent bg-muted/30 p-4 transition-all hover:border-primary hover:bg-primary/5"
                            onClick={() => { setCommSelectedInvoiceId(inv.invoice_id); setCommForm(prefillCommForm(commType!, inv.invoice_id)); setCommStep("compose"); }}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold">Invoice #{inv.invoice_number}</span>
                                  <StatusBadge status={inv.status} />
                                  {isOverdue && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Overdue</span>}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">{inv.service_description}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-semibold">{formatMoney(inv.amount, inv.currency)}</p>
                                <p className="text-[10px] text-muted-foreground">Due: {formatDate(inv.due_date)}</p>
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
                          onClick={() => { if (commType === "general") { setCommStep("pick-type"); setCommType(null); } else { setCommStep("pick-invoice"); setCommSelectedInvoiceId(null); } }}
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          {commType === "invoice" && <><FileCheck className="h-4 w-4 text-sky-500 shrink-0" /><span className="text-sm font-semibold">Invoice Email</span></>}
                          {commType === "reminder" && <><AlertCircle className="h-4 w-4 text-amber-500 shrink-0" /><span className="text-sm font-semibold">Payment Reminder</span></>}
                          {commType === "general" && <><Mail className="h-4 w-4 text-muted-foreground shrink-0" /><span className="text-sm font-semibold">General Email</span></>}
                          {commSelectedInvoiceId !== null && (() => {
                            const inv = data.invoices.find(i => i.invoice_id === commSelectedInvoiceId);
                            return inv ? <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground shrink-0">Re: Invoice #{inv.invoice_number}</span> : null;
                          })()}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5 pt-5">
                      <div className="space-y-2">
                        <Label>To</Label>
                        <Input value={commForm.to} onChange={e => setCommForm({ ...commForm, to: e.target.value })} placeholder="client@example.com" />
                        {data.remembered_recipients.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {data.remembered_recipients.map(em => (
                              <Badge key={em} variant="outline" className="cursor-pointer font-normal text-xs hover:bg-muted" onClick={() => setCommForm({ ...commForm, to: em })}>{em}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Subject</Label>
                        <Input value={commForm.subject} onChange={e => setCommForm({ ...commForm, subject: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Message Body</Label>
                        <Textarea rows={10} value={commForm.body} onChange={e => setCommForm({ ...commForm, body: e.target.value })} className="font-mono text-sm leading-relaxed" />
                      </div>
                    </CardContent>
                    <CardFooter className="justify-end gap-3 border-t bg-muted/10 py-4">
                      <Button variant="secondary" onClick={() => handleSendEmail(true)}>
                        <Play className="mr-2 h-4 w-4" /> Dry Run
                      </Button>
                      <Button onClick={() => handleSendEmail(false)}>
                        <Send className="mr-2 h-4 w-4" /> Send Now
                      </Button>
                    </CardFooter>
                  </>
                )}

                {/* ── STEP: sent ── */}
                {commStep === "sent" && lastSentEmail && (
                  <>
                    <CardHeader className="border-b bg-emerald-50 pb-4 pt-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                          <CardTitle className="text-base text-emerald-800">Email Sent</CardTitle>
                          <CardDescription className="text-emerald-600 text-xs">Successfully delivered</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-5 pb-2 space-y-3">
                      <div className="rounded-xl border bg-muted/20 p-4 space-y-2.5 text-sm">
                        <div className="flex gap-3"><span className="text-muted-foreground w-16 shrink-0">Type</span><span className="font-medium capitalize">{lastSentEmail.email_type}</span></div>
                        <div className="flex gap-3"><span className="text-muted-foreground w-16 shrink-0">To</span><span className="font-medium">{lastSentEmail.to_email}</span></div>
                        <div className="flex gap-3"><span className="text-muted-foreground w-16 shrink-0">Subject</span><span className="font-medium">{lastSentEmail.subject}</span></div>
                        {commSelectedInvoiceId !== null && (() => {
                          const inv = data.invoices.find(i => i.invoice_id === commSelectedInvoiceId);
                          return inv ? <div className="flex gap-3"><span className="text-muted-foreground w-16 shrink-0">Invoice</span><span className="font-medium">#{inv.invoice_number}</span></div> : null;
                        })()}
                        <div className="flex gap-3"><span className="text-muted-foreground w-16 shrink-0">Sent at</span><span className="font-medium">{formatDateTime(lastSentEmail.sent_at)}</span></div>
                      </div>
                    </CardContent>
                    <CardFooter className="gap-3 border-t bg-muted/10 py-4 mt-4">
                      <Button variant="outline" className="flex-1" onClick={() => { setCommStep("pick-type"); setCommType(null); setCommSelectedInvoiceId(null); setLastSentEmail(null); }}>
                        <Plus className="mr-2 h-4 w-4" /> New Email
                      </Button>
                      <Button className="flex-1" onClick={() => {
                        if (commSelectedInvoiceId !== null) { setCommStep("compose"); } else { setCommStep("pick-type"); setCommType(null); }
                        setLastSentEmail(null);
                      }}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Send Another
                      </Button>
                    </CardFooter>
                  </>
                )}
              </Card>

              {/* RIGHT: Email history — inline accordion */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold tracking-tight text-muted-foreground uppercase">Email History ({data.email_log.length})</h4>
                <div className="space-y-2">
                  {[...data.email_log].reverse().map(log => {
                    const isExpanded = expandedLogId === log.log_id;
                    return (
                      <div key={log.log_id}>
                        <button
                          className={`w-full text-left rounded-lg border p-3 transition-all hover:border-primary/40 hover:shadow-sm ${isExpanded ? "rounded-b-none border-b-0 bg-primary/5 border-primary/30" : "bg-card"}`}
                          onClick={() => setExpandedLogId(isExpanded ? null : log.log_id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {log.email_type === "reminder" ? <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" /> : log.email_type === "invoice" ? <FileCheck className="h-4 w-4 shrink-0 text-sky-500" /> : <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />}
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{log.subject}</p>
                                <p className="text-xs text-muted-foreground truncate">To: {log.to_email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDateTime(log.sent_at)}</span>
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                            </div>
                          </div>
                          <div className="mt-1.5">
                            <Badge variant={log.email_type === "reminder" ? "secondary" : "outline"} className="text-[10px] font-bold uppercase">{log.email_type}</Badge>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="rounded-b-lg border border-t-0 border-primary/30 bg-primary/5 px-4 pt-3 pb-4">
                            <div className="space-y-1 text-xs text-muted-foreground mb-3 pb-3 border-b border-primary/10">
                              <div><span className="font-medium text-foreground">To:</span> {log.to_email}</div>
                              <div><span className="font-medium text-foreground">Sent:</span> {formatDateTime(log.sent_at)}</div>
                            </div>
                            <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground leading-relaxed">{log.body_preview || "(No body recorded)"}</pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {data.email_log.length === 0 && (
                    <div className="rounded-lg border border-dashed p-6 text-center">
                      <p className="text-sm text-muted-foreground">No emails sent yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ─── CONTRACT PROFILE TAB ─── */}
          <TabsContent value="contract" className="outline-none">
            <div className="space-y-6">
              {/* Contract Details + Client Info side by side — Contract first */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* LEFT: Contract Details (first / most important) */}
                <Card>
                  <CardHeader className="border-b">
                    <CardTitle className="text-base">Contract Details</CardTitle>
                    <CardDescription>Financial and operational parameters for this case.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Contract Sum</Label>
                      <div className="flex gap-2">
                        <Input type="number" defaultValue={data.contract_sum} className="flex-1" />
                        <Select defaultValue={data.currency}>
                          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MKD">MKD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Case / Service Type</Label>
                      <Input defaultValue={data.request_type} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Notes</Label>
                      <Textarea defaultValue={data.notes} className="resize-none" rows={4} />
                    </div>
                  </CardContent>
                  <CardFooter className="justify-end gap-2 border-t py-4">
                    <Button variant="outline">Reset</Button>
                    <Button onClick={() => toast({ title: "Saved", description: "Contract details updated." })}>Save Changes</Button>
                  </CardFooter>
                </Card>

                {/* RIGHT: Client Information */}
                <Card>
                  <CardHeader className="border-b">
                    <CardTitle className="text-base">Client Information</CardTitle>
                    <CardDescription>Details used for invoice generation and communication.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Name / Last name</Label>
                      <Input defaultValue={data.custom_fields["Name / Last name"] ?? data.client_name} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Company</Label>
                      <Input defaultValue={data.custom_fields["company"] ?? ""} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Phone</Label>
                      <Input defaultValue={data.client_phone} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Primary Email</Label>
                      <Input type="email" defaultValue={data.custom_fields["email"] ?? ""} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Alternative Emails</Label>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(data.custom_fields["alternate_emails"] ?? "").split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).map(em => (
                          <Badge key={em} variant="outline" className="font-normal text-sm px-3 py-1 gap-2">
                            {em}
                            <button className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                          </Badge>
                        ))}
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          <Plus className="mr-1 h-3 w-3" /> Add Email
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Address</Label>
                      <Input defaultValue={data.custom_fields["address"] ?? ""} />
                    </div>
                  </CardContent>
                  <CardFooter className="justify-end gap-2 border-t py-4">
                    <Button variant="outline">Reset</Button>
                    <Button onClick={() => toast({ title: "Saved", description: "Client information updated." })}>Save Changes</Button>
                  </CardFooter>
                </Card>
              </div>

              {/* Case Summary — full width below */}
              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" /> Case Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-5">
                  <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm sm:grid-cols-4">
                    {[
                      { label: "Case ID", value: data.case_id },
                      { label: "Request Type", value: data.request_type },
                      { label: "Status", value: data.status },
                      { label: "Currency", value: data.currency },
                      { label: "Invoices", value: `${data.invoices.length} issued` },
                      { label: "Payments", value: `${data.payments.length} logged` },
                      { label: "Emails Sent", value: `${data.email_log.length} total` },
                      { label: "Outstanding", value: formatMoney(outstanding, data.currency) },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-muted-foreground mb-0.5 text-xs">{label}</p>
                        <p className="font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
      </div>
      </Tabs>
    </AppShell>
  );
}
