"""Planning : les créneaux des sessions sur une période bornée, prêts pour un calendrier.

Un créneau est une demi-journée d'émargement quand la session en a ; sinon la session entière (ses dates). Les
conflits (même formateur ou même salle sur deux créneaux qui se chevauchent) sont une information calculée : rien
n'est bloqué ici, la personne qui planifie décide.

Portée : celle des sessions (`training_scope`). Un formateur qui n'a que `sessions.read_own` ne voit que ses
sessions, et les conflits ne sont cherchés qu'entre créneaux qu'il voit : on ne révèle rien d'une session hors portée.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.application.access.training_scope import own_trainer_ids, sees_all
from app.errors.errors import InvalidStateError
from app.types import training as t
from app.types.auth import User

MAX_DAYS = 93  # un trimestre : au-delà, la requête est refusée (bornes de la période)
DEFAULT_DAYS = 31
# Demi-journée sans horaires enregistrés : bornes larges, le conflit éventuel est alors « à vérifier ».
PERIOD_BOUNDS = {"MATIN": (time(0, 0), time(12, 0)), "APRES_MIDI": (time(12, 0), time(23, 59, 59))}


def period(du: date | None, au: date | None, today: date | None = None) -> tuple[date, date]:
    start = du or today or date.today()
    end = au or start + timedelta(days=DEFAULT_DAYS - 1)
    if end < start:
        raise InvalidStateError("La fin de la période précède son début")
    if (end - start).days + 1 > MAX_DAYS:
        raise InvalidStateError(f"Période trop longue : {MAX_DAYS} jours au plus")
    return start, end


def _norm(value: str | None) -> str:
    return " ".join((value or "").split()).casefold()


def _base(s: t.TrainingSession) -> dict:
    return {
        "session": {"id": s.id, "reference": s.reference, "statut": s.status},
        "programme": {"id": s.program_id, "code": s.program_code, "intitule": s.program_title},
        "formateur": {"id": s.trainer_id, "nom": s.trainer_name} if s.trainer_id else None,
        "lieu": s.location, "salle": s.room,
        "effectif": s.learners_count, "capacite": s.capacity,
    }


def _slot(s: t.TrainingSession, sl: t.AttendanceSlot) -> dict:
    known = sl.start_time is not None and sl.end_time is not None
    lo, hi = (sl.start_time, sl.end_time) if known else PERIOD_BOUNDS.get(sl.period, (time(0, 0), time(23, 59, 59)))
    return _base(s) | {
        "id": sl.id, "type": "DEMI_JOURNEE", "debut": sl.day.isoformat(), "fin": sl.day.isoformat(),
        "periode": sl.period, "heure_debut": sl.start_time.strftime("%H:%M") if sl.start_time else None,
        "heure_fin": sl.end_time.strftime("%H:%M") if sl.end_time else None,
        "_de": datetime.combine(sl.day, lo), "_a": datetime.combine(sl.day, hi), "_horaires": known,
    }


def _whole(s: t.TrainingSession) -> dict:
    return _base(s) | {
        "id": f"session:{s.id}", "type": "SESSION", "debut": s.start_date.isoformat(), "fin": s.end_date.isoformat(),
        "periode": None, "heure_debut": None, "heure_fin": None,
        "_de": datetime.combine(s.start_date, time(0, 0)),
        "_a": datetime.combine(s.end_date + timedelta(days=1), time(0, 0)), "_horaires": False,
    }


def _conflicts(slots: list[dict]) -> list[dict]:
    """Paires de créneaux de sessions différentes qui se chevauchent sur un même formateur ou une même salle."""
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for c in slots:
        if c["session"]["statut"] == "ANNULEE":
            continue
        if c["formateur"]:
            groups[("FORMATEUR", c["formateur"]["id"])].append(c)
        if _norm(c["salle"]):
            groups[("SALLE", f"{_norm(c['lieu'])}|{_norm(c['salle'])}")].append(c)
    found = []
    for (kind, _), items in groups.items():
        items.sort(key=lambda c: c["_de"])
        for i, a in enumerate(items):
            for b in items[i + 1:]:
                if b["_de"] >= a["_a"]:
                    break
                if a["session"]["id"] == b["session"]["id"]:
                    continue
                found.append({
                    "type": kind, "creneaux": [a["id"], b["id"]],
                    "sessions": [a["session"]["reference"], b["session"]["reference"]],
                    "ressource": (a["formateur"]["nom"] if kind == "FORMATEUR"
                                  else " · ".join(x for x in (a["lieu"], a["salle"]) if x)),
                    "le": max(a["_de"], b["_de"]).date().isoformat(),
                    # Horaires connus des deux côtés : chevauchement certain ; sinon à vérifier.
                    "certitude": "CERTAIN" if a["_horaires"] and b["_horaires"] else "A_VERIFIER",
                })
    found.sort(key=lambda f: (f["le"], f["type"]))
    return found


def planning(db: Session, user: User, du: date, au: date, formateur: str | None = None, lieu: str | None = None,
             programme: str | None = None, annulees: bool = False) -> dict:
    q = (select(t.TrainingSession).where(t.TrainingSession.start_date <= au, t.TrainingSession.end_date >= du)
         .options(selectinload(t.TrainingSession.program), selectinload(t.TrainingSession.trainer),
                  selectinload(t.TrainingSession.enrollments))
         .order_by(t.TrainingSession.start_date))
    if not sees_all(db, user):  # formateur : ses propres sessions (portée « read_own »)
        q = q.where(t.TrainingSession.trainer_id.in_(own_trainer_ids(db, user)))
    if not annulees:
        q = q.where(t.TrainingSession.status != "ANNULEE")
    sessions = list(db.scalars(q))
    with_slots: dict[str, list[t.AttendanceSlot]] = defaultdict(list)
    if sessions:
        ids = [s.id for s in sessions]
        for sl in db.scalars(select(t.AttendanceSlot).where(t.AttendanceSlot.session_id.in_(ids))):
            with_slots[sl.session_id].append(sl)
    slots: list[dict] = []
    for s in sessions:
        own = with_slots.get(s.id)
        if own:
            slots += [_slot(s, sl) for sl in own if du <= sl.day <= au]
        else:  # pas encore de demi-journées : la session entière
            slots.append(_whole(s))
    conflicts = _conflicts(slots)  # sur tout ce que l'utilisateur voit, avant les filtres d'affichage
    by_slot: dict[str, list[dict]] = defaultdict(list)
    for f in conflicts:
        for cid in f["creneaux"]:
            by_slot[cid].append(f)

    def keep(c: dict) -> bool:
        return ((not formateur or (c["formateur"] or {}).get("id") == formateur)
                and (not programme or c["programme"]["id"] == programme)
                and (not lieu or _norm(lieu) in _norm(c["lieu"]) or _norm(lieu) in _norm(c["salle"])))

    shown = sorted((c for c in slots if keep(c)), key=lambda c: (c["_de"], c["session"]["reference"]))
    shown_ids = {c["id"] for c in shown}
    out = []
    for c in shown:
        row = {k: v for k, v in c.items() if not k.startswith("_")}
        row["conflits"] = [{"type": f["type"], "avec": next(x for x in f["creneaux"] if x != c["id"]),
                            "sessions": f["sessions"], "certitude": f["certitude"]} for f in by_slot.get(c["id"], [])]
        out.append(row)
    listed = [f for f in conflicts if shown_ids & set(f["creneaux"])]
    # Valeurs proposées aux filtres : seulement ce que l'utilisateur voit sur la période.
    trainers = {c["formateur"]["id"]: c["formateur"]["nom"] for c in slots if c["formateur"]}
    programs = {c["programme"]["id"]: c["programme"]["intitule"] for c in slots}
    places = sorted({c["lieu"] for c in slots if c["lieu"]})
    return {
        "du": du.isoformat(), "au": au.isoformat(),
        "compteurs": {"creneaux": len(out), "sessions": len({c["session"]["id"] for c in out}), "conflits": len(listed)},
        "creneaux": out, "conflits": listed,
        "filtres": {"formateurs": [{"id": k, "nom": v} for k, v in sorted(trainers.items(), key=lambda x: x[1] or "")],
                    "programmes": [{"id": k, "intitule": v} for k, v in sorted(programs.items(), key=lambda x: x[1] or "")],
                    "lieux": places},
        "avertissement": "Les conflits sont signalés pour information : rien n'est bloqué. « À vérifier » : au moins un "
                         "des deux créneaux n'a pas d'horaires enregistrés.",
    }
