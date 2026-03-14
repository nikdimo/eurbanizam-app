"use client";

import * as React from "react";
import { SaveIcon } from "lucide-react";

import { apiClient } from "@/lib/api/client";
import { PageContainer, PageHeader } from "@/components/layout/PagePrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { FinanceSettings, FinanceSettingsSchema } from "@/lib/schemas";

type CompanyDraft = {
  company_name: string;
  company_address: string;
  company_city: string;
  company_tax_number: string;
  company_bank_name: string;
  company_bank_account: string;
  company_iban: string;
  company_email: string;
  company_phone: string;
};

function buildCompanyDraft(settings: FinanceSettings | null): CompanyDraft {
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
  };
}

export default function SettingsPage() {
  const [settings, setSettings] = React.useState<FinanceSettings | null>(null);
  const [draft, setDraft] = React.useState<CompanyDraft>(buildCompanyDraft(null));
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const loadSettings = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const res = await apiClient.getParsed(
      "/api/finance/settings",
      FinanceSettingsSchema,
      { cache: "no-store" },
    );
    if (res.error) {
      setError(res.error);
      setSettings(null);
      setDraft(buildCompanyDraft(null));
    } else if (res.data) {
      setSettings(res.data);
      setDraft(buildCompanyDraft(res.data));
    }
    setIsLoading(false);
  }, []);

  React.useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setNotice(null);
    const payload = {
      company_name: draft.company_name.trim() || null,
      company_address: draft.company_address.trim() || null,
      company_city: draft.company_city.trim() || null,
      company_tax_number: draft.company_tax_number.trim() || null,
      company_bank_name: draft.company_bank_name.trim() || null,
      company_bank_account: draft.company_bank_account.trim() || null,
      company_iban: draft.company_iban.trim() || null,
      company_email: draft.company_email.trim() || null,
      company_phone: draft.company_phone.trim() || null,
    };
    const res = await apiClient.patch<unknown>("/api/finance/settings", payload);
    setIsSaving(false);
    if (res.error) {
      setNotice({ tone: "error", message: res.error });
      return;
    }
    const parsed = FinanceSettingsSchema.safeParse(res.data);
    if (parsed.success) {
      setSettings(parsed.data);
      setDraft(buildCompanyDraft(parsed.data));
      setNotice({ tone: "success", message: "Company settings saved." });
    } else {
      void loadSettings();
      setNotice({ tone: "success", message: "Settings saved." });
    }
  }

  if (isLoading && !settings) {
    return (
      <>
        <PageHeader title="Settings" description="Configure company and app defaults." />
        <PageContainer>
          <LoadingState label="Loading settings..." />
        </PageContainer>
      </>
    );
  }

  if (error && !settings) {
    return (
      <>
        <PageHeader title="Settings" description="Configure company and app defaults." />
        <PageContainer>
          <ErrorState message={error} onRetry={loadSettings} />
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configure your company details for invoicing and communication."
      />
      <PageContainer className="max-w-2xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Company information</CardTitle>
            <CardDescription>
              Used on every invoice PDF (header, bank details, contact). Save
              once and reuse across all cases.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company name</Label>
                  <Input
                    id="company_name"
                    value={draft.company_name}
                    onChange={(e) =>
                      setDraft((c) => ({ ...c, company_name: e.target.value }))
                    }
                    placeholder="Your company or practice name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_email">Company email</Label>
                  <Input
                    id="company_email"
                    type="email"
                    value={draft.company_email}
                    onChange={(e) =>
                      setDraft((c) => ({ ...c, company_email: e.target.value }))
                    }
                    placeholder="contact@company.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_address">Address</Label>
                <Input
                  id="company_address"
                  value={draft.company_address}
                  onChange={(e) =>
                    setDraft((c) => ({ ...c, company_address: e.target.value }))
                  }
                  placeholder="Street, number"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="company_city">City</Label>
                  <Input
                    id="company_city"
                    value={draft.company_city}
                    onChange={(e) =>
                      setDraft((c) => ({ ...c, company_city: e.target.value }))
                    }
                    placeholder="City, postal code"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_phone">Phone</Label>
                  <Input
                    id="company_phone"
                    value={draft.company_phone}
                    onChange={(e) =>
                      setDraft((c) => ({ ...c, company_phone: e.target.value }))
                    }
                    placeholder="+389 ..."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_tax_number">Tax number</Label>
                <Input
                  id="company_tax_number"
                  value={draft.company_tax_number}
                  onChange={(e) =>
                    setDraft((c) => ({
                      ...c,
                      company_tax_number: e.target.value,
                    }))
                  }
                  placeholder="Tax ID / VAT number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_bank_name">Bank name</Label>
                <Input
                  id="company_bank_name"
                  value={draft.company_bank_name}
                  onChange={(e) =>
                    setDraft((c) => ({
                      ...c,
                      company_bank_name: e.target.value,
                    }))
                  }
                  placeholder="Bank name"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="company_bank_account">Bank account</Label>
                  <Input
                    id="company_bank_account"
                    value={draft.company_bank_account}
                    onChange={(e) =>
                      setDraft((c) => ({
                        ...c,
                        company_bank_account: e.target.value,
                      }))
                    }
                    placeholder="Account number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_iban">IBAN</Label>
                  <Input
                    id="company_iban"
                    value={draft.company_iban}
                    onChange={(e) =>
                      setDraft((c) => ({ ...c, company_iban: e.target.value }))
                    }
                    placeholder="IBAN"
                  />
                </div>
              </div>
              {notice ? (
                <p
                  className={
                    notice.tone === "error"
                      ? "text-sm text-destructive"
                      : "text-sm text-emerald-600"
                  }
                >
                  {notice.message}
                </p>
              ) : null}
              <div className="flex justify-end">
                <Button type="submit" disabled={isSaving}>
                  <SaveIcon className="size-4" />
                  {isSaving ? "Saving…" : "Save company info"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </PageContainer>
    </>
  );
}
