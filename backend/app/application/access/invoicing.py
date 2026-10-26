"""Politique de la facturation : ce qu'une personne peut faire sur une facture, maintenant.

Même ordre que les autres domaines : permission, puis état, puis conditions. Les refus sont motivés (409, `details`)
et les capacités renvoyées dans les vues de détail permettent au front d'afficher les boutons sans rien recalculer.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.application.service.invoicing import service
from app.application.service.platform.decisions import ALLOW, Decision, deny
from app.middleware.auth import permissions_of
from app.types.auth import User
from app.types.invoicing import STATUSES, Invoice, Payment

LABELS = {
    "modifier": "Modifier le brouillon",
    "supprimer": "Supprimer le brouillon",
    "emettre": "Émettre (numéro définitif, pièce figée)",
    "avoir": "Émettre un avoir",
    "encaisser": "Enregistrer un encaissement",
}


class InvoicePolicy:
    def __init__(self, db: Session, user: User | None, today: date | None = None):
        self.db = db
        self.user = user
        self.today = today or date.today()

    def _has(self, permission: str) -> bool:
        return self.user is None or permission in permissions_of(self.db, self.user)

    def _draft(self, invoice: Invoice, permission: str) -> Decision:
        if not self._has(permission):
            return deny("PERMISSION_MISSING", f"Permission « {permission} » requise")
        if invoice.status != "BROUILLON":
            return deny("NOT_DRAFT", f"{invoice.number or 'Pièce'} est émise : elle ne se modifie plus, "
                                     "corrigez-la par un avoir", [{"statut": invoice.status}])
        return ALLOW

    def can_edit(self, invoice: Invoice) -> Decision:
        return self._draft(invoice, "invoices.write")

    def can_issue(self, invoice: Invoice, issues: list[dict] | None = None) -> Decision:
        d = self._draft(invoice, "invoices.issue")
        if not d.allowed:
            return d
        issues = service.checks(self.db, invoice, self.today) if issues is None else issues
        blocking = service.blocking(issues)
        if blocking:
            return deny("CHECKS_FAILED", f"{len(blocking)} point(s) à corriger avant l'émission", blocking)
        return ALLOW

    def can_credit(self, invoice: Invoice) -> Decision:
        if not self._has("invoices.issue"):
            return deny("PERMISSION_MISSING", "Permission « invoices.issue » requise")
        if invoice.kind != "FACTURE":
            return deny("NOT_AN_INVOICE", "Un avoir ne se rectifie pas par un autre avoir")
        if invoice.status == "BROUILLON":
            return deny("NOT_ISSUED", "Facture non émise : modifiez ou supprimez le brouillon")
        if invoice.status == "ANNULEE" or service.balance(self.db, invoice)["avoirs"] >= invoice.total_ttc_cents:
            return deny("NOTHING_TO_CREDIT", "Facture déjà entièrement annulée par avoir")
        return ALLOW

    def can_pay(self, invoice: Invoice, amount_cents: int | None = None) -> Decision:
        if not self._has("payments.write"):
            return deny("PERMISSION_MISSING", "Permission « payments.write » requise")
        if invoice.kind != "FACTURE":
            return deny("NOT_AN_INVOICE", "Un avoir ne reçoit pas d'encaissement")
        if invoice.status not in ("EMISE", "PAYEE_PARTIELLEMENT"):
            return deny("INVALID_STATE", f"Facture {STATUSES[invoice.status].lower()} : aucun encaissement attendu",
                        [{"statut": invoice.status}])
        due = service.balance(self.db, invoice)["reste_du"]
        if amount_cents is not None and amount_cents > due:
            return deny("PAYMENT_EXCEEDS_DUE", "Montant supérieur au reste dû",
                        [{"reste_du_centimes": due, "demande_centimes": amount_cents}])
        return ALLOW

    def can_cancel_payment(self, payment: Payment) -> Decision:
        if not self._has("payments.write"):
            return deny("PERMISSION_MISSING", "Permission « payments.write » requise")
        if payment.cancelled_at is not None:
            return deny("ALREADY_CANCELLED", "Encaissement déjà annulé")
        return ALLOW

    def capabilities(self, invoice: Invoice, issues: list[dict]) -> dict[str, dict]:
        decisions = {
            "modifier": self.can_edit(invoice), "supprimer": self.can_edit(invoice),
            "emettre": self.can_issue(invoice, issues), "avoir": self.can_credit(invoice),
            "encaisser": self.can_pay(invoice),
        }
        return {name: {**d.to_dict(), "libelle": LABELS[name]} for name, d in decisions.items()}
