import React, { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StatPill } from "@/components/finance/StatPill";
import { StatusBadge, StatusVariant } from "@/components/finance/StatusBadge";
import { 
  AlertTriangle, RefreshCw, CheckCircle2, Info, ArrowRight, Wallet, 
  FileText, Mail, Clock, Trash2, Plus, Send, Copy, AlertCircle, Phone, 
  User, CreditCard, Play, FileCheck, CircleUser, Save
} from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// MOCK DATA
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
  client_phone: "+38970123456",
  notes: "Client prefers email contact. Partial payment already received.",
  payments: [
    { id: 1, date: "2026-03-11", amount: 20000, currency: "MKD", note: "down payment" },
    { id: 2, date: "2026-03-12", amount: 40000, currency: "MKD", note: "second installment" }
  ],
  invoices: [
    { id: 1, number: "001", status: "PAID", issue_date: "2026-02-15", due_date: "2026-03-01", amount: 60000, currency: "MKD", client_name: "Marija Dimovska", client_email: "dimovski.niko@gmail.com", service_description: "Urbanistički Projekt - faza 1", reminders_enabled: true, reminder_first_after_days: 3, reminder_repeat_days: 7, reminder_max_count: 3, reminder_sent_count: 0 },
    { id: 2, number: "002", status: "SENT", issue_date: "2026-03-10", due_date: "2026-03-20", amount: 40000, currency: "MKD", client_name: "Marija Dimovska", client_email: "dimovski.niko@outlook.com", service_description: "Urbanistički Projekt - faza 2", reminders_enabled: true, reminder_first_after_days: 3, reminder_repeat_days: 7, reminder_max_count: 3, reminder_sent_count: 2 }
  ],
  email_log: [
    { id: 1, type: "invoice", to: "dimovski.niko@gmail.com", subject: "Invoice 001 for case 76989", sent_at: "2026-02-15T11:00:00" },
    { id: 2, type: "invoice", to: "dimovski.niko@outlook.com", subject: "Invoice 002 for case 76989", sent_at: "2026-03-12T23:29:00" },
    { id: 3, type: "reminder", to: "dimovski.niko@outlook.com", subject: "Payment reminder for invoice 002", sent_at: "2026-03-12T23:31:00" }
  ],
  remembered_recipients: ["dimovski.niko@outlook.com", "dimovski.niko@gmail.com"],
  case_email: "dimovski.niko@gmail.com",
  settings: {
    smtp_from_email: null,
    company_email: null
  }
};

const TODAY_MOCK = new Date("2026-03-21"); // Mocking today to be after invoice 002 due date to show overdue

function formatMoney(value: number, currency: string = "MKD") {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
}

function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function FinanceWorkspace() {
  const { toast } = useToast();
  const [data, setData] = useState(MOCK_DATA);
  const [activeTab, setActiveTab] = useState("overview");
  const [activeInvoiceId, setActiveInvoiceId] = useState<number | null>(null);

  // Computed totals
  const paidTotal = data.payments.reduce((acc, p) => acc + p.amount, 0);
  const invoicedTotal = data.invoices.reduce((acc, i) => acc + i.amount, 0);
  const outstanding = data.contract_sum - paidTotal;

  const overdueInvoices = data.invoices.filter(
    (inv) => inv.status !== "PAID" && inv.status !== "CANCELLED" && new Date(inv.due_date) < TODAY_MOCK
  );

  const activeInvoice = useMemo(() => data.invoices.find(i => i.id === activeInvoiceId) || data.invoices[data.invoices.length - 1], [data.invoices, activeInvoiceId]);

  // Recommendation logic
  const recommendation = useMemo(() => {
    if (overdueInvoices.length > 0) {
      return {
        title: "Follow up on overdue money",
        description: `${overdueInvoices.length} invoice(s) are overdue. Queue a reminder while the payment context is fresh.`,
        tab: "communication",
        tone: "warning",
        icon: AlertTriangle,
      };
    }
    if (outstanding > 0 && data.invoices.length === 0) {
      return {
        title: "Create the first invoice",
        description: "There is contract value tracked here, but no invoice exists yet.",
        tab: "invoices",
        tone: "default",
        icon: Plus,
      };
    }
    if (outstanding > 0 && data.payments.length === 0) {
      return {
        title: "Capture payment progress",
        description: "Outstanding balance is still open and no payments have been logged.",
        tab: "payments",
        tone: "default",
        icon: Wallet,
      };
    }
    if (!data.case_email) {
      return {
        title: "Store a reusable contact email",
        description: "Save the client email once so invoice and reminder drafts stop asking for it.",
        tab: "overview",
        tone: "warning",
        icon: AlertCircle,
      };
    }
    if (data.contract_sum > 0 && outstanding <= 0) {
      return {
        title: "Case is financially settled",
        description: "Everything due on this case appears collected. Keep the activity trail clean and up to date.",
        tab: "activity",
        tone: "success",
        icon: CheckCircle2,
      };
    }
    return null;
  }, [overdueInvoices, outstanding, data]);

  // Forms states
  const [paymentForm, setPaymentForm] = useState({
    date: TODAY_MOCK.toISOString().split("T")[0],
    amount: outstanding > 0 ? outstanding.toString() : "",
    currency: data.currency,
    note: ""
  });

  const [invoiceForm, setInvoiceForm] = useState({
    number: "",
    status: "DRAFT",
    issue_date: TODAY_MOCK.toISOString().split("T")[0],
    due_date: "",
    amount: outstanding > 0 ? outstanding.toString() : "",
    currency: data.currency,
    client_name: data.client_name,
    client_email: data.case_email || "",
    client_address: "",
    service_description: data.request_type,
    line_items: "",
    reminders_enabled: true,
    reminder_first_after_days: 3,
    reminder_repeat_days: 7,
    reminder_max_count: 3,
  });

  const [commForm, setCommForm] = useState({
    mode: "invoice" as "invoice" | "reminder",
    to: activeInvoice?.client_email || data.case_email || "",
    subject: `Invoice ${activeInvoice?.number} for case ${data.case_id}`,
    body: `Please find attached invoice ${activeInvoice?.number} for case ${data.case_id}.\nAmount: ${activeInvoice?.amount} ${activeInvoice?.currency}`
  });

  // Handlers
  const handleLogPayment = () => {
    if (!paymentForm.amount || !paymentForm.date) {
      toast({ title: "Error", description: "Date and amount are required", variant: "destructive" });
      return;
    }
    const newPayment = {
      id: Date.now(),
      date: paymentForm.date,
      amount: parseFloat(paymentForm.amount),
      currency: paymentForm.currency,
      note: paymentForm.note
    };
    setData(prev => ({
      ...prev,
      payments: [...prev.payments, newPayment]
    }));
    toast({ title: "Payment recorded", description: "The payment has been successfully added." });
    setPaymentForm(prev => ({ ...prev, amount: "", note: "" }));
  };

  const handleDeletePayment = (id: number) => {
    setData(prev => ({
      ...prev,
      payments: prev.payments.filter(p => p.id !== id)
    }));
    toast({ title: "Payment deleted" });
  };

  const handleSaveInvoice = () => {
    if (!invoiceForm.number || !invoiceForm.amount) {
      toast({ title: "Error", description: "Invoice number and amount are required", variant: "destructive" });
      return;
    }
    const newInvoice = {
      id: Date.now(),
      number: invoiceForm.number,
      status: invoiceForm.status,
      issue_date: invoiceForm.issue_date,
      due_date: invoiceForm.due_date,
      amount: parseFloat(invoiceForm.amount),
      currency: invoiceForm.currency,
      client_name: invoiceForm.client_name,
      client_email: invoiceForm.client_email,
      service_description: invoiceForm.service_description,
      reminders_enabled: true,
      reminder_first_after_days: 3,
      reminder_repeat_days: 7,
      reminder_max_count: 3,
      reminder_sent_count: 0
    };
    setData(prev => ({
      ...prev,
      invoices: [...prev.invoices, newInvoice]
    }));
    toast({ title: "Invoice saved", description: `Invoice ${invoiceForm.number} created.` });
    setActiveInvoiceId(newInvoice.id);
  };

  const handleSendEmail = (isDryRun: boolean = false) => {
    if (!commForm.to) {
      toast({ title: "Error", description: "Recipient email is required", variant: "destructive" });
      return;
    }
    if (isDryRun) {
      toast({ title: "Dry run successful", description: "Email looks good and is ready to send." });
      return;
    }
    const newLog = {
      id: Date.now(),
      type: commForm.mode,
      to: commForm.to,
      subject: commForm.subject,
      sent_at: new Date().toISOString()
    };
    setData(prev => ({
      ...prev,
      email_log: [...prev.email_log, newLog]
    }));
    toast({ title: "Email sent", description: `Successfully sent to ${commForm.to}` });
  };


  return (
    <AppShell>
      {/* COMMAND BAR */}
      <div className="sticky top-12 z-10 flex flex-col gap-3 border-b bg-background px-6 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{data.title}</h1>
            <Badge variant="outline" className="font-mono">{data.case_id}</Badge>
            <Badge variant="secondary">{data.request_type}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Finance Status:</span>
            <StatusBadge status={data.finance_status as StatusVariant} />
          </div>
        </div>

        <div className="flex items-center gap-6 rounded-lg border bg-card px-4 py-2 shadow-xs">
          <StatPill label="Contract" value={formatMoney(data.contract_sum, data.currency)} />
          <Separator orientation="vertical" className="h-8" />
          <StatPill label="Invoiced" value={formatMoney(invoicedTotal, data.currency)} />
          <Separator orientation="vertical" className="h-8" />
          <StatPill label="Paid" value={<span className="text-emerald-600">{formatMoney(paidTotal, data.currency)}</span>} />
          <Separator orientation="vertical" className="h-8" />
          <StatPill label="Outstanding" value={<span className="text-amber-600">{formatMoney(outstanding, data.currency)}</span>} />
        </div>

        <div className="flex items-center gap-3 hidden md:flex">
          <span className="text-xs text-muted-foreground">Updated 2m ago</span>
          <Button variant="outline" size="icon" className="h-8 w-8 text-muted-foreground">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ACTION BANNER */}
      {recommendation && (
        <div className="px-6 py-2">
          <div className={`flex items-center justify-between rounded-lg border px-4 py-3 shadow-xs ${
            recommendation.tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' :
            recommendation.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' :
            'border-blue-200 bg-blue-50 text-blue-900'
          }`}>
            <div className="flex items-center gap-3">
              <recommendation.icon className={`h-5 w-5 ${
                recommendation.tone === 'warning' ? 'text-amber-600' :
                recommendation.tone === 'success' ? 'text-emerald-600' : 'text-blue-600'
              }`} />
              <div>
                <h4 className="font-semibold text-sm">{recommendation.title}</h4>
                <p className="text-xs opacity-90">{recommendation.description}</p>
              </div>
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setActiveTab(recommendation.tab)}
              className={`bg-white/50 border-current/20 hover:bg-white/80`}
            >
              Take action <ArrowRight className="ml-2 h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <div className="flex flex-col gap-6 px-6 pb-12 lg:flex-row">
        {/* LEFT COLUMN: TABS */}
        <div className="flex-1 lg:w-[62%] max-w-4xl">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-6 flex w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0">
              <TabsTrigger value="overview" className="relative h-10 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none">
                <FileText className="mr-2 h-4 w-4" /> Overview
              </TabsTrigger>
              <TabsTrigger value="payments" className="relative h-10 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none">
                <Wallet className="mr-2 h-4 w-4" /> Money
              </TabsTrigger>
              <TabsTrigger value="invoices" className="relative h-10 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none">
                <FileCheck className="mr-2 h-4 w-4" /> Invoices
              </TabsTrigger>
              <TabsTrigger value="communication" className="relative h-10 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none">
                <Mail className="mr-2 h-4 w-4" /> Communication
              </TabsTrigger>
              <TabsTrigger value="activity" className="relative h-10 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none">
                <Clock className="mr-2 h-4 w-4" /> Activity
              </TabsTrigger>
            </TabsList>

            {/* OVERVIEW TAB */}
            <TabsContent value="overview" className="space-y-6 outline-none">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Finance Profile</CardTitle>
                  <CardDescription>Core financial parameters for this case.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Client Name</Label>
                    <Input defaultValue={data.client_name} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input defaultValue={data.client_phone} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Contract Sum</Label>
                    <div className="flex items-center gap-2">
                      <Input type="number" defaultValue={data.contract_sum} />
                      <Select defaultValue={data.currency}>
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MKD">MKD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
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
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Notes</Label>
                    <Textarea defaultValue={data.notes} className="resize-none" rows={3} />
                  </div>
                </CardContent>
                <CardFooter className="justify-end gap-2 border-t py-4">
                  <Button variant="outline">Reset</Button>
                  <Button onClick={() => toast({ title: "Saved", description: "Finance profile updated." })}>Save Changes</Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Case Memory</CardTitle>
                  <CardDescription>Remembered contact details and custom fields.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Contact Phone</Label>
                    <Input defaultValue={data.client_phone} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Contact Email</Label>
                    <Input defaultValue={data.case_email} />
                  </div>
                </CardContent>
                <CardFooter className="justify-end gap-2 border-t py-4">
                  <Button variant="outline">Reset</Button>
                  <Button onClick={() => toast({ title: "Saved", description: "Case memory updated." })}>Save Changes</Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Case Context</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-muted-foreground mb-1">Case ID</p>
                      <p className="font-medium">{data.case_id}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Request Type</p>
                      <p className="font-medium truncate" title={data.request_type}>{data.request_type}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Finance Date</p>
                      <p className="font-medium">{formatDate(data.finance_date)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Due Date</p>
                      <p className="font-medium">{formatDate(data.due_date)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* MONEY TAB */}
            <TabsContent value="payments" className="space-y-6 outline-none">
              <div className="grid gap-6 md:grid-cols-[1fr_300px]">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold tracking-tight">Payment Ledger</h3>
                  </div>
                  <div className="rounded-lg border bg-card">
                    {data.payments.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Note</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.payments.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">{formatDate(p.date)}</TableCell>
                              <TableCell className="text-muted-foreground">{p.note || "-"}</TableCell>
                              <TableCell className="text-right font-semibold text-emerald-600">
                                {formatMoney(p.amount, p.currency)}
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => handleDeletePayment(p.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-8 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                          <Wallet className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <h4 className="mt-4 font-medium text-foreground">No payments found</h4>
                        <p className="mt-1 text-sm text-muted-foreground">Log the first payment using the form.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <Card className="bg-muted/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Log a Payment</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Date</Label>
                        <Input type="date" value={paymentForm.date} onChange={e => setPaymentForm({...paymentForm, date: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Amount</Label>
                        <div className="flex items-center gap-2">
                          <Input type="number" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} />
                          <Badge variant="secondary" className="px-3 rounded-md">{paymentForm.currency}</Badge>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Note (Optional)</Label>
                        <Input placeholder="e.g. wire transfer, cash" value={paymentForm.note} onChange={e => setPaymentForm({...paymentForm, note: e.target.value})} />
                      </div>
                      <Button className="w-full mt-2" onClick={handleLogPayment}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Record Payment
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* INVOICES TAB */}
            <TabsContent value="invoices" className="space-y-6 outline-none">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold tracking-tight">Invoices</h3>
                <Button size="sm" onClick={() => setInvoiceForm({...invoiceForm, number: `INV-${Date.now().toString().slice(-4)}`})}>
                  <Plus className="mr-2 h-4 w-4" /> New Invoice
                </Button>
              </div>

              <div className="grid gap-6 md:grid-cols-[1fr_350px]">
                <div className="space-y-4">
                  {data.invoices.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {data.invoices.map(inv => (
                        <div 
                          key={inv.id} 
                          className={`flex cursor-pointer flex-col justify-between gap-4 rounded-xl border bg-card p-4 shadow-sm transition-all hover:border-primary/50 hover:shadow-md sm:flex-row sm:items-center ${activeInvoiceId === inv.id ? 'ring-2 ring-primary border-transparent' : ''}`}
                          onClick={() => setActiveInvoiceId(inv.id)}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                              <FileText className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-sm">{inv.number}</h4>
                                <StatusBadge status={inv.status} />
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">Due: {formatDate(inv.due_date)}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-4 sm:justify-end">
                            <div className="text-right">
                              <p className="font-bold">{formatMoney(inv.amount, inv.currency)}</p>
                              <p className="text-[10px] text-muted-foreground uppercase">{inv.client_name}</p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                               <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-8 text-center">
                      <p className="text-sm text-muted-foreground">No invoices yet.</p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <Card>
                    <CardHeader className="bg-muted/30 pb-4 border-b">
                      <CardTitle className="text-base flex items-center justify-between">
                        Draft / Edit Invoice
                        <Badge variant="outline">Unsaved</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-4 text-sm">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>Number</Label>
                          <Input value={invoiceForm.number} onChange={e => setInvoiceForm({...invoiceForm, number: e.target.value})} placeholder="001" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Status</Label>
                          <Select value={invoiceForm.status} onValueChange={v => setInvoiceForm({...invoiceForm, status: v})}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DRAFT">DRAFT</SelectItem>
                              <SelectItem value="SENT">SENT</SelectItem>
                              <SelectItem value="PAID">PAID</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>Issue Date</Label>
                          <Input type="date" value={invoiceForm.issue_date} onChange={e => setInvoiceForm({...invoiceForm, issue_date: e.target.value})} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Due Date</Label>
                          <Input type="date" value={invoiceForm.due_date} onChange={e => setInvoiceForm({...invoiceForm, due_date: e.target.value})} />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label>Amount</Label>
                        <div className="flex items-center gap-2">
                          <Input type="number" value={invoiceForm.amount} onChange={e => setInvoiceForm({...invoiceForm, amount: e.target.value})} />
                          <Badge variant="secondary" className="px-3 rounded-md">{invoiceForm.currency}</Badge>
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-1.5">
                        <Label>Client Name</Label>
                        <Input value={invoiceForm.client_name} onChange={e => setInvoiceForm({...invoiceForm, client_name: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Client Email</Label>
                        <Input type="email" value={invoiceForm.client_email} onChange={e => setInvoiceForm({...invoiceForm, client_email: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Client Address</Label>
                        <Input value={invoiceForm.client_address || ""} onChange={e => setInvoiceForm({...invoiceForm, client_address: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Service Description</Label>
                        <Input value={invoiceForm.service_description || ""} onChange={e => setInvoiceForm({...invoiceForm, service_description: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Line Items</Label>
                        <Textarea rows={2} value={invoiceForm.line_items || ""} onChange={e => setInvoiceForm({...invoiceForm, line_items: e.target.value})} placeholder="Item 1 - 1000 MKD..." />
                      </div>

                      <Separator />
                      
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Reminders Enabled</Label>
                          <input type="checkbox" checked={invoiceForm.reminders_enabled} onChange={e => setInvoiceForm({...invoiceForm, reminders_enabled: e.target.checked})} className="h-4 w-4 rounded border-gray-300 text-primary" />
                        </div>
                        {invoiceForm.reminders_enabled && (
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">First after (days)</Label>
                              <Input type="number" value={invoiceForm.reminder_first_after_days} onChange={e => setInvoiceForm({...invoiceForm, reminder_first_after_days: Number(e.target.value)})} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Repeat (days)</Label>
                              <Input type="number" value={invoiceForm.reminder_repeat_days} onChange={e => setInvoiceForm({...invoiceForm, reminder_repeat_days: Number(e.target.value)})} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Max count</Label>
                              <Input type="number" value={invoiceForm.reminder_max_count} onChange={e => setInvoiceForm({...invoiceForm, reminder_max_count: Number(e.target.value)})} />
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="flex-col gap-2 border-t pt-4">
                      <div className="flex w-full gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => setInvoiceForm({...invoiceForm, number: `INV-${Date.now().toString().slice(-4)}`})}><Copy className="mr-2 h-4 w-4" /> Copy to New</Button>
                        <Button className="flex-1" onClick={handleSaveInvoice}><Save className="mr-2 h-4 w-4" /> Save</Button>
                      </div>
                      <Button variant="outline" className="w-full mt-1" onClick={() => { setActiveTab("communication"); setCommForm({...commForm, mode: "invoice"}) }}><Send className="mr-2 h-4 w-4" /> Send Invoice Email</Button>
                      <Button variant="outline" className="w-full" onClick={() => { setActiveTab("communication"); setCommForm({...commForm, mode: "reminder"}) }}><Clock className="mr-2 h-4 w-4" /> Send Reminder</Button>
                    </CardFooter>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* COMMUNICATION TAB */}
            <TabsContent value="communication" className="space-y-6 outline-none">
              <div className="grid gap-6 md:grid-cols-[1fr_300px]">
                <div className="space-y-6">
                  <Card>
                    <CardHeader className="border-b bg-muted/20 pb-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Mail className="h-4 w-4 text-primary" /> Compose Email
                        </CardTitle>
                        <div className="flex items-center gap-2 rounded-full border bg-background p-1 shadow-sm">
                          <Button 
                            variant={commForm.mode === "invoice" ? "default" : "ghost"} 
                            size="sm" 
                            className="h-7 rounded-full text-xs"
                            onClick={() => setCommForm({...commForm, mode: "invoice"})}
                          >
                            Invoice
                          </Button>
                          <Button 
                            variant={commForm.mode === "reminder" ? "default" : "ghost"} 
                            size="sm" 
                            className="h-7 rounded-full text-xs"
                            onClick={() => setCommForm({...commForm, mode: "reminder"})}
                          >
                            Reminder
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5 pt-6">
                      <div className="space-y-2">
                        <Label>To</Label>
                        <Input value={commForm.to} onChange={e => setCommForm({...commForm, to: e.target.value})} placeholder="client@example.com" />
                        {data.remembered_recipients.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {data.remembered_recipients.map(em => (
                              <Badge 
                                key={em} 
                                variant="outline" 
                                className="cursor-pointer font-normal text-xs hover:bg-muted"
                                onClick={() => setCommForm({...commForm, to: em})}
                              >
                                {em}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Subject</Label>
                        <Input value={commForm.subject} onChange={e => setCommForm({...commForm, subject: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Message Body</Label>
                        <Textarea 
                          rows={8} 
                          value={commForm.body} 
                          onChange={e => setCommForm({...commForm, body: e.target.value})} 
                          className="font-mono text-sm leading-relaxed"
                        />
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
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold tracking-tight text-muted-foreground uppercase">Email History</h4>
                  <div className="space-y-3">
                    {data.email_log.map(log => (
                      <div key={log.id} className="rounded-lg border bg-card p-3 shadow-xs">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            {log.type === "reminder" ? <AlertCircle className="h-4 w-4 text-amber-500" /> : <FileCheck className="h-4 w-4 text-blue-500" />}
                            <span className="text-xs font-semibold uppercase">{log.type}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{formatDate(log.sent_at)}</span>
                        </div>
                        <p className="mt-2 text-sm font-medium">{log.subject}</p>
                        <p className="mt-1 text-xs text-muted-foreground truncate">To: {log.to}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ACTIVITY TAB */}
            <TabsContent value="activity" className="space-y-6 outline-none">
              <div className="grid gap-8 md:grid-cols-[1fr_300px]">
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold tracking-tight">Timeline</h3>
                  <div className="relative border-l-2 border-muted pl-6 pb-4 space-y-8">
                    {/* Just map a few mock items derived from data */}
                    {[
                      { id: 1, title: "Reminder sent", desc: "Payment reminder for invoice 002 sent to dimovski.niko@outlook.com", date: "2026-03-12", icon: Mail, tone: "warning" },
                      { id: 2, title: "Payment recorded", desc: "40,000.00 MKD · second installment", date: "2026-03-12", icon: Wallet, tone: "success" },
                      { id: 3, title: "Payment recorded", desc: "20,000.00 MKD · down payment", date: "2026-03-11", icon: Wallet, tone: "success" },
                      { id: 4, title: "Invoice sent", desc: "#002 · 40,000.00 MKD", date: "2026-03-10", icon: FileText, tone: "default" },
                    ].map((item, i) => (
                      <div key={i} className="relative">
                        <div className={`absolute -left-[35px] flex h-8 w-8 items-center justify-center rounded-full border-4 border-background ${
                          item.tone === 'success' ? 'bg-emerald-100 text-emerald-600' :
                          item.tone === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
                        }`}>
                          <item.icon className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{formatDate(item.date)}</p>
                          <h4 className="text-sm font-semibold">{item.title}</h4>
                          <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">System Memory</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Saved Contact</p>
                        <div className="flex items-center gap-2 text-sm">
                          <CircleUser className="h-4 w-4 text-muted-foreground" />
                          {data.case_email}
                        </div>
                      </div>
                      <Separator />
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Known Emails</p>
                        <div className="space-y-2">
                          {data.remembered_recipients.map(e => (
                            <div key={e} className="text-xs">{e}</div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-primary text-primary-foreground border-transparent shadow-md">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-primary-foreground/90">Fast Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <Button variant="secondary" className="w-full justify-start border-none" onClick={() => setActiveTab("payments")}>
                        <Wallet className="mr-2 h-4 w-4" /> Log Payment
                      </Button>
                      <Button variant="secondary" className="w-full justify-start border-none" onClick={() => setActiveTab("invoices")}>
                        <FileText className="mr-2 h-4 w-4" /> Draft Invoice
                      </Button>
                      <Button variant="secondary" className="w-full justify-start border-none" onClick={() => setActiveTab("communication")}>
                        <Mail className="mr-2 h-4 w-4" /> Send Email
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* RIGHT COLUMN: PERSISTENT PANEL */}
        <div className="w-full lg:w-[38%] space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {/* SIGNAL CARDS */}
            <Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-start gap-4">
                <div className="rounded-full bg-amber-100 p-2 text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Overdue Focus</h4>
                  {overdueInvoices.length > 0 ? (
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-bold text-foreground">{overdueInvoices.length}</span> invoice(s) totaling <span className="font-bold text-foreground">{formatMoney(overdueInvoices.reduce((a,b)=>a+b.amount,0), data.currency)}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">No overdue invoices.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className={`border-l-4 shadow-sm hover:shadow-md transition-shadow ${data.case_email ? 'border-l-emerald-500' : 'border-l-amber-500'}`}>
              <CardContent className="p-4 flex items-start gap-4">
                <div className={`rounded-full p-2 ${data.case_email ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Client Identity</h4>
                  <p className="text-sm text-muted-foreground mt-1 truncate max-w-[200px]" title={data.case_email || "Missing Email"}>
                    {data.case_email || "Missing Email"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className={`border-l-4 shadow-sm hover:shadow-md transition-shadow ${data.settings.smtp_from_email ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
              <CardContent className="p-4 flex items-start gap-4">
                <div className={`rounded-full p-2 ${data.settings.smtp_from_email ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">Email System</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {data.settings.smtp_from_email ? "Configured" : "Sender not configured"}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* ACTIVE INVOICE CONTEXT */}
            <Card className="sm:col-span-2 lg:col-span-1 border-primary/20 bg-primary/5">
              <CardHeader className="pb-3 border-b border-primary/10">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Active Context</span>
                  {activeInvoice && <Badge variant="outline" className="bg-background">{activeInvoice.number}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 text-sm space-y-3">
                {activeInvoice ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Recipient</span>
                      <span className="font-medium truncate max-w-[150px]">{activeInvoice.client_email}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Status</span>
                      <StatusBadge status={activeInvoice.status} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Reminders Sent</span>
                      <span className="font-medium">{activeInvoice.reminder_sent_count} / {activeInvoice.reminder_max_count}</span>
                    </div>
                    {new Date(activeInvoice.due_date) < TODAY_MOCK && activeInvoice.status !== 'PAID' && (
                      <div className="mt-2 rounded bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive flex items-center">
                        <AlertTriangle className="mr-2 h-3.5 w-3.5" /> This invoice is overdue
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">No active invoice selected.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
