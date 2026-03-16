from __future__ import annotations

import smtplib
from email.message import EmailMessage
from typing import Optional

from .settings_access import load_finance_settings


def _clean_str(value: object) -> str:
    return str(value or "").strip()


def get_smtp_settings() -> dict:
    settings = load_finance_settings()
    host = _clean_str(settings.get("smtp_host")) or "smtp.gmail.com"
    from_email = _clean_str(settings.get("smtp_from_email")) or _clean_str(
        settings.get("company_email")
    )
    return {
        "host": host,
        "port": int(settings.get("smtp_port", 587) or 587),
        "username": _clean_str(settings.get("smtp_username")),
        "password": str(settings.get("smtp_password") or ""),
        "use_tls": bool(settings.get("smtp_use_tls", True)),
        "from_email": from_email,
        "bcc": _clean_str(settings.get("smtp_bcc")),
    }


def get_company_settings() -> dict:
    settings = load_finance_settings()
    address = (settings.get("company_address", "") or "").strip()
    phone = (settings.get("company_phone", "") or "").strip()
    if phone:
        address = f"{address} | Tel: {phone}".strip(" |")

    line2_parts: list[str] = []
    bank_account = (settings.get("company_bank_account", "") or "").strip()
    bank_name = (settings.get("company_bank_name", "") or "").strip()
    tax_number = (settings.get("company_tax_number", "") or "").strip()
    if bank_account:
        line2_parts.append(f"Account: {bank_account}")
    if bank_name:
        line2_parts.append(f"Bank: {bank_name}")
    if tax_number:
        line2_parts.append(f"Tax: {tax_number}")

    return {
        "company_name": (settings.get("company_name", "") or "").strip() or "Company",
        "company_line1": address,
        "company_line2": " | ".join(line2_parts),
        "company_line3": (settings.get("company_iban", "") or "").strip(),
        "company_email": (settings.get("company_email", "") or "").strip(),
    }


def send_email_simple(
    to_email: str,
    subject: str,
    body: str,
    attachment_filename: Optional[str] = None,
    attachment_bytes: Optional[bytes] = None,
) -> Optional[str]:
    smtp = get_smtp_settings()
    if not smtp["host"] or not smtp["from_email"]:
        return "SMTP host and From email are not configured."
    if not to_email:
        return "Recipient email is empty."

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = smtp["from_email"]
    msg["To"] = to_email
    if smtp["bcc"]:
        msg["Bcc"] = smtp["bcc"]
    msg.set_content(body)

    if attachment_filename and attachment_bytes:
        msg.add_attachment(
            attachment_bytes,
            maintype="application",
            subtype="pdf",
            filename=attachment_filename,
        )

    try:
        with smtplib.SMTP(smtp["host"], smtp["port"], timeout=20) as server:
            if smtp["use_tls"]:
                server.starttls()
            if smtp["username"]:
                server.login(smtp["username"], smtp["password"])
            server.send_message(msg)
    except smtplib.SMTPAuthenticationError:
        return "SMTP authentication failed. Check the username, password, or app password."
    except smtplib.SMTPException as exc:
        return f"SMTP error: {exc}"
    except OSError as exc:
        return f"SMTP connection failed: {exc}"
    except Exception as exc:
        return str(exc)
    return None
