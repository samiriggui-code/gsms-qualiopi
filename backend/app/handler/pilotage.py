"""Pilotage : planning des sessions et bilans (inventaire des rapports, aide au bilan pédagogique et financier)."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.application.service.pilotage import bpf, planning
from app.middleware.auth import DB, AllSessionsReader, CurrentUser, SessionsReader, permissions_of

router = APIRouter(prefix="/api/v1", tags=["pilotage"])


@router.get("/planning")
def get_planning(db: DB, user: SessionsReader, du: date | None = None, au: date | None = None,
                 formateur: Annotated[str | None, Query(max_length=36)] = None,
                 lieu: Annotated[str | None, Query(max_length=200)] = None,
                 programme: Annotated[str | None, Query(max_length=36)] = None, annulees: bool = False) -> dict:
    """Créneaux des sessions visibles du `du` au `au` (93 jours au plus ; par défaut 31 jours à partir d'aujourd'hui),
    avec les conflits de formateur ou de salle signalés pour information."""
    start, end = planning.period(du, au)
    return planning.planning(db, user, start, end, formateur=formateur, lieu=lieu, programme=programme, annulees=annulees)


# Rapports que l'API sait produire : (code, intitulé, route, nature, permissions dont une suffit ; vide = tout compte).
REPORTS = (
    ("carnet_qualiopi", "Carnet d'audit Qualiopi (une fiche par indicateur)", "/api/v1/qualiopi/carnet", "LECTURE",
     ("quality.read",)),
    ("carnet_impression", "Carnet d'audit à imprimer (HTML A4)", "/api/v1/qualiopi/carnet/impression", "IMPRESSION",
     ("quality.read",)),
    ("etat_indicateurs", "État de préparation par indicateur", "/api/v1/qualiopi/evaluations", "LECTURE", ("quality.read",)),
    ("feuille_de_route", "Feuille de route (échéances par semaine)", "/api/v1/pilotage/feuille-de-route", "LECTURE", ()),
    ("synthese_parcours", "Synthèse du parcours apprenant", "/api/v1/parcours/synthese", "LECTURE",
     ("sessions.read", "sessions.read_own")),
    ("evaluations_acquis", "Évaluations des acquis et résultats de certification", "/api/v1/evaluations-acquis", "LECTURE",
     ("sessions.read", "sessions.read_own")),
    ("resultats_formations", "Taux de réussite et de satisfaction mesurés par formation", "/api/v1/formation/resultats",
     "LECTURE", ("sessions.read", "quality.read")),
    ("synthese_documents", "Synthèse des documents professionnels (devis…)", "/api/v1/editions/synthese", "LECTURE",
     ("documents.read",)),
    ("aide_bpf", "Aide au bilan pédagogique et financier (ne produit pas le BPF)", "/api/v1/bilans/bpf", "AIDE",
     ("sessions.read",)),
)


@router.get("/bilans")
def reports(db: DB, user: CurrentUser) -> dict:
    """Bilans et rapports que l'API produit, avec pour chacun s'il est accessible à ce compte."""
    perms = permissions_of(db, user)
    return {"rapports": [{"code": code, "intitule": label, "route": route, "nature": kind,
                          "disponible": not needs or bool(perms & set(needs)), "permissions": list(needs)}
                         for code, label, route, kind, needs in REPORTS]}


@router.get("/bilans/bpf")
def bpf_help(db: DB, user: AllSessionsReader, exercice: Annotated[int, Query(ge=2000, le=2100)]) -> dict:
    """Aide au BPF d'un exercice (année civile) : ce qui se compte avec les données de GSMS, et pour chaque cadre du
    cerfa ce qui ne se calcule pas. Indications financières seulement avec la permission `funding.read`."""
    return bpf.bpf(db, exercice, with_finance="funding.read" in permissions_of(db, user))
