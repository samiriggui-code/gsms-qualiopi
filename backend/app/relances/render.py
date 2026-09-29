"""Rendu des e-mails : registre versionné des modèles (config/emails) et rendu HTML + texte.

Le modèle ne fait que présenter : toute la logique (qui, quand, quoi) est dans le planificateur, qui
lui passe des données prêtes à afficher. Changer un modèle = monter sa version, gardée dans le journal.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from app.core.config import BACKEND_DIR

EMAILS_DIR = BACKEND_DIR / "config" / "emails"


@dataclass(frozen=True)
class Template:
    version: int
    sujet: str  # gabarit Jinja d'une ligne
    pourquoi: str  # « pourquoi je reçois ce message », en tête


TEMPLATES: dict[str, Template] = {
    "convention_a_signer": Template(1, "{{ 'Relance : ' if relance else '' }}{{ document|capitalize }} à signer — {{ formation }} ({{ session.debut }})",
                                    "Vous êtes signataire d'une inscription à une formation."),
    "rappel_session": Template(1, "Votre formation {{ formation }} commence le {{ session.debut }}",
                               "Vous êtes inscrit(e) à cette formation."),
    "recapitulatif_formateur": Template(2, "Session {{ session.reference }} : récapitulatif avant le démarrage",
                                        "Vous êtes le formateur de cette session."),
    "evaluations_manquantes": Template(1, "Session {{ session.reference }} : évaluations des acquis à saisir",
                                       "Vous êtes le formateur de cette session."),
    "alerte_jalon": Template(2, "{{ '[En retard]' if jalon.en_retard else '[À échéance]' }} {{ jalon.libelle }} — {{ session.reference }}",
                             "Vous êtes responsable de ce jalon dans l'échéancier des sessions."),
    "synthese_qualite": Template(1, "Synthèse qualité du {{ date }}",
                                 "Vous suivez la préparation Qualiopi de l'organisme."),
}

_env = Environment(loader=FileSystemLoader(EMAILS_DIR), autoescape=select_autoescape(["html"]),
                   undefined=StrictUndefined, trim_blocks=True, lstrip_blocks=True)
_subject_env = Environment(autoescape=False, undefined=StrictUndefined)


@dataclass(frozen=True)
class Rendered:
    subject: str
    html: str
    text: str
    version: int


def _to_text(body: str) -> str:
    """Version texte (clients qui n'affichent pas le HTML) : le contenu, sans la mise en forme."""
    body = re.sub(r"(?is)<(style|title)[^>]*>.*?</\1>", "", body)
    body = re.sub(r'(?is)<span style="display:none[^>]*>.*?</span>', "", body)
    body = re.sub(r"(?i)<br\s*/?>|</p>|</li>|</tr>|</div>", "\n", body)
    body = re.sub(r"(?i)<li[^>]*>", "- ", body)
    body = re.sub(r'(?i)<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', r"\2 : \1", body)
    body = html.unescape(re.sub(r"<[^>]+>", " ", body))
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in body.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip() + "\n"


def render(key: str, context: dict) -> Rendered:
    tpl = TEMPLATES[key]
    subject = " ".join(_subject_env.from_string(tpl.sujet).render(**context).split())
    if context.get("relance") and not subject.startswith("Relance"):
        subject = f"Relance : {subject}"
    subject = subject[:300]
    values = {"action": None, "apercu": subject} | context | {"sujet": subject, "pourquoi": tpl.pourquoi}
    body = _env.get_template(f"{key}.html").render(**values)
    return Rendered(subject=subject, html=body, text=_to_text(body), version=tpl.version)
