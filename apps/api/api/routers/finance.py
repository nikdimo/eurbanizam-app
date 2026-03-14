from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from ...core.dependencies import get_finance_service
from ...schemas.finance import (
    EmailLogEntry,
    FinanceCaseDetail,
    FinanceFilterOptions,
    FinanceCaseListItem,
    PaginatedFinanceCaseList,
    FinanceDashboardSummary,
    FinanceOverviewUpdatePayload,
    FinanceProfilePayload,
    Invoice,
    InvoiceCreatePayload,
    InvoiceUpdatePayload,
    Payment,
    PaymentCreatePayload,
    RecipientLabelUpdate,
    SendInvoiceEmailPayload,
)


router = APIRouter(tags=["finance"])


@router.get("/finance/summary", response_model=FinanceDashboardSummary)
def get_finance_summary(service=Depends(get_finance_service)):
    return service.get_dashboard_summary()


@router.get("/finance/cases", response_model=PaginatedFinanceCaseList)
def list_finance_cases(
    q: Optional[str] = Query(None),
    request_type: Optional[List[str]] = Query(None),
    status: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    overdue_only: bool = Query(False),
    needs_action_only: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    service=Depends(get_finance_service),
):
    return service.list_cases(
        search=q,
        request_types=request_type,
        statuses=status,
        date_from=date_from,
        date_to=date_to,
        overdue_only=overdue_only,
        needs_action_only=needs_action_only,
        limit=limit,
        offset=offset,
    )


@router.get("/finance/cases/{case_id}", response_model=FinanceCaseDetail)
def get_finance_case(case_id: str, service=Depends(get_finance_service)):
    detail = service.get_case_detail(case_id=case_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Finance case not found")
    return detail


@router.get("/finance/filter-options", response_model=FinanceFilterOptions)
def get_finance_filter_options(service=Depends(get_finance_service)):
    return service.get_filter_options()


@router.patch("/finance/cases/{case_id}/overview", response_model=FinanceCaseDetail)
def update_finance_overview(
    case_id: str,
    payload: FinanceOverviewUpdatePayload,
    service=Depends(get_finance_service),
):
    detail = service.update_overview(case_id=case_id, payload=payload)
    if detail is None:
        raise HTTPException(status_code=404, detail="Finance case not found")
    return detail


@router.put("/finance/cases/{case_id}/profile", response_model=FinanceCaseDetail)
def upsert_finance_profile(
    case_id: str,
    payload: FinanceProfilePayload,
    service=Depends(get_finance_service),
):
    return service.upsert_profile(case_id=case_id, payload=payload)


@router.get("/finance/cases/{case_id}/payments", response_model=List[Payment])
def list_payments(case_id: str, service=Depends(get_finance_service)):
    return service.list_payments(case_id=case_id)


@router.post("/finance/cases/{case_id}/payments", response_model=FinanceCaseDetail)
def create_payment(
    case_id: str,
    payload: PaymentCreatePayload,
    service=Depends(get_finance_service),
):
    return service.add_payment(case_id=case_id, payload=payload)


@router.delete("/finance/payments/{payment_id}", response_model=FinanceCaseDetail)
def delete_payment(payment_id: int, service=Depends(get_finance_service)):
    detail = service.delete_payment(payment_id=payment_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    return detail


@router.get("/finance/cases/{case_id}/invoices", response_model=List[Invoice])
def list_invoices(case_id: str, service=Depends(get_finance_service)):
    return service.list_invoices(case_id=case_id)


@router.post("/finance/cases/{case_id}/invoices", response_model=Invoice)
def create_invoice(
    case_id: str,
    payload: InvoiceCreatePayload,
    service=Depends(get_finance_service),
):
    return service.create_invoice(case_id=case_id, payload=payload)


@router.patch("/finance/invoices/{invoice_id}", response_model=Invoice)
def update_invoice(
    invoice_id: int,
    payload: InvoiceUpdatePayload,
    service=Depends(get_finance_service),
):
    updated = service.update_invoice(invoice_id=invoice_id, payload=payload)
    if updated is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return updated


@router.delete("/finance/invoices/{invoice_id}")
def delete_invoice(invoice_id: int, service=Depends(get_finance_service)):
    ok = service.delete_invoice(invoice_id=invoice_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"ok": True}


@router.get("/finance/invoices/{invoice_id}/pdf")
def get_invoice_pdf(
    invoice_id: int,
    service=Depends(get_finance_service),
):
    result = service.get_invoice_pdf(invoice_id=invoice_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Invoice not found or PDF could not be generated")
    pdf_bytes, filename = result
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
        },
    )


@router.get("/finance/cases/{case_id}/email-log", response_model=List[EmailLogEntry])
def get_email_log(
    case_id: str,
    invoice_id: Optional[int] = Query(None),
    service=Depends(get_finance_service),
):
    return service.get_email_log(case_id=case_id, invoice_id=invoice_id)


@router.post("/finance/invoices/{invoice_id}/send-email")
def send_invoice_email(
    invoice_id: int,
    payload: SendInvoiceEmailPayload,
    service=Depends(get_finance_service),
):
    result = service.send_invoice_email(invoice_id=invoice_id, payload=payload)
    if result is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return result


@router.post("/finance/invoices/{invoice_id}/send-reminder")
def send_invoice_reminder(
    invoice_id: int,
    payload: SendInvoiceEmailPayload,
    service=Depends(get_finance_service),
):
    result = service.send_invoice_reminder(invoice_id=invoice_id, payload=payload)
    if result is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return result


@router.delete("/finance/cases/{case_id}/recipients/{email:path}", response_model=FinanceCaseDetail)
def delete_case_recipient(
    case_id: str,
    email: str,
    service=Depends(get_finance_service),
):
    from urllib.parse import unquote
    email_decoded = unquote(email)
    ok = service.delete_case_recipient(case_id=case_id, email=email_decoded)
    if not ok:
        raise HTTPException(status_code=404, detail="Recipient not found")
    detail = service.get_case_detail(case_id=case_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Finance case not found")
    return detail


@router.patch("/finance/cases/{case_id}/recipients/{email:path}", response_model=FinanceCaseDetail)
def update_case_recipient(
    case_id: str,
    email: str,
    payload: RecipientLabelUpdate,
    service=Depends(get_finance_service),
):
    from urllib.parse import unquote
    email_decoded = unquote(email)
    ok = service.update_recipient_label(
        case_id=case_id,
        email=email_decoded,
        label=payload.label,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Recipient not found")
    detail = service.get_case_detail(case_id=case_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Finance case not found")
    return detail
