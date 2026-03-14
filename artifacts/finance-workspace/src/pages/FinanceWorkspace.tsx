import React, { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StatPill } from "@/components/finance/StatPill";
import { StatusBadge, StatusVariant } from "@/components/finance/StatusBadge";
import {
  AlertTriangle, RefreshCw, CheckCircle2, ArrowRight, Wallet,
  FileText, Mail, Clock, Trash2, Plus, Send, Copy, AlertCircle,
  CreditCard, Play, FileCheck, Save, ChevronDown, ChevronRight, X, Building2
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
  finance_status: "YELLOW",
  status: "IN_PROGRESS",
  contract_sum: 100000,
  currency: "MKD",
  finance_date: "2026-02-01",
  due_date: "2026-04-30",
  client_name: "Marija Dimovska",
  client_company: "Dimovska Consulting d.o.o.",
  client_phone: "+38970123456",
  client_address: "Partizanska 15, 1000 Skopje",
  case_email: "dimovski.niko@gmail.com",
  alt_emails: ["dimovski.niko@outlook.com"],
  notes: "Client prefers email contact. Partial payment already received.",
  payments: [
    { id: 1, date: "2026-03-11", amount: 20000, currency: "MKD", note: "down payment" },
    { id: 2, date: "2026-03-12", amount: 40000, currency: "MKD", note: "second installment" },
  ],
  invoices: [
    { id: 1, number: "001", status: "PAID", issue_date: "2026-02-15", due_date: "2026-03-01", amount: 60000, currency: "MKD", client_name: "Marija Dimovska", client_email: "dimovski.niko@gmail.com", service_description: "Urbanistički Projekt - faza 1", reminders_enabled: true, reminder_first_after_days: 3, reminder_repeat_days: 7, reminder_max_count: 3, reminder_sent_count: 0 },
    { id: 2, number: "002", status: "SENT", issue_date: "2026-03-10", due_date: "2026-03-20", amount: 40000, currency: "MKD", client_name: "Marija Dimovska", client_email: "dimovski.niko@outlook.com", service_description: "Urbanistički Projekt - faza 2", reminders_enabled: true, reminder_first_after_days: 3, reminder_repeat_days: 7, reminder_max_count: 3, reminder_sent_count: 2 },
  ],
  email_log: [
    { id: 1, type: "invoice", to: "dimovski.niko@gmail.com", subject: "Invoice 001 for case 76989", sent_at: "2026-02-15T11:00:00", body: "Dear Marija,\n\nPlease find attached Invoice 001 for case 76989.\nAmount: 60,000.00 MKD\nDue: 01 Mar 2026\n\nThank you for your business.\n\nBest regards,\neurbanizam team" },
    { id: 2, type: "invoice", to: "dimovski.niko@outlook.com", subject: "Invoice 002 for case 76989", sent_at: "2026-03-12T23:29:00", body: "Dear Marija,\n\nPlease find attached Invoice 002 for case 76989.\nAmount: 40,000.00 MKD\nDue: 20 Mar 2026\n\nThank you for your business.\n\nBest regards,\neurbanizam team" },
    { id: 3, type: "reminder", to: "dimovski.niko@outlook.com", subject: "Payment reminder for invoice 002", sent_at: "2026-03-12T23:31:00", body: "Dear Marija,\n\nThis is a friendly reminder that Invoice 002 (40,000.00 MKD) is due on 20 Mar 2026.\n\nPlease arrange payment at your earliest convenience.\n\nBest regards,\neurbanizam team" },
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

type EmailLog = typeof MOCK_DATA.email_log[number];

export default function FinanceWorkspace() {
  const { toast } = useToast();
  const [data, setData] = useState(MOCK_DATA);
  const [activeTab, setActiveTab] = useState("invoices");

  // Invoice/payment draft panel
  const [draftType, setDraftType] = useState<"invoice" | "payment">("invoice");
  const [activeInvoiceId, setActiveInvoiceId] = useState<number | null>(null);
  const [selectedEmailLog, setSelectedEmailLog] = useState<EmailLog | null>(null);

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
    data.invoices.forEach(inv => items.push({ type: "invoice", date: inv.issue_date, sortKey: inv.issue_date, id: `inv-${inv.id}`, payload: inv }));
    data.payments.forEach(p => items.push({ type: "payment", date: p.date, sortKey: p.date, id: `pay-${p.id}`, payload: p }));
    data.email_log.forEach(log => items.push({ type: "email", date: log.sent_at, sortKey: log.sent_at, id: `email-${log.id}`, payload: log }));
    return items.sort((a, b) => new Date(b.sortKey).getTime() - new Date(a.sortKey).getTime());
  }, [data]);

  // Forms
  const [paymentForm, setPaymentForm] = useState({ date: TODAY_MOCK.toISOString().split("T")[0], amount: outstanding > 0 ? outstanding.toString() : "", currency: data.currency, note: "" });
  const [invoiceForm, setInvoiceForm] = useState({
    number: "", status: "DRAFT", issue_date: TODAY_MOCK.toISOString().split("T")[0], due_date: "",
    amount: outstanding > 0 ? outstanding.toString() : "", currency: data.currency,
    client_name: data.client_name, client_email: data.case_email || "", client_address: data.client_address || "",
    service_description: data.request_type, line_items: "",
    reminders_enabled: true, reminder_first_after_days: 3, reminder_repeat_days: 7, reminder_max_count: 3,
  });
  const [commForm, setCommForm] = useState({
    mode: "invoice" as "invoice" | "reminder",
    to: data.case_email || "",
    subject: `Invoice for case ${data.case_id}`,
    body: `Dear ${data.client_name},\n\nPlease find the details for case ${data.case_id}.\n\nBest regards,\neurbanizam team`,
  });

  // Handlers
  const handleLogPayment = () => {
    if (!paymentForm.amount || !paymentForm.date) { toast({ title: "Error", description: "Date and amount are required", variant: "destructive" }); return; }
    const newPayment = { id: Date.now(), date: paymentForm.date, amount: parseFloat(paymentForm.amount), currency: paymentForm.currency, note: paymentForm.note };
    setData(prev => ({ ...prev, payments: [...prev.payments, newPayment] }));
    toast({ title: "Payment recorded" });
    setPaymentForm(prev => ({ ...prev, amount: "", note: "" }));
  };

  const handleDeletePayment = (id: number) => {
    setData(prev => ({ ...prev, payments: prev.payments.filter(p => p.id !== id) }));
    toast({ title: "Payment deleted" });
  };

  const handleSaveInvoice = () => {
    if (!invoiceForm.number || !invoiceForm.amount) { toast({ title: "Error", description: "Invoice number and amount are required", variant: "destructive" }); return; }
    const newInvoice = { id: Date.now(), number: invoiceForm.number, status: invoiceForm.status, issue_date: invoiceForm.issue_date, due_date: invoiceForm.due_date, amount: parseFloat(invoiceForm.amount), currency: invoiceForm.currency, client_name: invoiceForm.client_name, client_email: invoiceForm.client_email, service_description: invoiceForm.service_description, reminders_enabled: invoiceForm.reminders_enabled, reminder_first_after_days: invoiceForm.reminder_first_after_days, reminder_repeat_days: invoiceForm.reminder_repeat_days, reminder_max_count: invoiceForm.reminder_max_count, reminder_sent_count: 0 };
    setData(prev => ({ ...prev, invoices: [...prev.invoices, newInvoice] }));
    toast({ title: "Invoice saved", description: `Invoice ${invoiceForm.number} created.` });
    setActiveInvoiceId(newInvoice.id);
  };

  const handleSendEmail = (isDryRun: boolean = false) => {
    if (!commForm.to) { toast({ title: "Error", description: "Recipient email is required", variant: "destructive" }); return; }
    if (isDryRun) { toast({ title: "Dry run successful", description: "Email looks good and is ready to send." }); return; }
    const newLog = { id: Date.now(), type: commForm.mode, to: commForm.to, subject: commForm.subject, sent_at: new Date().toISOString(), body: commForm.body };
    setData(prev => ({ ...prev, email_log: [...prev.email_log, newLog] }));
    toast({ title: "Email sent", description: `Successfully sent to ${commForm.to}` });
  };

  const loadInvoiceIntoForm = (inv: typeof MOCK_DATA.invoices[number]) => {
    setDraftType("invoice");
    setActiveInvoiceId(inv.id);
    setInvoiceForm({ number: inv.number, status: inv.status, issue_date: inv.issue_date, due_date: inv.due_date, amount: inv.amount.toString(), currency: inv.currency, client_name: inv.client_name, client_email: inv.client_email, client_address: data.client_address || "", service_description: inv.service_description, line_items: "", reminders_enabled: inv.reminders_enabled, reminder_first_after_days: inv.reminder_first_after_days, reminder_repeat_days: inv.reminder_repeat_days, reminder_max_count: inv.reminder_max_count });
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
              <StatusBadge status={data.finance_status as StatusVariant} className="shrink-0" />
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
                    <Button size="sm" variant="outline" onClick={() => { setDraftType("payment"); setActiveInvoiceId(null); }}>
                      <CreditCard className="mr-1.5 h-3.5 w-3.5" /> New Payment
                    </Button>
                    <Button size="sm" onClick={() => { setDraftType("invoice"); setActiveInvoiceId(null); setInvoiceForm(f => ({ ...f, number: `INV-${Date.now().toString().slice(-4)}` })); }}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> New Invoice
                    </Button>
                  </div>
                </div>

                {unifiedTimeline.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-10 text-center">
                    <p className="text-sm text-muted-foreground">No activity yet. Create an invoice or log a payment.</p>
                  </div>
                ) : (
                  <div className="relative border-l-2 border-muted ml-4 space-y-1 pb-4">
                    {unifiedTimeline.map((item) => {
                      if (item.type === "invoice") {
                        const inv = item.payload as typeof MOCK_DATA.invoices[number];
                        const isOverdue = inv.status !== "PAID" && inv.status !== "CANCELLED" && new Date(inv.due_date) < TODAY_MOCK;
                        const isActive = activeInvoiceId === inv.id;
                        return (
                          <div key={item.id} className="relative pl-8">
                            <div className={`absolute -left-[13px] top-3 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background ${inv.status === "PAID" ? "bg-emerald-100 text-emerald-600" : isOverdue ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"}`}>
                              <FileText className="h-3 w-3" />
                            </div>
                            <button
                              className={`w-full text-left rounded-lg border p-3 transition-all hover:border-primary/50 hover:shadow-sm ${isActive ? "ring-2 ring-primary border-transparent bg-primary/5" : "bg-card"}`}
                              onClick={() => loadInvoiceIntoForm(inv)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">{formatDate(inv.issue_date)}</span>
                                  <span className="text-xs font-bold uppercase text-muted-foreground">Invoice</span>
                                  <Badge variant="outline" className="font-mono text-xs">#{inv.number}</Badge>
                                  <StatusBadge status={inv.status} />
                                  {isOverdue && <Badge variant="destructive" className="text-[10px]">OVERDUE</Badge>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm">{formatMoney(inv.amount, inv.currency)}</span>
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </div>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{inv.service_description} · Due {formatDate(inv.due_date)}</p>
                            </button>
                          </div>
                        );
                      }

                      if (item.type === "payment") {
                        const p = item.payload as typeof MOCK_DATA.payments[number];
                        return (
                          <div key={item.id} className="relative pl-8">
                            <div className="absolute -left-[13px] top-3 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-emerald-100 text-emerald-600">
                              <CreditCard className="h-3 w-3" />
                            </div>
                            <div className="rounded-lg border bg-card p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">{formatDate(p.date)}</span>
                                  <span className="text-xs font-bold uppercase text-emerald-700">Payment Received</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-emerald-600">+{formatMoney(p.amount, p.currency)}</span>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDeletePayment(p.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                              {p.note && <p className="mt-1 text-xs text-muted-foreground">{p.note}</p>}
                            </div>
                          </div>
                        );
                      }

                      if (item.type === "email") {
                        const log = item.payload as EmailLog;
                        return (
                          <div key={item.id} className="relative pl-8">
                            <div className={`absolute -left-[13px] top-3 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background ${log.type === "reminder" ? "bg-amber-100 text-amber-600" : "bg-sky-100 text-sky-600"}`}>
                              <Mail className="h-3 w-3" />
                            </div>
                            <div className="rounded-lg border bg-card/60 p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">{formatDateTime(log.sent_at)}</span>
                                  <span className={`text-xs font-bold uppercase ${log.type === "reminder" ? "text-amber-700" : "text-sky-700"}`}>{log.type === "reminder" ? "Reminder Sent" : "Invoice Email Sent"}</span>
                                </div>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">To: {log.to}</p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>

              {/* RIGHT: Draft / Edit panel — Invoice or Payment toggle */}
              <div className="space-y-0">
                <Card className="sticky top-[140px]">
                  <CardHeader className="border-b bg-muted/20 pb-3 pt-4 px-5">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">
                        {activeInvoiceId ? "Edit Entry" : "Draft New"}
                      </CardTitle>
                      <div className="flex items-center gap-1 rounded-full border bg-background p-0.5 shadow-sm">
                        <Button variant={draftType === "invoice" ? "default" : "ghost"} size="sm" className="h-7 rounded-full text-xs px-3" onClick={() => setDraftType("invoice")}>
                          Invoice
                        </Button>
                        <Button variant={draftType === "payment" ? "default" : "ghost"} size="sm" className="h-7 rounded-full text-xs px-3" onClick={() => setDraftType("payment")}>
                          Payment
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {draftType === "invoice" ? (
                    <>
                      <CardContent className="space-y-4 pt-5 px-5 text-sm">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>Invoice Number</Label>
                            <Input value={invoiceForm.number} onChange={e => setInvoiceForm({ ...invoiceForm, number: e.target.value })} placeholder="001" />
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
                            <input id="reminders-toggle" type="checkbox" checked={invoiceForm.reminders_enabled} onChange={e => setInvoiceForm({ ...invoiceForm, reminders_enabled: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-primary" />
                          </div>
                          {invoiceForm.reminders_enabled && (
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
                          <Button variant="outline" className="flex-1" onClick={() => setInvoiceForm({ ...invoiceForm, number: `INV-${Date.now().toString().slice(-4)}` })}>
                            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy to New
                          </Button>
                          <Button className="flex-1" onClick={handleSaveInvoice}>
                            <Save className="mr-1.5 h-3.5 w-3.5" /> Save Invoice
                          </Button>
                        </div>
                        <div className="flex w-full gap-2">
                          <Button variant="outline" className="flex-1" onClick={() => { setActiveTab("communication"); setCommForm({ ...commForm, mode: "invoice" }); }}>
                            <Send className="mr-1.5 h-3.5 w-3.5" /> Send Invoice
                          </Button>
                          <Button variant="outline" className="flex-1" onClick={() => { setActiveTab("communication"); setCommForm({ ...commForm, mode: "reminder" }); }}>
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
                          <Input type="date" value={paymentForm.date} onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })} />
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
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ─── COMMUNICATION TAB ─── */}
          <TabsContent value="communication" className="outline-none">
            <div className="grid gap-6 lg:grid-cols-[1fr_400px]">

              {/* LEFT: Compose */}
              <Card>
                <CardHeader className="border-b bg-muted/20 pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" /> Compose Email
                    </CardTitle>
                    <div className="flex items-center gap-1 rounded-full border bg-background p-0.5 shadow-sm">
                      <Button variant={commForm.mode === "invoice" ? "default" : "ghost"} size="sm" className="h-7 rounded-full text-xs px-3" onClick={() => setCommForm({ ...commForm, mode: "invoice" })}>
                        Invoice
                      </Button>
                      <Button variant={commForm.mode === "reminder" ? "default" : "ghost"} size="sm" className="h-7 rounded-full text-xs px-3" onClick={() => setCommForm({ ...commForm, mode: "reminder" })}>
                        Reminder
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <div className="space-y-2">
                    <Label>To</Label>
                    <Input value={commForm.to} onChange={e => setCommForm({ ...commForm, to: e.target.value })} placeholder="client@example.com" />
                    {data.remembered_recipients.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {data.remembered_recipients.map(em => (
                          <Badge key={em} variant="outline" className="cursor-pointer font-normal text-xs hover:bg-muted" onClick={() => setCommForm({ ...commForm, to: em })}>
                            {em}
                          </Badge>
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
              </Card>

              {/* RIGHT: Email history with expandable detail */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold tracking-tight text-muted-foreground uppercase">Email History ({data.email_log.length})</h4>

                {selectedEmailLog && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardHeader className="pb-3 pt-4 px-4 border-b">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            {selectedEmailLog.type === "reminder" ? <AlertCircle className="h-4 w-4 text-amber-500" /> : <FileCheck className="h-4 w-4 text-blue-500" />}
                            <span className="text-xs font-bold uppercase text-muted-foreground">{selectedEmailLog.type}</span>
                          </div>
                          <p className="text-sm font-semibold">{selectedEmailLog.subject}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" onClick={() => setSelectedEmailLog(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <div><span className="font-medium text-foreground">To:</span> {selectedEmailLog.to}</div>
                        <div><span className="font-medium text-foreground">Sent:</span> {formatDateTime(selectedEmailLog.sent_at)}</div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pt-4 pb-4">
                      <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground leading-relaxed">{selectedEmailLog.body || "(No body recorded)"}</pre>
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-2">
                  {[...data.email_log].reverse().map(log => (
                    <button
                      key={log.id}
                      className={`w-full text-left rounded-lg border p-3 transition-all hover:border-primary/40 hover:shadow-sm ${selectedEmailLog?.id === log.id ? "ring-2 ring-primary border-transparent bg-primary/5" : "bg-card"}`}
                      onClick={() => setSelectedEmailLog(selectedEmailLog?.id === log.id ? null : log)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {log.type === "reminder" ? <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" /> : <FileCheck className="h-4 w-4 shrink-0 text-blue-500" />}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{log.subject}</p>
                            <p className="text-xs text-muted-foreground truncate">To: {log.to}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDateTime(log.sent_at)}</span>
                          {selectedEmailLog?.id === log.id ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        </div>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Badge variant={log.type === "reminder" ? "secondary" : "outline"} className="text-[10px] font-bold uppercase">
                          {log.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Click to view full message</span>
                      </div>
                    </button>
                  ))}
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
                    <div className="space-y-1.5">
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
                    <div className="space-y-1.5">
                      <Label>Finance Status</Label>
                      <Select defaultValue={data.finance_status}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GRAY">GRAY</SelectItem>
                          <SelectItem value="YELLOW">YELLOW</SelectItem>
                          <SelectItem value="GREEN">GREEN</SelectItem>
                          <SelectItem value="RED">RED</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Finance Date</Label>
                      <Input type="date" defaultValue={data.finance_date} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Payment Due Date</Label>
                      <Input type="date" defaultValue={data.due_date} />
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
                      <Label>Client Name</Label>
                      <Input defaultValue={data.client_name} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Company</Label>
                      <Input defaultValue={data.client_company} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Phone</Label>
                      <Input defaultValue={data.client_phone} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Primary Email</Label>
                      <Input type="email" defaultValue={data.case_email} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Alternative Emails</Label>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {data.alt_emails.map(em => (
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
                      <Input defaultValue={data.client_address} />
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
                      { label: "Finance Date", value: formatDate(data.finance_date) },
                      { label: "Due Date", value: formatDate(data.due_date) },
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
