"""Envoi SMTP (Mailpit en local, serveur de l'organisme sur le VPS). Remplaçable dans les tests."""

from __future__ import annotations

import smtplib
from email import policy
from email.headerregistry import Address
from email.message import EmailMessage
from email.utils import make_msgid
from typing import Protocol

from app.core.config import get_settings


class Sender(Protocol):
    def send(self, *, to: str, to_name: str | None, subject: str, html: str, text: str,
             from_name: str, reply_to: str | None) -> str: ...


def _address(name: str | None, email: str, utf8: bool) -> Address | str:
    """Adresse d'en-tête. Accents avant « @ » : Address les refuse, on écrit l'en-tête tel quel (SMTPUTF8)."""
    if not utf8 or email.isascii():
        return Address(name or "", addr_spec=email)
    safe = (name or "").replace('"', "")
    return f'"{safe}" <{email}>' if safe else email


class SmtpSender:
    def send(self, *, to: str, to_name: str | None, subject: str, html: str, text: str,
             from_name: str, reply_to: str | None) -> str:
        cfg = get_settings()
        utf8 = not (to + cfg.smtp_from).isascii()  # adresse avec accents : extension SMTPUTF8 nécessaire
        msg = EmailMessage(policy=policy.SMTPUTF8 if utf8 else policy.SMTP)
        msg["Subject"] = subject
        msg["From"] = _address(from_name, cfg.smtp_from, utf8)
        msg["To"] = _address(to_name, to, utf8)
        if reply_to:
            msg["Reply-To"] = reply_to
        msg_id = make_msgid(domain=cfg.smtp_from.split("@")[-1] or "gsms.local")
        msg["Message-ID"] = msg_id
        msg.set_content(text)
        msg.add_alternative(html, subtype="html")
        smtp_cls = smtplib.SMTP_SSL if cfg.smtp_ssl else smtplib.SMTP
        with smtp_cls(cfg.smtp_host, cfg.smtp_port, timeout=20) as smtp:
            if cfg.smtp_starttls and not cfg.smtp_ssl:
                smtp.starttls()
            if cfg.smtp_user:
                smtp.login(cfg.smtp_user, cfg.smtp_password)
            if utf8:
                smtp.ehlo()
                if not smtp.has_extn("smtputf8"):
                    raise ValueError(f"Adresse avec caractères accentués refusée par le serveur d'envoi : {to}")
                smtp.send_message(msg, mail_options=["SMTPUTF8"])
            else:
                smtp.send_message(msg)
        return msg_id


_sender: Sender = SmtpSender()


def get_sender() -> Sender:
    return _sender


def set_sender(sender: Sender) -> None:
    """Tests : remplace l'envoi réel par un faux qui garde les messages."""
    global _sender
    _sender = sender
