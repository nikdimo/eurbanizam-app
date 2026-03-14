"use client";

import { useParams } from "next/navigation";

import { FinanceCaseWorkspace } from "@/components/finance/finance-case-workspace";

export default function FinanceCaseWorkspacePage() {
  const params = useParams<{ caseId: string }>();

  return <FinanceCaseWorkspace caseId={params.caseId} />;
}
