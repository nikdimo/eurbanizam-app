from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any, Optional


def _esc(value: str) -> str:
    return html.escape(str(value or ""))


def _fmt(value: float) -> str:
    return f"{value:,.2f}"


def _qty(value: float) -> str:
    return f"{value:,.3f}"


def _parse_items(row: dict) -> list[dict[str, Any]]:
    """Parse line items from items_json or build a single line from service_description + amount."""
    raw = (row.get("items_json") or "").strip()
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, list) and len(data) > 0:
                out = []
                for i, item in enumerate(data):
                    if not isinstance(item, dict):
                        continue
                    qty_val = float(item.get("quantity", 1))
                    price = float(item.get("unitPrice", item.get("unit_price", 0)))
                    vat = float(item.get("vatRate", item.get("vat_rate", 18)))
                    name = str(item.get("name", item.get("description", "")) or "").strip() or "Услуга"
                    out.append({
                        "code": str(item.get("code", "")) or str(i + 1),
                        "name": name,
                        "unit": str(item.get("unit", "пар")).strip() or "пар",
                        "quantity": qty_val,
                        "unitPrice": price,
                        "vatRate": vat,
                    })
                if out:
                    return out
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    amount = float(row.get("amount") or 0)
    description = (str(row.get("service_description") or "Service").strip()) or "Услуга"
    vat_rate = 18
    net = round(amount / (1 + vat_rate / 100), 2) if amount else 0.0
    return [{
        "code": "1",
        "name": description,
        "unit": "пар",
        "quantity": 1,
        "unitPrice": net,
        "vatRate": vat_rate,
        "sourceGrossAmount": amount,
    }]


def _calculate_rows(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for i, item in enumerate(items):
        qty_val = float(item.get("quantity", 1))
        unit_price = float(item.get("unitPrice", 0))
        vat_rate = float(item.get("vatRate", 18))
        source_gross = item.get("sourceGrossAmount")

        if source_gross is not None:
            # When we only know the total (amount field), treat it as gross and
            # back-calculate net and VAT so that net + VAT == gross exactly.
            gross_amount = float(source_gross)
            vat_amount = round(gross_amount * (vat_rate / (100 + vat_rate)), 2)
            net_amount = round(gross_amount - vat_amount, 2)
            gross_unit = gross_amount / qty_val if qty_val else 0.0
            unit_price = net_amount / qty_val if qty_val else 0.0
            vat_per_unit = vat_amount / qty_val if qty_val else 0.0
        else:
            net_amount = qty_val * unit_price
            vat_amount = round(net_amount * (vat_rate / 100), 2)
            vat_per_unit = round(unit_price * (vat_rate / 100), 2)
            gross_unit = unit_price + vat_per_unit
            gross_amount = net_amount + vat_amount
        rows.append({
            "index": i + 1,
            "code": item.get("code", ""),
            "name": item.get("name", ""),
            "unit": item.get("unit", "пар"),
            "quantity": qty_val,
            "unitPrice": unit_price,
            "vatRate": vat_rate,
            "netAmount": net_amount,
            "vatAmount": vat_amount,
            "vatPerUnit": vat_per_unit,
            "grossUnitPrice": gross_unit,
            "grossAmount": gross_amount,
        })
    return rows


def _calculate_totals(rows: list[dict], discount: float) -> dict[str, Any]:
    subtotal = sum(r["netAmount"] for r in rows)
    tax_base = max(0, subtotal - discount)
    vat_groups: dict[str, dict] = {}
    for r in rows:
        key = f"{r['vatRate']:.2f}"
        if key not in vat_groups:
            vat_groups[key] = {"rate": r["vatRate"], "base": 0.0, "vat": 0.0}
        vat_groups[key]["base"] += r["netAmount"]
        vat_groups[key]["vat"] += r["vatAmount"]
    total_vat = sum(g["vat"] for g in vat_groups.values())
    grand_total = max(0, subtotal - discount + total_vat)
    return {
        "subtotal": subtotal,
        "discount": discount,
        "taxBase": tax_base,
        "totalVat": total_vat,
        "grandTotal": grand_total,
        "vatGroups": list(vat_groups.values()),
    }


def _display_date(iso: Optional[str]) -> str:
    if not iso:
        return ""
    parts = str(iso).strip()[:10].split("-")
    if len(parts) == 3:
        return f"{parts[2]}/{parts[1]}/{parts[0]}"
    return str(iso)


def build_invoice_html(company: dict, row: dict) -> str:
    """Build printable MK-style invoice HTML (no editor panel)."""
    company_name = _esc(company.get("company_name", "Company"))
    company_line1 = _esc(company.get("company_line1", ""))
    company_line2 = _esc(company.get("company_line2", ""))
    company_line3 = _esc(company.get("company_line3", ""))

    issue_date = str(row.get("issue_date") or "").strip()
    currency = str(row.get("currency") or "MKD").strip()
    if currency.upper() == "MKD":
        currency = "MKD"
    invoice_number = str(row.get("invoice_number") or "").strip() or "-"
    dispatch_number = str(row.get("dispatch_number") or "").strip()
    discount = float(row.get("discount") or 0)
    legal_note = _esc(str(row.get("legal_note") or "").strip())
    amount_words = _esc(str(row.get("amount_words") or "").strip())
    footer1 = _esc(str(row.get("footer1") or "").strip())
    footer2 = _esc(str(row.get("footer2") or "").strip())

    client_name = str(row.get("client_name") or "").strip()
    client_address = str(row.get("client_address") or "").strip()
    client_email = str(row.get("client_email") or "").strip()
    recipient_parts = [p for p in (client_name, client_address, client_email) if p]
    recipient = _esc("\n".join(recipient_parts)) if recipient_parts else ""

    items = _parse_items(row)
    rows = _calculate_rows(items)
    totals = _calculate_totals(rows, discount)

    if not legal_note and totals["totalVat"]:
        legal_note = _esc(
            f"Напомена: Пренесување на даночна обврска согласно член 32-а став 1, точка 1 од законот за ДДВ на износ од {_fmt(totals['totalVat'])} ден."
        )

    items_html = "".join(
        f"""<tr>
          <td class="center">{r['index']}.</td>
          <td>{_esc(r['code'])}</td>
          <td>{_esc(r['name'])}</td>
          <td class="center">{_esc(r['unit'])}</td>
          <td class="num">{_qty(r['quantity'])}</td>
          <td class="num">{_fmt(r['unitPrice'])}</td>
          <td class="num">{_fmt(r['netAmount'])}</td>
          <td class="num">{_fmt(r['vatAmount'])}</td>
          <td class="num">{_fmt(r['vatPerUnit'])}</td>
          <td class="num">{_fmt(r['grossUnitPrice'])}</td>
          <td class="num">{_fmt(r['grossAmount'])}</td>
          <td class="center">{int(r['vatRate'])}</td>
        </tr>"""
        for r in rows
    )

    vat_summary_html = "".join(
        f"""<tr>
          <td class="center">{int(g['rate'])}%</td>
          <td class="num">{_fmt(g['base'])}</td>
          <td class="num">{_fmt(g['vat'])}</td>
        </tr>"""
        for g in totals["vatGroups"]
    )

    recipient_br = recipient.replace("\n", "<br/>") if recipient else ""

    css = """
    :root { --border: #222; --light: #f6f6f6; --text: #111; --muted: #666; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: var(--text); background: #fff; }
    .invoice { width: 100%; max-width: 1000px; margin: 0 auto; padding: 36px 38px 40px; }
    .top-title { font-size: 28px; font-weight: 700; margin-bottom: 8px; text-transform: uppercase; }
    .top-line { border-top: 3px solid var(--border); margin: 8px 0 2px; }
    .company-meta { text-align: center; font-size: 13px; line-height: 1.4; margin-bottom: 44px; }
    .header-area { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: start; }
    .info-left { font-size: 16px; line-height: 1.5; }
    .big-invoice { margin-top: 18px; font-size: 22px; font-weight: 700; line-height: 1.2; text-transform: uppercase; }
    .recipient-box { border: 2px solid var(--border); min-height: 116px; padding: 16px; font-size: 18px; line-height: 1.45; white-space: pre-line; }
    .recipient-box br { white-space: pre; }
    .dispatch-row { margin: 18px 0 8px; font-size: 15px; }
    .u { text-decoration: underline; }
    table { width: 100%; border-collapse: collapse; }
    .items th, .items td, .vat-table th, .vat-table td, .totals td { border: 2px solid var(--border); padding: 6px; font-size: 13px; vertical-align: middle; }
    .items th, .vat-table th { background: var(--light); font-weight: 700; text-align: center; }
    .items td.num, .vat-table td.num, .totals td.num { text-align: right; white-space: nowrap; }
    .items td.center, .vat-table td.center { text-align: center; }
    .mid-section { margin-top: 14px; display: grid; grid-template-columns: 300px 1fr; gap: 20px; align-items: start; }
    .note-area { margin-top: 24px; font-size: 14px; line-height: 1.45; }
    .note-box { border: 3px solid #990f0f; border-radius: 999px; padding: 14px 24px; font-size: 18px; margin-bottom: 34px; }
    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 24px; }
    .totals { width: 330px; border-collapse: collapse; font-size: 15px; }
    .totals td.label { width: 64%; text-align: right; background: var(--light); }
    .totals .grand td { font-weight: 700; font-size: 16px; }
    .bottom-text { margin-top: 42px; font-size: 15px; line-height: 1.4; }
    .signature-line { margin-top: 22px; border-top: 3px solid var(--border); padding-top: 8px; display: grid; grid-template-columns: 1fr 1fr; font-size: 18px; }
    .signature-line div { text-align: center; }
    @media print { body { background: white; } .invoice { box-shadow: none; } }
    """

    html_parts = [
        '<!DOCTYPE html><html lang="mk"><head><meta charset="UTF-8"/>',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0"/>',
        "<title>Фактура</title>",
        "<style>",
        css,
        "</style></head><body>",
        '<section class="invoice">',
        f'<div class="top-title">{company_name}</div>',
        '<div class="top-line"></div>',
        '<div class="company-meta">',
        f'<div>{company_line1}</div>' if company_line1 else "",
        f'<div>{company_line2}</div>' if company_line2 else "",
        f'<div>{company_line3}</div>' if company_line3 else "",
        "</div>",
        '<div class="header-area">',
        '<div class="info-left">',
        f'<div><strong>Датум:</strong>&nbsp;&nbsp;<span>{_display_date(issue_date)}</span></div>',
        f'<div><strong>Валута:</strong>&nbsp;&nbsp;<span>{_esc(currency)}</span></div>',
        f'<div class="big-invoice">ФАКТУРА<br/>број: <span>{_esc(invoice_number)}</span></div>',
        "</div>",
        f'<div class="recipient-box">{recipient_br or "&nbsp;"}</div>',
        "</div>",
        '<div class="dispatch-row">',
        f'Стокata е испратена на ден <span class="u">{_display_date(issue_date)}</span> по испратница бр. <span>{_esc(dispatch_number)}</span>',
        "</div>",
        """<table class="items">
          <thead><tr>
            <th style="width:40px">Р.б</th>
            <th style="width:90px">Шифра</th>
            <th>Назив на производот</th>
            <th style="width:55px">Е М</th>
            <th style="width:80px">Количина</th>
            <th style="width:110px">Цена без данок<br>По един.</th>
            <th style="width:110px">Износ</th>
            <th style="width:90px">Данок</th>
            <th style="width:100px">ДДВ по единица</th>
            <th style="width:110px">Цена со данок<br>По един.</th>
            <th style="width:110px">Износ</th>
            <th style="width:70px">Тар. %</th>
          </tr></thead>
          <tbody>""",
        items_html,
        "</tbody></table>",
        '<div class="mid-section">',
        """<table class="vat-table">
          <thead><tr><th>Тарифа</th><th>Износ без ДДВ</th><th>ДДВ</th></tr></thead>
          <tbody>""",
        vat_summary_html,
        "</tbody></table>",
        "<div></div>",
        "</div>",
        '<div class="totals-wrap"><table class="totals"><tbody>',
        f'<tr><td class="label">Продажен износ без ДДВ:</td><td class="num">{_fmt(totals["subtotal"])}</td></tr>',
        f'<tr><td class="label">Рабат:</td><td class="num">{_fmt(totals["discount"])}</td></tr>',
        f'<tr><td class="label">Основа за ДДВ:</td><td class="num">{_fmt(totals["taxBase"])}</td></tr>',
        f'<tr class="grand"><td class="label">За наплата</td><td class="num">{_fmt(totals["grandTotal"])} {_esc(currency)}</td></tr>',
        "</tbody></table></div>",
        '<div class="note-area">',
        f'<div class="note-box">{legal_note or "&nbsp;"}</div>',
        '<div class="bottom-text">',
        f'<div><strong>Со зборови:</strong> <span>{amount_words or "&nbsp;"}</span></div>',
        f'<div>{footer1}</div>' if footer1 else "",
        f'<div>{footer2}</div>' if footer2 else "",
        "</div></div>",
        '<div class="signature-line"><div>ПРИМИЛ</div><div>Лице со овластување за потпишување фактури:</div></div>',
        "</section></body></html>",
    ]
    return "".join(html_parts)


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
            "margin-top": "10mm",
            "margin-right": "10mm",
            "margin-bottom": "10mm",
            "margin-left": "10mm",
            "encoding": "UTF-8",
            "viewport-size": "1000x1400",
            "print-media-type": None,
            "disable-smart-shrinking": None,
            "zoom": "1.0",
            "enable-local-file-access": None,
        }
        return pdfkit.from_string(html_content, False, configuration=config, options=options)
    except Exception:
        return None
