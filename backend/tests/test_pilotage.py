"""Pilotage : planning (période bornée, portée formateur, conflits), évaluations des acquis, bilans et aide au BPF."""

from datetime import date, time, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.application.service.platform.features import set_feature
from app.types import training as t
from app.types.funding import FundingCase, FundingSource, FundingStep
from tests.conftest import make_user

D = date(2025, 3, 10)  # un lundi


def _world(db: Session) -> dict:
    """Deux formateurs, trois sessions : A et B partagent le formateur 1 le même matin (horaires connus), C (formateur 2)
    est dans la même salle que A le même jour sans horaires ; D, sans demi-journées, est une session entière."""
    p = t.Program(code="SST-T", title="Sauveteur secouriste du travail", duration_hours=Decimal(14))
    p2 = t.Program(code="SSIAP-T", title="SSIAP 1", duration_hours=Decimal(7), action_category="AF", rncp_code="RS5642")
    tr1 = t.Trainer(first_name="Julie", last_name="Martin")
    tr2 = t.Trainer(first_name="Paul", last_name="Durand", is_external=True)
    db.add_all([p, p2, tr1, tr2])
    db.flush()

    def session(ref: str, prog: t.Program, trainer: t.Trainer, start: date, end: date, room: str | None) -> t.TrainingSession:
        s = t.TrainingSession(reference=ref, program_id=prog.id, start_date=start, end_date=end, location="Site Nord",
                              room=room, trainer_id=trainer.id, capacity=10, status="CONFIRMEE")
        db.add(s)
        db.flush()
        return s

    a = session("PL-A", p, tr1, D, D, "Salle 1")
    b = session("PL-B", p2, tr1, D, D, "Salle 2")
    c = session("PL-C", p2, tr2, D, D, "salle 1 ")
    d = session("PL-D", p2, tr2, D + timedelta(days=7), D + timedelta(days=7), None)
    db.add_all([
        t.AttendanceSlot(session_id=a.id, day=D, period="MATIN", start_time=time(9), end_time=time(12)),
        t.AttendanceSlot(session_id=a.id, day=D, period="APRES_MIDI", start_time=time(13, 30), end_time=time(17)),
        t.AttendanceSlot(session_id=b.id, day=D, period="MATIN", start_time=time(10), end_time=time(12, 30)),
        t.AttendanceSlot(session_id=c.id, day=D, period="APRES_MIDI"),
    ])
    learners = [t.Learner(first_name=f"L{i}", last_name="Test") for i in range(3)]
    db.add_all(learners)
    db.flush()
    db.add_all([t.Enrollment(session_id=a.id, learner_id=learners[0].id, status="TERMINE", funding="OPCO"),
                t.Enrollment(session_id=a.id, learner_id=learners[1].id, status="TERMINE", funding="FRANCE_TRAVAIL"),
                t.Enrollment(session_id=d.id, learner_id=learners[2].id, status="TERMINE", funding="CPF"),
                t.Enrollment(session_id=b.id, learner_id=learners[2].id, status="ANNULE")])
    db.commit()
    for s in (a, b, c, d):
        db.refresh(s)
    return {"a": a, "b": b, "c": c, "d": d, "tr1": tr1, "tr2": tr2, "p": p, "p2": p2}


def _plan(client, h: dict, **params) -> dict:  # noqa: ANN001
    r = client.get("/api/v1/planning", headers=h, params={"du": D.isoformat(), "au": (D + timedelta(days=13)).isoformat(),
                                                           **params})
    assert r.status_code == 200, r.text
    return r.json()


def test_planning_creneaux_et_conflits(client, db: Session) -> None:  # noqa: ANN001
    w = _world(db)
    _, h = make_user(db, "gestion")
    body = _plan(client, h)
    refs = [c["session"]["reference"] for c in body["creneaux"]]
    assert refs.count("PL-A") == 2 and refs.count("PL-B") == 1 and refs.count("PL-C") == 1
    whole = next(c for c in body["creneaux"] if c["session"]["reference"] == "PL-D")
    assert whole["type"] == "SESSION" and whole["id"] == f"session:{w['d'].id}"
    morning_a = next(c for c in body["creneaux"] if c["session"]["reference"] == "PL-A" and c["periode"] == "MATIN")
    assert morning_a["formateur"]["nom"] == "Julie Martin" and morning_a["effectif"] == 2 and morning_a["heure_debut"] == "09:00"
    kinds = {(f["type"], tuple(sorted(f["sessions"])), f["certitude"]) for f in body["conflits"]}
    # même formateur, horaires connus qui se chevauchent : certain ; même salle (casse et espaces ignorés), sans horaires
    assert ("FORMATEUR", ("PL-A", "PL-B"), "CERTAIN") in kinds
    assert ("SALLE", ("PL-A", "PL-C"), "A_VERIFIER") in kinds
    assert len(body["conflits"]) == 2 and body["compteurs"]["conflits"] == 2
    assert morning_a["conflits"][0]["type"] == "FORMATEUR"
    assert {f["nom"] for f in body["filtres"]["formateurs"]} == {"Julie Martin", "Paul Durand"}


def test_planning_filtres(client, db: Session) -> None:  # noqa: ANN001
    w = _world(db)
    _, h = make_user(db, "gestion")
    only = _plan(client, h, formateur=w["tr2"].id)
    assert {c["session"]["reference"] for c in only["creneaux"]} == {"PL-C", "PL-D"}
    # le conflit de salle avec PL-A (hors filtre) reste signalé
    assert [(f["type"], sorted(f["sessions"])) for f in only["conflits"]] == [("SALLE", ["PL-A", "PL-C"])]
    prog = _plan(client, h, programme=w["p"].id)
    assert {c["session"]["reference"] for c in prog["creneaux"]} == {"PL-A"}
    assert _plan(client, h, lieu="nord")["compteurs"]["creneaux"] == 5
    assert _plan(client, h, lieu="ailleurs")["creneaux"] == []


def test_planning_periode_bornee(client, db: Session) -> None:  # noqa: ANN001
    _, h = make_user(db, "gestion")
    assert client.get("/api/v1/planning", headers=h, params={"du": "2025-01-01", "au": "2025-04-03"}).status_code == 200
    too_long = client.get("/api/v1/planning", headers=h, params={"du": "2025-01-01", "au": "2025-04-04"})
    assert too_long.status_code == 422 and "93" in too_long.json()["detail"]
    assert client.get("/api/v1/planning", headers=h, params={"du": "2025-02-01", "au": "2025-01-01"}).status_code == 422
    default = client.get("/api/v1/planning", headers=h).json()
    assert (date.fromisoformat(default["au"]) - date.fromisoformat(default["du"])).days == 30


def test_planning_portee_du_formateur(client, db: Session) -> None:  # noqa: ANN001
    w = _world(db)
    user, h = make_user(db, "formateur", email="paul@test.local")
    w["tr2"].user_id = user.id
    db.commit()
    body = _plan(client, h)
    assert {c["session"]["reference"] for c in body["creneaux"]} == {"PL-C", "PL-D"}
    # le conflit de salle avec PL-A (session d'un autre formateur) n'est pas révélé
    assert body["conflits"] == [] and all(c["conflits"] == [] for c in body["creneaux"])
    assert {f["nom"] for f in body["filtres"]["formateurs"]} == {"Paul Durand"}
    # Le rôle de l'assistant IA lit le planning (sessions.read, pour ses questions de planning), sans rien écrire.
    _, h_ia = make_user(db, "assistant_ia", email="ia@test.local")
    assert client.get("/api/v1/planning", headers=h_ia).status_code == 200


def test_planning_annulees_exclues_par_defaut(client, db: Session) -> None:  # noqa: ANN001
    w = _world(db)
    w["b"].status = "ANNULEE"
    db.commit()
    _, h = make_user(db, "gestion")
    assert "PL-B" not in {c["session"]["reference"] for c in _plan(client, h)["creneaux"]}
    with_cancelled = _plan(client, h, annulees="true")
    assert "PL-B" in {c["session"]["reference"] for c in with_cancelled["creneaux"]}
    assert all(f["type"] != "FORMATEUR" for f in with_cancelled["conflits"])  # une session annulée ne crée pas de conflit


# ── Planning de pilotage : remplissage, salle, échéances, alertes, ressources ────


def _service(db: Session, user, today: date, **kw) -> dict:  # noqa: ANN001
    from app.application.service.pilotage.planning import planning
    return planning(db, user, D, D + timedelta(days=13), today=today, **kw)


def _codes(body: dict, ref: str) -> dict[str, str]:
    return {a["code"]: a["gravite"] for a in body["alertes"] if ref in {s["reference"] for s in a["sessions"]}}


def test_planning_sessions_salle_rapprochee_et_capacite(client, db: Session) -> None:  # noqa: ANN001
    w = _world(db)
    site = t.Premises(code="NORD", name="Site Nord", kind="SITE")
    db.add(site)
    db.flush()
    db.add_all([t.Premises(code="NORD-S1", name="Salle 1", kind="SALLE", parent_id=site.id, capacity=1),
                t.Premises(code="SUD-S2", name="Salle 2", kind="SALLE", capacity=30)])
    db.commit()
    _, h = make_user(db, "gestion")
    body = _plan(client, h)
    views = {v["reference"]: v for v in body["sessions"]}
    a = views["PL-A"]
    assert a["inscrits"] == 2 and a["capacite"] == 10 and a["places_restantes"] == 8
    assert a["salle_lieu"]["nom"] == "Salle 1" and a["salle_lieu"]["capacite"] == 1
    assert a["formation"]["intitule"] == "Sauveteur secouriste du travail" and a["formateur"]["nom"] == "Julie Martin"
    assert views["PL-C"]["salle_lieu"]["code"] == "NORD-S1", "casse et espaces ignorés"
    assert views["PL-B"]["salle_lieu"]["code"] == "SUD-S2" and views["PL-D"]["salle_lieu"] is None
    assert _codes(body, "PL-A")["SURCAPACITE_SALLE"] == "HAUTE"
    assert _codes(body, "PL-C")["CAPACITE_SALLE"] == "BASSE", "capacité prévue 10 pour une salle de 1"
    slot = next(c for c in body["creneaux"] if c["session"]["reference"] == "PL-A")
    assert slot["salle_lieu"]["code"] == "NORD-S1" and slot["alerte_max"] == "HAUTE" and slot["alertes"]
    assert set(slot) >= {"effectif", "capacite", "conflits", "programme", "formateur"}, "champs existants conservés"
    # conflits repris en alertes : certain = haute, sans horaires = moyenne ; lien vers le formateur ou la salle
    conflicts = {a["code"]: a for a in body["alertes"] if a["code"].startswith("CONFLIT_")}
    assert conflicts["CONFLIT_FORMATEUR"]["gravite"] == "HAUTE"
    assert conflicts["CONFLIT_FORMATEUR"]["lien"] == {"cible": "FORMATEUR", "id": w["tr1"].id, "onglet": None}
    assert conflicts["CONFLIT_SALLE"]["gravite"] == "MOYENNE" and conflicts["CONFLIT_SALLE"]["lien"]["cible"] == "SALLE"
    counts = body["compteurs"]["alertes_par_gravite"]
    assert sum(counts.values()) == body["compteurs"]["alertes"] == len(body["alertes"])
    assert [a["gravite"] for a in body["alertes"]] == sorted((a["gravite"] for a in body["alertes"]),
                                                             key=("HAUTE", "MOYENNE", "BASSE").index)


def test_planning_titres_du_formateur_a_la_date_du_creneau(db: Session) -> None:
    w = _world(db)
    db.add_all([
        # Julie : carte expirée la veille, renouvelée ensuite : le titre récent fait foi, aucune alerte
        t.TrainerQualification(trainer_id=w["tr1"].id, kind="CARTE_PRO_FORMATEUR_CNAPS", label="Carte CNAPS", valid_until=D - timedelta(days=1)),
        t.TrainerQualification(trainer_id=w["tr1"].id, kind="CARTE_PRO_FORMATEUR_CNAPS", label="Carte CNAPS", valid_until=D + timedelta(days=900)),
        # Julie : SST expiré la veille du créneau
        t.TrainerQualification(trainer_id=w["tr1"].id, kind="FORMATEUR_SST", label="Formateur SST", valid_until=D - timedelta(days=1)),
        # Paul : SSIAP 3 valide au créneau, expire peu après
        t.TrainerQualification(trainer_id=w["tr2"].id, kind="SSIAP3", label="SSIAP 3", valid_until=D + timedelta(days=20)),
    ])
    db.commit()
    user, _ = make_user(db, "gestion")
    body = _service(db, user, today=D - timedelta(days=1))
    expired = [a for a in body["alertes"] if a["code"] == "TITRE_EXPIRE"]
    assert {a["sessions"][0]["reference"] for a in expired} == {"PL-A", "PL-B"}
    assert all("Formateur SST" in a["message"] and a["lien"]["cible"] == "FORMATEUR" for a in expired)
    assert not any("CNAPS" in a["message"] for a in body["alertes"])
    soon = {a["sessions"][0]["reference"] for a in body["alertes"] if a["code"] == "TITRE_A_RENOUVELER"}
    assert soon == {"PL-C", "PL-D"}
    assert not any(a["code"] == "TITRE_A_RENOUVELER" for a in _service(db, user, today=D + timedelta(days=30))["alertes"]), \
        "créneaux passés : plus rien à renouveler pour eux"


def test_planning_emargement_non_tenu_sur_creneau_passe(db: Session) -> None:
    from datetime import datetime, timezone
    w = _world(db)
    a = w["a"]
    morning = next(sl for sl in a.attendance_slots if sl.period == "MATIN")
    e1, e2 = a.enrollments
    db.add_all([t.AttendanceSignature(slot_id=morning.id, enrollment_id=e1.id, present=True,
                                      signed_at=datetime(2025, 3, 10, 9, 5, tzinfo=timezone.utc)),
                t.AttendanceSignature(slot_id=morning.id, enrollment_id=e2.id, present=False, note="malade")])
    db.commit()
    user, _ = make_user(db, "gestion")
    before = _service(db, user, today=D)
    assert not any(x["code"].startswith("EMARGEMENT") for x in before["alertes"]), "rien avant la fin du jour"
    body = _service(db, user, today=D + timedelta(days=1))
    codes = {x["code"]: x for x in body["alertes"] if x["sessions"][0]["reference"] == "PL-A"}
    afternoon = next(sl for sl in a.attendance_slots if sl.period == "APRES_MIDI")
    assert codes["EMARGEMENT_NON_TENU"]["creneaux"] == [afternoon.id] and codes["EMARGEMENT_NON_TENU"]["gravite"] == "HAUTE"
    assert codes["EMARGEMENT_NON_CONTRE_VALIDE"]["creneaux"] == [morning.id]
    assert codes["EMARGEMENT_NON_TENU"]["lien"] == {"cible": "EMARGEMENT", "id": a.id, "onglet": None}
    assert not any(x["code"].startswith("EMARGEMENT") for x in body["alertes"] if x["sessions"][0]["reference"] == "PL-C"), \
        "aucun stagiaire attendu"
    late = _service(db, user, today=D + timedelta(days=8))
    assert "EMARGEMENT_NON_PREPARE" in _codes(late, "PL-D"), "session entière commencée, aucune demi-journée"
    morning.trainer_signed_at = datetime(2025, 3, 10, 12, 5, tzinfo=timezone.utc)
    db.commit()
    assert "EMARGEMENT_NON_CONTRE_VALIDE" not in _codes(_service(db, user, today=D + timedelta(days=1)), "PL-A")


def test_planning_sessions_a_venir_sans_formateur_ni_salle(db: Session) -> None:
    w = _world(db)
    e = t.TrainingSession(reference="PL-E", program_id=w["p"].id, start_date=D + timedelta(days=2), end_date=D + timedelta(days=2),
                          capacity=1, status="PLANIFIEE")
    f = t.TrainingSession(reference="PL-F", program_id=w["p"].id, start_date=D + timedelta(days=3), end_date=D + timedelta(days=3),
                          location="Site client", trainer_id=w["tr1"].id, status="PLANIFIEE")
    db.add_all([e, f])
    db.flush()
    learners = [t.Learner(first_name=f"E{i}", last_name="Test") for i in range(2)]
    db.add_all(learners)
    db.flush()
    db.add_all([t.Enrollment(session_id=e.id, learner_id=x.id) for x in learners])
    db.commit()
    user, _ = make_user(db, "gestion")
    body = _service(db, user, today=D)
    assert _codes(body, "PL-E") == {"SANS_FORMATEUR": "MOYENNE", "SANS_SALLE": "MOYENNE", "SURCAPACITE_SESSION": "HAUTE"}
    assert _codes(body, "PL-F") == {"SANS_SALLE": "BASSE"}
    view = next(v for v in body["sessions"] if v["reference"] == "PL-E")
    assert view["places_restantes"] == 0 and view["formateur"] is None
    past = _service(db, user, today=D + timedelta(days=10))
    assert "SANS_FORMATEUR" not in _codes(past, "PL-E"), "session passée : plus une alerte de préparation"


def test_planning_echeances_du_moteur(db: Session) -> None:
    from app.application.service.qualiopi.schedule.service import refresh_schedule
    w = _world(db)
    user, _ = make_user(db, "gestion")
    assert all(v["echeances"] == [] and v["echeances_evaluees_le"] is None for v in _service(db, user, today=D)["sessions"])
    refresh_schedule(db, [w["a"]], today=D + timedelta(days=60))  # le moteur évalue ; le planning relit
    db.commit()
    body = _service(db, user, today=D + timedelta(days=60))
    a = next(v for v in body["sessions"] if v["reference"] == "PL-A")
    keys = [m["cle"] for m in a["echeances"]]
    assert "J-15.convention" in keys and a["echeances_evaluees_le"]
    conv = next(m for m in a["echeances"] if m["cle"] == "J-15.convention")
    assert conv["etat"] == "EN_RETARD" and conv["libelle"] == "Convention signée" and conv["echeance"] == (D - timedelta(days=15)).isoformat()
    assert next(m for m in a["echeances"] if m["cle"] == "J-10.convocation")["indicateurs"] == [9]
    alert = next(x for x in body["alertes"] if x["code"] == "ECHEANCE_EN_RETARD")
    assert alert["sessions"][0]["reference"] == "PL-A" and alert["lien"]["onglet"] == "parcours"


def test_planning_ressources_et_portee(client, db: Session) -> None:  # noqa: ANN001
    w = _world(db)
    _, h = make_user(db, "gestion")
    res = _plan(client, h)["ressources"]
    julie = next(r for r in res["formateurs"] if r["nom"] == "Julie Martin")
    assert julie["creneaux"] == 3 and julie["jours"] == [{"jour": D.isoformat(), "creneaux": 3, "sessions": ["PL-A", "PL-B"]}]
    rooms = {r["cle"]: r for r in res["salles"]}
    assert rooms["site nord|salle 1"]["creneaux"] == 3, "PL-A (deux demi-journées) et PL-C dans la même salle"
    assert rooms[None]["salle"] is None and rooms[None]["jours"][0]["sessions"] == ["PL-D"]
    user, hp = make_user(db, "formateur", email="paul2@test.local")
    w["tr2"].user_id = user.id
    db.commit()
    body = _plan(client, hp)
    seen = {s["reference"] for a in body["alertes"] for s in a["sessions"]}
    assert seen <= {"PL-C", "PL-D"} and {v["reference"] for v in body["sessions"]} == {"PL-C", "PL-D"}
    assert [r["nom"] for r in body["ressources"]["formateurs"]] == ["Paul Durand"]


# ── Évaluations des acquis ───────────────────────────────────────────────────────


def test_evaluations_acquis_reprend_les_registres(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "gestion")
    body = client.get("/api/v1/evaluations-acquis", headers=h).json()
    assert body["lignes"]
    ev = client.get("/api/v1/parcours/registres/evaluations", headers=h).json()
    att = client.get("/api/v1/parcours/registres/attestation", headers=h).json()
    cert = client.get("/api/v1/parcours/registres/certification", headers=h).json()
    assert body["compteurs"]["evaluations"] == ev["compteurs"]
    assert body["compteurs"]["attestation"] == att["compteurs"]
    certified = {k: v for k, v in body["compteurs"]["certification"].items() if k != "AUCUN"}
    assert certified == cert["compteurs"]
    by_id = {r["inscription"]: r for r in ev["lignes"]}
    for row in body["lignes"]:
        assert row["evaluations"]["etat"] == by_id[row["inscription"]]["etape"]["etat"]
        e = demo.get(t.Enrollment, row["inscription"])
        assert len(row["evaluations"]["liste"]) == len(e.assessments)


def test_evaluations_acquis_filtres_et_portee(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "gestion")
    rows = client.get("/api/v1/evaluations-acquis", headers=h).json()["lignes"]
    first = rows[0]
    by_session = client.get("/api/v1/evaluations-acquis", headers=h, params={"session_id": first["session"]["id"]}).json()
    assert by_session["lignes"] and all(r["session"]["id"] == first["session"]["id"] for r in by_session["lignes"])
    by_prog = client.get("/api/v1/evaluations-acquis", headers=h,
                         params={"programme": first["session"]["programme_id"]}).json()["lignes"]
    assert by_prog and all(r["session"]["programme_id"] == first["session"]["programme_id"] for r in by_prog)
    done = client.get("/api/v1/evaluations-acquis", headers=h, params={"etat": "FAIT"}).json()["lignes"]
    assert all(r["evaluations"]["etat"] == "FAIT" for r in done)
    passed = client.get("/api/v1/evaluations-acquis", headers=h, params={"resultat": "REUSSI"}).json()["lignes"]
    assert all(r["certification"]["resultat"] == "REUSSI" for r in passed)
    assert client.get("/api/v1/evaluations-acquis", headers=h, params={"etat": "X"}).status_code == 422
    assert client.get("/api/v1/evaluations-acquis", headers=h, params={"resultat": "X"}).status_code == 422
    _, hf = make_user(demo, "formateur", email="sans-session-eval@test.local")
    assert client.get("/api/v1/evaluations-acquis", headers=hf).json()["lignes"] == []


# ── Bilans ───────────────────────────────────────────────────────────────────────


def test_inventaire_des_bilans_selon_les_droits(client, db: Session) -> None:  # noqa: ANN001
    _, hl = make_user(db, "lecture")
    _, hf = make_user(db, "formateur", email="f-bilans@test.local")
    lecture = {r["code"]: r["disponible"] for r in client.get("/api/v1/bilans", headers=hl).json()["rapports"]}
    formateur = {r["code"]: r["disponible"] for r in client.get("/api/v1/bilans", headers=hf).json()["rapports"]}
    assert lecture["carnet_qualiopi"] and lecture["aide_bpf"] and lecture["feuille_de_route"]
    assert not formateur["carnet_qualiopi"] and not formateur["aide_bpf"] and formateur["synthese_parcours"]


def test_aide_bpf_agrege_et_marque_ce_qui_manque(client, db: Session) -> None:  # noqa: ANN001
    w = _world(db)
    a = w["a"]
    slots = {(sl.period): sl for sl in a.attendance_slots}
    enrolled = list(a.enrollments)
    # stagiaire 1 : matin (3 h) + après-midi (3,5 h) ; stagiaire 2 : matin seulement, absent l'après-midi
    db.add_all([t.AttendanceSignature(slot_id=slots["MATIN"].id, enrollment_id=enrolled[0].id, present=True),
                t.AttendanceSignature(slot_id=slots["APRES_MIDI"].id, enrollment_id=enrolled[0].id, present=True),
                t.AttendanceSignature(slot_id=slots["MATIN"].id, enrollment_id=enrolled[1].id, present=True),
                t.AttendanceSignature(slot_id=slots["APRES_MIDI"].id, enrollment_id=enrolled[1].id, present=False)])
    db.add(t.Organization(name="Organisme test", nda_number="11 75 00000 75", siret="12345678900011"))
    db.commit()
    _, h = make_user(db, "lecture")
    r = client.get("/api/v1/bilans/bpf", headers=h, params={"exercice": 2025})
    assert r.status_code == 200, r.text
    body = r.json()
    syn = body["synthese"]
    # A : 6,5 + 3 émargées ; D (sans demi-journées) : 7 h estimées (programme) ; l'inscription annulée ne compte pas
    assert syn["stagiaires"] == 3 and syn["heures_stagiaires"] == 16.5 and syn["dont_heures_estimees"] == 7.0
    cadres = {c["cadre"]: c for c in body["cadres"]}
    for code in ("B", "C", "D", "F-4", "G"):
        assert cadres[code]["etat"] == "NON_CALCULABLE" and cadres[code]["manque"]
    assert cadres["A"]["valeurs"]["numero_declaration"] == "11 75 00000 75"
    f1 = cadres["F-1"]["valeurs"]
    assert f1["total"] == {"stagiaires": 3, "heures": 16.5}
    assert f1["par_ligne_suggeree"]["a"]["stagiaires"] == 1 and f1["par_ligne_suggeree"]["c"]["stagiaires"] == 1
    assert f1["par_ligne_suggeree"]["a_confirmer"]["stagiaires"] == 1  # CPF : salarié ou demandeur d'emploi
    f3 = cadres["F-3"]["valeurs"]
    assert f3["b"]["stagiaires"] == 1 and f3["non_classe"]["stagiaires"] == 2  # SSIAP-T : code RS
    e = cadres["E"]["valeurs"]
    assert e["internes"] == {"formateurs": 1, "heures": 9.0}  # A (6,5 h) + B (2,5 h)
    assert e["externes"]["formateurs"] == 1 and e["externes"]["heures"] == 7.0  # C sans horaires ; D estimée
    assert cadres["C"]["valeurs"] == {}  # lecture : pas d'indication financière
    assert "BPF" in body["avertissement"] or "bilan pédagogique" in body["avertissement"]


def test_aide_bpf_indications_financieres_et_droits(client, db: Session) -> None:  # noqa: ANN001
    w = _world(db)
    set_feature(db, "funding", True)
    e = w["a"].enrollments[0]
    case = FundingCase(enrollment_id=e.id, cost_eur=Decimal(600))
    db.add(case)
    db.flush()
    src = FundingSource(case_id=case.id, scheme="OPCO", scheme_version="1", state="PAYEE", payer_kind="FINANCEUR",
                        amount_paid=Decimal(500))
    db.add(src)
    db.flush()
    db.add(FundingStep(source_id=src.id, action="enregistrer_paiement", from_state="FACTUREE", to_state="PAYEE",
                       done_on=date(2025, 4, 2)))
    db.commit()
    _, hg = make_user(db, "gestion")
    body = client.get("/api/v1/bilans/bpf", headers=hg, params={"exercice": 2025}).json()
    c = next(x for x in body["cadres"] if x["cadre"] == "C")
    assert c["etat"] == "NON_CALCULABLE"
    assert c["valeurs"]["paiements_enregistres"]["OPCO"] == {"ligne_suggeree": "h", "paiements": 1, "montant_enregistre": 500.0}
    _, hf = make_user(db, "formateur", email="f-bpf@test.local")
    assert client.get("/api/v1/bilans/bpf", headers=hf, params={"exercice": 2025}).status_code == 403
    future = client.get("/api/v1/bilans/bpf", headers=hg, params={"exercice": date.today().year + 1})
    assert future.status_code == 422
    assert client.get("/api/v1/bilans/bpf", headers=hg, params={"exercice": 1999}).status_code == 422
    assert client.get("/api/v1/bilans/bpf", headers=hg).status_code == 422
