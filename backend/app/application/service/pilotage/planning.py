"""Planning : les créneaux des sessions sur une période bornée, prêts pour un calendrier.

Un créneau est une demi-journée d'émargement quand la session en a ; sinon la session entière (ses dates). Les
conflits (même formateur ou même salle sur deux créneaux qui se chevauchent) sont une information calculée : rien
n'est bloqué ici, la personne qui planifie décide.

Portée : celle des sessions (`training_scope`). Un formateur qui n'a que `sessions.read_own` ne voit que ses
sessions, et les conflits ne sont cherchés qu'entre créneaux qu'il voit : on ne révèle rien d'une session hors portée.

Pilotage (26/10/2026) : par session, le remplissage, la salle rapprochée des lieux (`Premises`, par le nom de la salle
et du site, comme la démo l'écrit), les jalons de l'échéancier tels que le moteur les a évalués (`milestone_status`,
aucun recalcul ici) et des alertes calculées une fois pour toutes ici (le front les affiche, il ne les recalcule pas).
Les alertes informent, elles ne bloquent rien et ne prononcent aucune conformité.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.application.access.attendance import expected_enrollments, recorded, signature_of
from app.application.access.training_scope import own_trainer_ids, sees_all
from app.errors.errors import InvalidStateError
from app.types import training as t
from app.types.auth import User
from app.types.qualiopi_schedule import MilestoneStatus

MAX_DAYS = 93  # un trimestre : au-delà, la requête est refusée (bornes de la période)
DEFAULT_DAYS = 31
# Demi-journée sans horaires enregistrés : bornes larges, le conflit éventuel est alors « à vérifier ».
PERIOD_BOUNDS = {"MATIN": (time(0, 0), time(12, 0)), "APRES_MIDI": (time(12, 0), time(23, 59, 59))}
# Titre « à renouveler » s'il expire dans les N jours qui suivent le dernier créneau affiché (même valeur par défaut que
# le contrôle Qualiopi des qualifications, `expiring_days`). Information, pas une règle.
TITLE_SOON_DAYS = 60
SEVERITIES = ("HAUTE", "MOYENNE", "BASSE")
# Sessions qui ne se tiennent plus : pas d'alerte de préparation (formateur, salle) ni d'émargement.
DONE_STATES = ("ANNULEE", "CLOTUREE")
PERIOD_LABELS = {"MATIN": "matin", "APRES_MIDI": "après-midi"}


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
        "programme": {"id": s.program_id, "code": s.program_code, "intitule": s.program_title, "image_url": s.program_image_url},
        "formateur": {"id": s.trainer_id, "nom": s.trainer_name, "photo_url": s.trainer_photo_url} if s.trainer_id else None,
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
        "_de": datetime.combine(sl.day, lo), "_a": datetime.combine(sl.day, hi), "_horaires": known, "_slot": sl,
    }


def _whole(s: t.TrainingSession) -> dict:
    return _base(s) | {
        "id": f"session:{s.id}", "type": "SESSION", "debut": s.start_date.isoformat(), "fin": s.end_date.isoformat(),
        "periode": None, "heure_debut": None, "heure_fin": None,
        "_de": datetime.combine(s.start_date, time(0, 0)),
        "_a": datetime.combine(s.end_date + timedelta(days=1), time(0, 0)), "_horaires": False, "_slot": None,
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


def _fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def _rooms(db: Session) -> tuple[dict[str, list[t.Premises]], dict[str, str]]:
    """Salles des lieux (tout sauf les sites) par nom normalisé, et nom de chaque lieu par identifiant."""
    rows = list(db.scalars(select(t.Premises)))
    by_name: dict[str, list[t.Premises]] = defaultdict(list)
    for p in rows:
        if p.kind != "SITE":
            by_name[_norm(p.name)].append(p)
    return by_name, {p.id: p.name for p in rows}


def _match_room(s: t.TrainingSession, by_name: dict[str, list[t.Premises]], names: dict[str, str]) -> t.Premises | None:
    """La salle de la session parmi les lieux : même nom, et même site quand la session et la salle en indiquent un.
    Plusieurs candidates ou aucune : pas de rapprochement (rien n'est deviné)."""
    if not _norm(s.room):
        return None
    found = [p for p in by_name.get(_norm(s.room), [])
             if not p.parent_id or not _norm(s.location) or _norm(names.get(p.parent_id)) == _norm(s.location)]
    return found[0] if len(found) == 1 else None


def _room_view(p: t.Premises | None) -> dict | None:
    return {"id": p.id, "code": p.code, "nom": p.name, "capacite": p.capacity} if p is not None else None


def _milestone(m: MilestoneStatus) -> dict:
    return {"cle": m.key, "libelle": m.label, "echeance": m.due_on.isoformat(), "etat": m.status, "fait": m.done,
            "total": m.total, "responsable": m.owner, "indicateurs": m.indicators, "explication": m.explanation}


def _link(target: str, ident: str | None, tab: str | None = None) -> dict:
    """Cible d'une alerte : le front la traduit en écran (fiche session, émargement, formateur, lieux)."""
    return {"cible": target, "id": ident, "onglet": tab}


def _days(c: dict, du: date, au: date) -> list[date]:
    """Jours couverts par un créneau, bornés à la période (une session entière couvre plusieurs jours)."""
    lo, hi = max(date.fromisoformat(c["debut"]), du), min(date.fromisoformat(c["fin"]), au)
    return [lo + timedelta(days=i) for i in range((hi - lo).days + 1)]


def _latest_titles(quals: list[t.TrainerQualification]) -> list[t.TrainerQualification]:
    """Le titre le plus récent de chaque type (un titre renouvelé remplace l'ancien) ; « diplôme » et « autre » se
    distinguent par leur libellé. Un titre sans date de fin n'expire pas."""
    best: dict[tuple[str, str], t.TrainerQualification] = {}
    for q in quals:
        key = (q.kind, _norm(q.label) if q.kind in ("DIPLOME", "AUTRE") else "")
        cur = best.get(key)
        if cur is None or (cur.valid_until is not None and (q.valid_until is None or q.valid_until > cur.valid_until)):
            best[key] = q
    return [q for q in best.values() if q.valid_until is not None]


def _alerts(s: t.TrainingSession, mine: list[dict], room: t.Premises | None, milestones: list[MilestoneStatus],
            quals: list[t.TrainerQualification], today: date, du: date, au: date) -> list[dict]:
    """Alertes d'une session (hors conflits, calculés à part) sur ses créneaux affichés. Chaque alerte dit ce qui est
    constaté et où agir ; aucune ne bloque."""
    if s.status == "ANNULEE":
        return []
    out: list[dict] = []
    ids = [c["id"] for c in mine]
    ref = {"id": s.id, "reference": s.reference}

    def add(code: str, gravite: str, message: str, link: dict, creneaux: list[str] | None = None,
            le: date | None = None, extra: str = "") -> None:
        out.append({"id": ":".join(x for x in (code, s.id, extra) if x), "code": code, "gravite": gravite,
                    "message": message, "le": (le or max(s.start_date, du)).isoformat(), "sessions": [ref],
                    "creneaux": creneaux if creneaux is not None else ids, "lien": link})

    inscrits = s.learners_count
    if s.capacity is not None and inscrits > s.capacity:
        add("SURCAPACITE_SESSION", "HAUTE", f"{inscrits} inscrits pour {s.capacity} places prévues.",
            _link("SESSION", s.id, "inscriptions"))
    if room is not None and room.capacity is not None:
        if inscrits > room.capacity:
            add("SURCAPACITE_SALLE", "HAUTE", f"{inscrits} inscrits pour une salle de {room.capacity} places ({room.name}).",
                _link("SALLE", room.id))
        elif s.capacity is not None and s.capacity > room.capacity:
            add("CAPACITE_SALLE", "BASSE", f"Capacité prévue ({s.capacity}) supérieure à celle de la salle "
                                          f"({room.capacity} places, {room.name}).", _link("SALLE", room.id))
    upcoming = s.end_date >= today and s.status not in DONE_STATES
    if upcoming and not s.trainer_id:
        add("SANS_FORMATEUR", "MOYENNE", "Aucun formateur affecté.", _link("SESSION", s.id))
    if upcoming and not _norm(s.room):
        if _norm(s.location):
            add("SANS_SALLE", "BASSE", f"Salle non précisée (lieu : {s.location}).", _link("SESSION", s.id))
        else:
            add("SANS_SALLE", "MOYENNE", "Ni lieu ni salle renseignés.", _link("SESSION", s.id))

    # Titres du formateur à la date de chaque créneau.
    if s.trainer_id and s.status not in DONE_STATES:
        name = s.trainer_name or "Le formateur"
        last = max((d for c in mine for d in _days(c, du, au)), default=None)
        for q in _latest_titles(quals):
            late = [c for c in mine if max(_days(c, du, au), default=date.min) > q.valid_until]
            if late:
                first = min(date.fromisoformat(c["debut"]) for c in late)
                add("TITRE_EXPIRE", "HAUTE", f"{name} : « {q.label} » expiré le {_fmt(q.valid_until)}, "
                                            f"{len(late)} créneau(x) après cette date.",
                    _link("FORMATEUR", s.trainer_id), [c["id"] for c in late], max(first, du), q.id)
            elif last and last >= today and q.valid_until <= last + timedelta(days=TITLE_SOON_DAYS):
                add("TITRE_A_RENOUVELER", "BASSE", f"{name} : « {q.label} » expire le {_fmt(q.valid_until)}, "
                                                  f"moins de {TITLE_SOON_DAYS} jours après le dernier créneau.",
                    _link("FORMATEUR", s.trainer_id), extra=q.id)

    # Émargement des demi-journées passées (feuilles existantes) ; sans demi-journées, la session entière.
    if s.status not in DONE_STATES:
        missing, unchecked = [], []
        for c in mine:
            sl = c["_slot"]
            if sl is None or sl.day >= today:
                continue
            expected = expected_enrollments(sl)
            if not expected:
                continue
            gaps = sum(1 for e in expected if not recorded(signature_of(sl, e.id)))
            if gaps:
                missing.append((c, gaps, len(expected)))
            elif sl.trainer_signed_at is None:
                unchecked.append(c)
        if missing:
            detail = ", ".join(f"{_fmt(c['_slot'].day)} {PERIOD_LABELS.get(c['periode'], '')} ({n} sur {m})"
                               for c, n, m in missing[:4])
            more = f" et {len(missing) - 4} autre(s)" if len(missing) > 4 else ""
            add("EMARGEMENT_NON_TENU", "HAUTE", f"{len(missing)} demi-journée(s) passée(s) avec des présences non "
                                               f"renseignées : {detail}{more}.",
                _link("EMARGEMENT", s.id), [c["id"] for c, _, _ in missing], date.fromisoformat(missing[0][0]["debut"]))
        if unchecked:
            add("EMARGEMENT_NON_CONTRE_VALIDE", "MOYENNE", f"{len(unchecked)} demi-journée(s) passée(s) renseignée(s) "
                                                          "mais pas encore contre-validée(s) par le formateur.",
                _link("EMARGEMENT", s.id), [c["id"] for c in unchecked], date.fromisoformat(unchecked[0]["debut"]))
        whole = [c for c in mine if c["_slot"] is None]
        if whole and s.start_date < today and inscrits:
            add("EMARGEMENT_NON_PREPARE", "MOYENNE", "Session commencée sans demi-journées d'émargement préparées.",
                _link("EMARGEMENT", s.id))

    late_steps = [m for m in milestones if m.status == "EN_RETARD"]
    if late_steps:
        add("ECHEANCE_EN_RETARD", "MOYENNE", f"{len(late_steps)} jalon(s) de l'échéancier en retard : "
                                            f"{', '.join(m.label for m in late_steps[:3])}"
                                            f"{' …' if len(late_steps) > 3 else ''}.",
            _link("SESSION", s.id, "parcours"), le=min(m.due_on for m in late_steps))
    return out


def _conflict_alert(f: dict, by_id: dict[str, dict], rooms: dict[str, t.Premises | None]) -> dict:
    a, b = (by_id[x] for x in f["creneaux"])
    kind = f["type"]
    what = "formateur" if kind == "FORMATEUR" else "salle"
    sure = f["certitude"] == "CERTAIN"
    room = rooms.get(a["session"]["id"])
    link = (_link("FORMATEUR", a["formateur"]["id"]) if kind == "FORMATEUR"
            else _link("SALLE", room.id) if room is not None else _link("SESSION", a["session"]["id"]))
    return {
        "id": f"CONFLIT_{kind}:{':'.join(sorted(f['creneaux']))}", "code": f"CONFLIT_{kind}",
        "gravite": "HAUTE" if sure else "MOYENNE",
        "message": (f"Même {what} ({f['ressource'] or '—'}) le {_fmt(date.fromisoformat(f['le']))} pour "
                    f"{' et '.join(f['sessions'])}" + ("." if sure else " : horaires à vérifier.")),
        "le": f["le"], "sessions": [{"id": c["session"]["id"], "reference": c["session"]["reference"]} for c in (a, b)],
        "creneaux": list(f["creneaux"]), "lien": link,
    }


def _occupation(shown: list[dict], du: date, au: date) -> dict:
    """Ressources : par formateur et par salle, nombre de créneaux et sessions de chaque jour de la période."""
    def group(key, head) -> list[dict]:  # noqa: ANN001
        rows: dict = {}
        for c in shown:
            k = key(c)
            row = rows.setdefault(k, head(c) | {"creneaux": 0, "_jours": defaultdict(lambda: {"creneaux": 0, "sessions": []})})
            row["creneaux"] += 1
            for d in _days(c, du, au):
                cell = row["_jours"][d.isoformat()]
                cell["creneaux"] += 1
                if c["session"]["reference"] not in cell["sessions"]:
                    cell["sessions"].append(c["session"]["reference"])
        out = []
        for row in rows.values():
            jours = row.pop("_jours")
            out.append(row | {"jours": [{"jour": d} | v for d, v in sorted(jours.items())]})
        return out

    trainers = group(lambda c: (c["formateur"] or {}).get("id"),
                     lambda c: {"id": c["formateur"]["id"], "nom": c["formateur"]["nom"], "photo_url": c["formateur"]["photo_url"]}
                     if c["formateur"] else {"id": None, "nom": None, "photo_url": None})
    rooms = group(lambda c: f"{_norm(c['lieu'])}|{_norm(c['salle'])}" if _norm(c["salle"]) else None,
                  lambda c: {"cle": f"{_norm(c['lieu'])}|{_norm(c['salle'])}" if _norm(c["salle"]) else None,
                             "lieu": c["lieu"], "salle": c["salle"] if _norm(c["salle"]) else None,
                             "salle_lieu": _room_view(c["_room"])})
    trainers.sort(key=lambda r: (r["id"] is None, r["nom"] or ""))
    rooms.sort(key=lambda r: (r["cle"] is None, r["lieu"] or "", r["salle"] or ""))
    return {"formateurs": trainers, "salles": rooms}


def planning(db: Session, user: User, du: date, au: date, formateur: str | None = None, lieu: str | None = None,
             programme: str | None = None, annulees: bool = False, today: date | None = None) -> dict:
    today = today or date.today()
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
        for sl in db.scalars(select(t.AttendanceSlot).where(t.AttendanceSlot.session_id.in_(ids))
                             .options(selectinload(t.AttendanceSlot.signatures))):
            with_slots[sl.session_id].append(sl)
    by_name, place_names = _rooms(db)
    room_of = {s.id: _match_room(s, by_name, place_names) for s in sessions}
    slots: list[dict] = []
    for s in sessions:
        own = with_slots.get(s.id)
        if own:
            slots += [_slot(s, sl) for sl in own if du <= sl.day <= au]
        else:  # pas encore de demi-journées : la session entière
            slots.append(_whole(s))
    for c in slots:
        c["_room"] = room_of[c["session"]["id"]]
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
    listed = [f for f in conflicts if shown_ids & set(f["creneaux"])]

    # Sessions affichées : remplissage, salle rapprochée, échéancier évalué par le moteur, alertes.
    shown_sessions = [s for s in sessions if any(c["session"]["id"] == s.id for c in shown)]
    sids = [s.id for s in shown_sessions]
    steps: dict[str, list[MilestoneStatus]] = defaultdict(list)
    titles: dict[str, list[t.TrainerQualification]] = defaultdict(list)
    if sids:
        for m in db.scalars(select(MilestoneStatus).where(MilestoneStatus.session_id.in_(sids))
                            .order_by(MilestoneStatus.due_on, MilestoneStatus.key)):
            steps[m.session_id].append(m)
        trainer_ids = {s.trainer_id for s in shown_sessions if s.trainer_id}
        if trainer_ids:
            for qual in db.scalars(select(t.TrainerQualification).where(t.TrainerQualification.trainer_id.in_(trainer_ids))):
                titles[qual.trainer_id].append(qual)
    by_id = {c["id"]: c for c in slots}
    alerts = [_conflict_alert(f, by_id, room_of) for f in listed]
    session_views = []
    for s in shown_sessions:
        mine = [c for c in shown if c["session"]["id"] == s.id]
        own_alerts = _alerts(s, mine, room_of[s.id], steps[s.id], titles.get(s.trainer_id or "", []), today, du, au)
        alerts += own_alerts
        evaluated = max((m.evaluated_at for m in steps[s.id]), default=None)
        session_views.append({
            "id": s.id, "reference": s.reference, "statut": s.status, "debut": s.start_date.isoformat(),
            "fin": s.end_date.isoformat(),
            "formation": {"id": s.program_id, "code": s.program_code, "intitule": s.program_title, "image_url": s.program_image_url},
            "formateur": {"id": s.trainer_id, "nom": s.trainer_name, "photo_url": s.trainer_photo_url} if s.trainer_id else None,
            "lieu": s.location, "salle": s.room, "salle_lieu": _room_view(room_of[s.id]),
            "capacite": s.capacity, "inscrits": s.learners_count,
            "places_restantes": max(s.capacity - s.learners_count, 0) if s.capacity is not None else None,
            "echeances": [_milestone(m) for m in steps[s.id]],
            "echeances_evaluees_le": evaluated.isoformat() if evaluated else None,
        })
    rank = {g: i for i, g in enumerate(SEVERITIES)}
    alerts.sort(key=lambda a: (rank[a["gravite"]], a["le"], a["code"], a["id"]))
    per_slot: dict[str, list[dict]] = defaultdict(list)
    per_session: dict[str, list[str]] = defaultdict(list)
    for a in alerts:
        for cid in a["creneaux"]:
            per_slot[cid].append(a)
        for x in a["sessions"]:
            per_session[x["id"]].append(a["id"])
    for v in session_views:
        v["alertes"] = per_session.get(v["id"], [])

    out = []
    for c in shown:
        row = {k: v for k, v in c.items() if not k.startswith("_")}
        row["conflits"] = [{"type": f["type"], "avec": next(x for x in f["creneaux"] if x != c["id"]),
                            "sessions": f["sessions"], "certitude": f["certitude"]} for f in by_slot.get(c["id"], [])]
        row["salle_lieu"] = _room_view(c["_room"])
        mine = per_slot.get(c["id"], [])
        row["alertes"] = [a["id"] for a in mine]
        row["alerte_max"] = mine[0]["gravite"] if mine else None  # alertes triées par gravité
        out.append(row)
    # Valeurs proposées aux filtres : seulement ce que l'utilisateur voit sur la période.
    trainers = {c["formateur"]["id"]: c["formateur"]["nom"] for c in slots if c["formateur"]}
    programs = {c["programme"]["id"]: c["programme"]["intitule"] for c in slots}
    places = sorted({c["lieu"] for c in slots if c["lieu"]})
    return {
        "du": du.isoformat(), "au": au.isoformat(), "aujourd_hui": today.isoformat(),
        "compteurs": {"creneaux": len(out), "sessions": len({c["session"]["id"] for c in out}), "conflits": len(listed),
                      "alertes": len(alerts),
                      "alertes_par_gravite": {g: sum(1 for a in alerts if a["gravite"] == g) for g in SEVERITIES}},
        "creneaux": out, "conflits": listed, "sessions": session_views, "alertes": alerts,
        "ressources": _occupation(shown, du, au),
        "filtres": {"formateurs": [{"id": k, "nom": v} for k, v in sorted(trainers.items(), key=lambda x: x[1] or "")],
                    "programmes": [{"id": k, "intitule": v} for k, v in sorted(programs.items(), key=lambda x: x[1] or "")],
                    "lieux": places},
        "avertissement": "Les conflits sont signalés pour information : rien n'est bloqué. « À vérifier » : au moins un "
                         "des deux créneaux n'a pas d'horaires enregistrés.",
        "avertissement_alertes": "Alertes calculées pour information : elles ne bloquent rien et ne prononcent aucune "
                                 "conformité. Échéances : dernier état évalué par le moteur (échéancier du circuit). "
                                 "Titres : tous les titres datés du formateur ; l'exigence d'un titre précis par "
                                 "formation n'est pas enregistrée.",
    }
