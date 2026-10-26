"""Message du formulaire de contact du site (landing) : transmis à l'équipe par le journal des communications.

Pas de table propre : le message devient un e-mail interne (`communication.message`, statut PREVU, envoyé au
prochain passage du worker) à chaque compte actif qui traite les demandes du site (permission `leads.read`,
comme les préinscriptions). Il apparaît donc dans « Communication › Messages et relances », avec son envoi tracé.
Aucune règle du calendrier ne le produit : `still_relevant` le laisse toujours partir (RULE_KEY).
"""

from __future__ import annotations

import hashlib
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.service.platform.settings import ConfigurationService
from app.application.service.qualiopi.common import next_reference
from app.application.service.relances.planner import _people_with
from app.application.service.relances.render import render
from app.types import training as t
from app.types.relances import Message

RULE_KEY = "contact_site"
TEMPLATE = "contact_site"


def submit(db: Session, name: str, email: str, subject: str, message: str, today: date | None = None) -> int:
    """Crée un e-mail interne par destinataire ; renvoie le nombre de messages créés (0 : déjà reçu)."""
    today = today or date.today()
    config = ConfigurationService(db)
    org = db.scalar(select(t.Organization))
    fingerprint = hashlib.sha256("\x1f".join((email.lower(), subject, message)).encode()).hexdigest()[:32]
    context = {
        "organisme": {"nom": config.get("general.brand_short_name") or (org.name if org else "Organisme de formation"),
                      "couleur": config.get("general.brand_color"), "reponse": None},
        "contact": {"nom": name, "email": email, "objet": subject, "message": message},
    }
    out = render(TEMPLATE, context)
    recipients = _people_with(db, "leads.read", "GESTION")
    created = 0
    for r in recipients or [None]:
        address = r.email if r else None
        # Même message renvoyé (double clic, nouvel essai) : un seul e-mail par destinataire.
        key = f"{RULE_KEY}|{fingerprint}|{(address or 'sans-adresse').lower()}"
        if db.scalar(select(Message.id).where(Message.occurrence_key == key)):
            continue
        db.add(Message(
            reference=next_reference(db, "MSG"), occurrence_key=key, rule_key=RULE_KEY, template=TEMPLATE,
            template_version=out.version, external=False, recipient_kind="GESTION",
            recipient_name=r.name if r else None, recipient_email=address, subject=out.subject, body_html=out.html,
            body_text=out.text, body_sha256=hashlib.sha256(out.html.encode()).hexdigest(),
            status="PREVU" if address else "SANS_ADRESSE", due_on=today, indicators=[], created_by="formulaire public du site",
        ))
        db.flush()  # référence suivante calculée sur la ligne ajoutée
        created += 1
    return created
