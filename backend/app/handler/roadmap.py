"""Feuille de route : tout ce qui a une échéance, de toutes les sources, rangé par semaine.

Rien n'est recalculé ici : chaque source garde son propre état (jalons des sessions, actions
correctives, titres des formateurs, démarches de financement, pièces du dossier qualité). La feuille
de route ne fait que les mettre sur une même ligne de temps, et chaque bloc n'apparaît que pour un
compte qui peut lire sa source.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.application.service.platform.features import is_enabled
from app.middleware.auth import DB, CurrentUser, permissions_of
from app.types import training as t
from app.types.auth import User
from app.types.qualiopi_capa import CapaAction
from app.types.qualiopi_evidence import Evidence
from app.types.qualiopi_schedule import MilestoneStatus

router = APIRouter(prefix="/api/v1", tags=["pilotage"])


def _state(due: date, today: date, warn_days: int = 7) -> str:
    if due < today:
        return "EN_RETARD"
    return "A_ECHEANCE" if (due - today).days <= warn_days else "A_VENIR"


def _item(source: str, due: date, today: date, title: str, detail: str, link: str | None,
          indicators: list[int] | None = None, state: str | None = None, person: dict | None = None) -> dict:
    """`person` : personne citée par l'échéance ({"nom", "photo_url"}), sinon None."""
    return {"source": source, "echeance": due.isoformat(), "semaine": (due - timedelta(days=due.weekday())).isoformat(),
            "etat": state or _state(due, today), "titre": title, "detail": detail, "lien": link,
            "indicateurs": indicators or [], "personne": person}


def _milestones(db: Session, today: date, horizon: date) -> list[dict]:
    q = (select(MilestoneStatus, t.TrainingSession.reference)
         .join(t.TrainingSession, t.TrainingSession.id == MilestoneStatus.session_id)
         .where(or_(MilestoneStatus.status.in_(("EN_RETARD", "A_ECHEANCE")),
                    (MilestoneStatus.status == "A_VENIR") & (MilestoneStatus.due_on <= horizon))))
    out = []
    for m, ref in db.execute(q):
        missing = ", ".join(x.get("who", "") for x in (m.missing or [])[:3])
        out.append(_item("SESSION", m.due_on, today, f"{m.label} · {ref}",
                         f"{m.done}/{m.total} fait" + (f" · manque {missing}" if missing else ""),
                         f"/formation/sessions/{m.session_id}", m.indicators, state=m.status))
    return out


def _capa(db: Session, today: date, horizon: date) -> list[dict]:
    rows = db.scalars(select(CapaAction).where(CapaAction.status.in_(("OUVERTE", "EN_COURS", "A_VERIFIER")),
                                               CapaAction.due_on <= horizon))
    return [_item("ACTION", a.due_on, today, f"{a.reference} · {a.title}",
                  f"Action corrective · {a.owner_name or 'responsable à désigner'}", "/qualiopi/capa") for a in rows]


def _titles(db: Session, today: date, horizon: date) -> list[dict]:
    rows = db.execute(select(t.TrainerQualification, t.Trainer)
                      .join(t.Trainer, t.Trainer.id == t.TrainerQualification.trainer_id)
                      .where(t.TrainerQualification.valid_until.is_not(None), t.TrainerQualification.valid_until <= horizon))
    return [_item("TITRE", q.valid_until, today, f"{q.label} · {tr.full_name}",
                  "Titre du formateur expiré" if q.valid_until < today else "Titre du formateur à renouveler",
                  "/rh/qualifications", [21], state="EN_RETARD" if q.valid_until < today else None,
                  person={"nom": tr.full_name, "photo_url": tr.photo_url}) for q, tr in rows]


def _funding(db: Session, today: date, horizon: date) -> list[dict]:
    from app.application.service.funding.service import deadlines

    return [_item("FINANCEMENT", date.fromisoformat(d["echeance"]), today, f"{d['libelle']} · {d['stagiaire']}",
                  f"{d['dispositif']} · {d['session']}" + (f" · {d['portail']}" if d.get("portail") else ""),
                  "/commercial/financeurs",  # état selon la date, comme les autres sources
                  person={"nom": d["stagiaire"], "photo_url": d.get("stagiaire_photo_url")})
            for d in deadlines(db, today, (horizon - today).days)]


def _evidence(db: Session, today: date, horizon: date) -> list[dict]:
    rows = db.scalars(select(Evidence).where(Evidence.status == "VALIDEE", Evidence.valid_until.is_not(None),
                                             Evidence.valid_until <= horizon))
    return [_item("PREUVE", e.valid_until, today, f"{e.reference} · {e.label}", "Preuve validée qui expire : à renouveler",
                  "/qualiopi/preuves") for e in rows]


def roadmap(db: Session, user: User, weeks: int, today: date | None = None) -> dict:
    today = today or date.today()
    horizon = today + timedelta(weeks=weeks)
    perms = permissions_of(db, user)
    items: list[dict] = []
    sources = []
    if "quality.read" in perms:
        items += _milestones(db, today, horizon) + _capa(db, today, horizon) + _evidence(db, today, horizon)
        sources += ["SESSION", "ACTION", "PREUVE"]
    if "staff.read" in perms:
        items += _titles(db, today, horizon)
        sources.append("TITRE")
    if "funding.read" in perms and is_enabled(db, "funding"):
        items += _funding(db, today, horizon)
        sources.append("FINANCEMENT")
    order = {"EN_RETARD": 0, "A_ECHEANCE": 1, "A_VENIR": 2}
    items.sort(key=lambda i: (order.get(i["etat"], 3), i["echeance"]))
    return {"aujourd_hui": today.isoformat(), "jusqu_au": horizon.isoformat(), "sources": sources, "elements": items}


@router.get("/pilotage/feuille-de-route")
def get_roadmap(db: DB, user: CurrentUser, semaines: int = Query(6, ge=1, le=26)) -> dict:
    """Ce qui est en retard, puis semaine par semaine jusqu'à `semaines` semaines."""
    return roadmap(db, user, semaines)
