from __future__ import annotations

import html
from pathlib import Path
from typing import Optional


def build_invoice_html(company: dict, row: dict) -> str:
    invoice_number = str(row.get("invoice_number") or "").strip() or "-"
    issue_date = str(row.get("issue_date") or "").strip()
    due_date = str(row.get("due_date") or "").strip()
    currency = str(row.get("currency") or "MKD").strip()
    amount = float(row.get("amount") or 0)
    description = str(row.get("service_description") or "Service").strip() or "Service"
    client_name = str(row.get("client_name") or "").strip()
    client_email = str(row.get("client_email") or "").strip()
    client_address = str(row.get("client_address") or "").strip()

    recipient_lines = [value for value in (client_name, client_address, client_email) if value]
    recipient_html = "<br/>".join(html.escape(value) for value in recipient_lines)

    vat_rate = 18
    net = round(amount / (1 + vat_rate / 100), 2) if amount else 0.0
    vat_amount = round(amount - net, 2)

    def esc(value: str) -> str:
        return html.escape(str(value or ""))

    def fmt(value: float) -> str:
        return f"{value:,.2f}"

    return "".join(
        [
            "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"/>",
            "<meta name=\"viewport\" content=\"width=210mm\"/>",
            "<style>",
            "* { box-sizing: border-box; }",
            "body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; }",
            ".invoice { width: 100%; padding: 20px 24px; }",
            ".top-title { font-size: 28px; font-weight: 700; margin-bottom: 8px; text-transform: uppercase; }",
            ".top-line { border-top: 3px solid #222; margin: 8px 0 2px; }",
            ".company-meta { text-align: center; font-size: 13px; line-height: 1.4; margin-bottom: 24px; }",
            ".header-area { display: table; width: 100%; margin-bottom: 12px; table-layout: fixed; }",
            ".info-left { display: table-cell; width: 50%; font-size: 14px; line-height: 1.5; vertical-align: top; padding-right: 12px; }",
            ".big-invoice { margin-top: 12px; font-size: 20px; font-weight: 700; line-height: 1.2; text-transform: uppercase; }",
            ".recipient-box { display: table-cell; width: 50%; border: 2px solid #222; min-height: 90px; padding: 12px; font-size: 14px; line-height: 1.45; }",
            ".items { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 16px; }",
            ".items th, .items td { border: 2px solid #222; padding: 6px; font-size: 12px; }",
            ".items th { background: #f6f6f6; font-weight: 700; text-align: center; }",
            ".totals { width: 100%; max-width: 320px; margin-left: auto; margin-top: 16px; font-size: 13px; border-collapse: collapse; }",
            ".totals td { padding: 5px 6px; border: 2px solid #222; }",
            ".totals .label { width: 64%; text-align: right; background: #f6f6f6; }",
            ".totals .grand td { font-weight: 700; font-size: 14px; }",
            "</style></head><body><div class=\"invoice\">",
            f"<div class=\"top-title\">{esc(company.get('company_name', 'Company'))}</div>",
            "<div class=\"top-line\"></div>",
            f"<div class=\"company-meta\"><div>{esc(company.get('company_line1', ''))}</div><div>{esc(company.get('company_line2', ''))}</div><div>{esc(company.get('company_line3', ''))}</div></div>",
            "<div class=\"header-area\">",
            "<div class=\"info-left\">",
            f"<div><strong>Issue date:</strong> {esc(issue_date)}</div>",
            f"<div><strong>Due date:</strong> {esc(due_date)}</div>",
            f"<div><strong>Currency:</strong> {esc(currency)}</div>",
            f"<div class=\"big-invoice\">Invoice<br/>No. {esc(invoice_number)}</div>",
            "</div>",
            f"<div class=\"recipient-box\">{recipient_html}</div>",
            "</div>",
            "<table class=\"items\"><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Net</th><th>VAT</th><th>Total</th></tr></thead><tbody>",
            f"<tr><td>1</td><td>{esc(description)}</td><td>1</td><td>{fmt(net)}</td><td>{fmt(vat_amount)}</td><td>{fmt(amount)}</td></tr>",
            "</tbody></table>",
            "<table class=\"totals\"><tbody>",
            f"<tr><td class=\"label\">Subtotal</td><td>{fmt(net)}</td></tr>",
            f"<tr><td class=\"label\">VAT ({vat_rate}%)</td><td>{fmt(vat_amount)}</td></tr>",
            f"<tr class=\"grand\"><td class=\"label\">Amount due</td><td>{fmt(amount)} {esc(currency)}</td></tr>",
            "</tbody></table>",
            "</div></body></html>",
        ]
    )


def invoice_html_to_pdf(html_content: str) -> Optional[bytes]:
    try:
        import pdfkit
        import sys

        config = None
        if sys.platform == "win32":
            wkhtmltopdf_exe = Path(r"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe")
            if wkhtmltopdf_exe.exists():
                config = pdfkit.configuration(wkhtmltopdf=str(wkhtmltopdf_exe))

        options = {
            "page-size": "A4",
            "margin-top": "12mm",
            "margin-right": "12mm",
            "margin-bottom": "12mm",
            "margin-left": "12mm",
            "encoding": "UTF-8",
            "viewport-size": "794 1123",
            "enable-local-file-access": None,
        }
        return pdfkit.from_string(html_content, False, configuration=config, options=options)
    except Exception:
        return None
