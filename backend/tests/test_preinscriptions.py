"""Préinscriptions : formulaire public du site, traitement par l'organisme, conversion en stagiaire inscrit."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.application.service.preinscriptions import limiter
from app.common.journal import ChangeLog
from app.types import training as t
from app.types.event import OutboxEvent
from app.types.preinscriptions import COMPLIANCE, Preinscription
from tests.conftest import find_session, make_user

URL = "/api/v1/public/preinscriptions"


@pytest.fixture(autouse=True)
def _limiter() -> None:
    limiter.reset()


def body(**changes) -> dict:  # noqa: ANN003
    """Corps exact envoyé par landing/app/preinscription.tsx."""
    data = {
        "civility": "MME", "firstName": "Léa", "lastName": "Martin", "email": "Lea.Martin@exemple.fr",
        "phone": "06 12 34 56 78", "birthDate": "1998-05-02", "birthCity": "Lyon", "birthDepartment": "69",
        "birthCountry": "France", "nationality": "Française", "address": "3 rue des Lilas", "postalCode": "69003",
        "city": "Lyon", "formationSlug": "ssiap-1-initial", "fundingMode": "CPF", "sessionChoice": "__session_flexible__",
        "sessionLabel": "mai 2027", "currentSituation": "Demandeuse d'emploi", "experience": "", "motivation": "Reconversion",
        "formationName": "SSIAP 1 — formation initiale", "sourceContext": "central-landing-cta",
        **dict.fromkeys(COMPLIANCE, True),
    }
    return {k: v for k, v in (data | changes).items() if v is not ...}


def _post(client, payload: dict, **kw):  # noqa: ANN001, ANN003, ANN202
    return client.post(URL, json=payload, **kw)


# ── Route publique ───────────────────────────────────────────────────────────


def test_formulaire_enregistre_la_demande_sans_compte(db: Session, client) -> None:  # noqa: ANN001
    r = _post(client, body())
    assert r.status_code == 201, r.text
    assert set(r.json()) == {"message"}
    p = db.scalar(select(Preinscription))
    assert p.reference.startswith("PRE-") and p.status == "NOUVELLE"
    assert p.email == "lea.martin@exemple.fr" and p.experience is None and p.session_label == "mai 2027"
    assert p.compliance == dict.fromkeys(COMPLIANCE, True) and p.consented_at is not None
    assert p.created_by == "formulaire public du site"
    assert db.scalar(select(OutboxEvent.name).where(OutboxEvent.entity_id == p.id)) == "preinscription.received"
    assert db.scalar(select(ChangeLog.action).where(ChangeLog.table_name == "formation.preinscription")) == "CREATION"


def test_formation_du_catalogue_reconnue(db: Session, client) -> None:  # noqa: ANN001
    program = t.Program(code="SSIAP1", title="SSIAP 1", catalog_slug="ssiap-1-initial")
    db.add(program)
    db.commit()
    assert _post(client, body()).status_code == 201
    assert db.scalar(select(Preinscription.program_id)) == program.id


def test_ne_ne_hors_de_france_sans_departement(db: Session, client) -> None:  # noqa: ANN001
    r = _post(client, body(birthCountry="Maroc", birthDepartment=...))
    assert r.status_code == 201, r.text


@pytest.mark.parametrize(("changes", "fragment"), [
    ({"email": "pas-une-adresse"}, "E-mail"),
    ({"postalCode": "6900"}, "Code postal"),
    ({"phone": "0612"}, "Téléphone"),
    ({"birthDate": "2999-01-01"}, "Date de naissance"),
    ({"civility": "X"}, "Civilité"),
    ({"firstName": "   "}, "Prénom : à renseigner"),
    ({"lastName": "x" * 101}, "100 caractères au plus"),
    ({"birthDepartment": ""}, "département de naissance"),
    ({"acceptsInternalRules": False}, "déclarations"),
    ({"acceptsInternalRules": "true"}, "Déclarations"),
    ({"fundingMode": ...}, "Financement : à renseigner"),
    ({"champInconnu": "x"}, "champ inconnu"),
])
def test_validation_stricte_avec_message_lisible(db: Session, client, changes: dict, fragment: str) -> None:  # noqa: ANN001
    r = _post(client, body(**changes))
    assert r.status_code == 422, r.text
    data = r.json()
    assert fragment in data["message"] and data["message"] == data["detail"] and data["details"]
    assert db.scalar(select(func.count()).select_from(Preinscription)) == 0


def test_corps_illisible_ou_trop_gros(client) -> None:  # noqa: ANN001
    r = client.post(URL, content=b"{pas du json", headers={"Content-Type": "application/json"})
    assert r.status_code == 400 and r.json()["message"]
    assert client.post(URL, json=["liste"]).status_code == 400
    r = _post(client, body(motivation="x" * 20_000))
    assert r.status_code == 413 and "volumineuse" in r.json()["message"]
    chunked = client.post(URL, content=iter([b"{" + b" " * 9000, b" " * 9000 + b"}"]),
                          headers={"Content-Type": "application/json"})
    assert chunked.status_code == 413


def test_doublon_recent_non_recree(db: Session, client) -> None:  # noqa: ANN001
    assert _post(client, body()).status_code == 201
    r = _post(client, body(email="LEA.martin@exemple.fr"))
    assert r.status_code == 201  # même réponse : rien n'indique qu'une demande existe déjà
    assert db.scalar(select(func.count()).select_from(Preinscription)) == 1
    assert _post(client, body(formationSlug="sst-initial")).status_code == 201
    assert db.scalar(select(func.count()).select_from(Preinscription)) == 2


def test_limite_de_debit_par_origine(client) -> None:  # noqa: ANN001
    for i in range(limiter.MAX_SUBMISSIONS):
        assert _post(client, body(email=f"p{i}@exemple.fr")).status_code == 201
    r = _post(client, body(email="encore@exemple.fr"))
    assert r.status_code == 429 and "réessayez" in r.json()["message"]
    # Une autre origine derrière le reverse proxy (dernière adresse ajoutée) n'est pas bloquée.
    assert _post(client, body(email="autre@exemple.fr"), headers={"X-Forwarded-For": "203.0.113.9"}).status_code == 201


def test_limiteur_fenetre_glissante() -> None:
    for _ in range(limiter.MAX_SUBMISSIONS):
        assert limiter.allow("k", now=0.0)
    assert not limiter.allow("k", now=1.0)
    assert limiter.allow("k", now=limiter.WINDOW_SECONDS + 1)


# ── Traitement par l'organisme ───────────────────────────────────────────────


def _demande(db: Session, client, **changes) -> Preinscription:  # noqa: ANN001, ANN003
    assert _post(client, body(**changes)).status_code == 201
    return db.scalar(select(Preinscription).order_by(Preinscription.created_at.desc()))


def test_droits_dedies(db: Session, client) -> None:  # noqa: ANN001
    p = _demande(db, client)
    _, formateur = make_user(db, "formateur")
    _, lecture = make_user(db, "lecture")
    _, financement = make_user(db, "financement")
    assert client.get("/api/v1/preinscriptions").status_code == 401
    assert client.get("/api/v1/preinscriptions", headers=formateur).status_code == 403
    # Données personnelles des candidats : pas dans le rôle « lecture seule ».
    assert client.get("/api/v1/preinscriptions", headers=lecture).status_code == 403
    assert client.get(f"/api/v1/preinscriptions/{p.id}", headers=financement).status_code == 200
    r = client.post(f"/api/v1/preinscriptions/{p.id}/statut", json={"statut": "EN_COURS"}, headers=financement)
    assert r.status_code == 403
    caps = client.get(f"/api/v1/preinscriptions/{p.id}", headers=financement).json()["capabilities"]
    assert caps["EN_COURS"]["code"] == "PERMISSION_MISSING" and not caps["convertir"]["allowed"]


def test_liste_filtrable(db: Session, client) -> None:  # noqa: ANN001
    a = _demande(db, client)
    _demande(db, client, email="tom@exemple.fr", firstName="Tom", lastName="Petit", formationSlug="sst-initial")
    _, gestion = make_user(db, "gestion")
    client.post(f"/api/v1/preinscriptions/{a.id}/statut", json={"statut": "EN_COURS"}, headers=gestion)
    r = client.get("/api/v1/preinscriptions", headers=gestion)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2 and data["compteurs"] == {"NOUVELLE": 1, "EN_COURS": 1, "CONVERTIE": 0, "REFUSEE": 0}
    assert [d["prenom"] for d in data["demandes"]] == ["Tom", "Léa"]
    assert client.get("/api/v1/preinscriptions?statut=EN_COURS", headers=gestion).json()["total"] == 1
    assert client.get("/api/v1/preinscriptions?statut=NOUVELLE&statut=EN_COURS", headers=gestion).json()["total"] == 2
    assert client.get("/api/v1/preinscriptions?formation=sst-initial", headers=gestion).json()["total"] == 1
    assert client.get("/api/v1/preinscriptions?recherche=PETIT", headers=gestion).json()["total"] == 1
    r = client.get("/api/v1/preinscriptions?statut=PERDUE", headers=gestion)
    assert r.status_code == 422 and "Statut inconnu" in r.json()["detail"]
    assert client.get("/api/v1/preinscriptions/inconnue", headers=gestion).status_code == 404


def test_statuts_et_refus_motive(db: Session, client) -> None:  # noqa: ANN001
    p = _demande(db, client)
    _, gestion = make_user(db, "gestion")
    url = f"/api/v1/preinscriptions/{p.id}/statut"
    r = client.post(url, json={"statut": "REFUSEE"}, headers=gestion)
    assert r.status_code == 422 and "motif" in r.json()["detail"]
    r = client.post(url, json={"statut": "REFUSEE", "motif": "Prérequis non remplis"}, headers=gestion)
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["statut"] == "REFUSEE" and detail["motif_refus"] == "Prérequis non remplis"
    assert detail["traitee_par"] == "Test gestion" and detail["capabilities"]["EN_COURS"]["allowed"]
    assert not detail["capabilities"]["convertir"]["allowed"]
    r = client.post(url, json={"statut": "REFUSEE", "motif": "encore"}, headers=gestion)
    assert r.status_code == 409 and r.json()["error"] == "INVALID_TRANSITION"
    r = client.post(url, json={"statut": "CONVERTIE"}, headers=gestion)
    assert r.status_code == 409 and r.json()["error"] == "UNKNOWN_STATUS"
    assert client.post(url, json={"statut": "EN_COURS"}, headers=gestion).json()["statut"] == "EN_COURS"
    names = db.scalars(select(OutboxEvent.name).where(OutboxEvent.entity_id == p.id)).all()
    assert names.count("preinscription.status_changed") == 2
    changes = db.scalars(select(ChangeLog.changes).where(ChangeLog.entity_id == p.id, ChangeLog.action == "MODIFICATION")).all()
    assert any(c.get("status") == ["NOUVELLE", "REFUSEE"] for c in changes)


def test_conversion_en_stagiaire_inscrit(demo: Session, client) -> None:  # noqa: ANN001
    s3 = find_session(demo, "SSIAP1-2026-03")
    s3.program.catalog_slug = "ssiap-1-initial"
    demo.commit()
    p = _demande(demo, client)
    _, gestion = make_user(demo, "gestion")
    detail = client.get(f"/api/v1/preinscriptions/{p.id}", headers=gestion).json()
    assert detail["formation"]["code"] == "SSIAP1" and detail["capabilities"]["convertir"]["allowed"]
    assert [s["reference"] for s in detail["sessions_proposees"]] == ["SSIAP1-2026-03"]
    assert detail["sessions_proposees"][0]["inscription"] == {"allowed": True}
    r = client.post(f"/api/v1/preinscriptions/{p.id}/conversion", json={"session_id": s3.id}, headers=gestion)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["statut"] == "CONVERTIE" and data["resultat"]["stagiaire_existant"] is False
    learner = demo.get(t.Learner, data["resultat"]["stagiaire_id"])
    enrollment = demo.get(t.Enrollment, data["resultat"]["inscription_id"])
    assert (learner.first_name, learner.email) == ("Léa", "lea.martin@exemple.fr")
    assert (learner.civility, learner.birth_city, learner.birth_department, learner.postal_code, learner.nationality,
            learner.current_situation) == ("MME", "Lyon", "69", "69003", "Française", "Demandeuse d'emploi")
    assert learner.birth_date.isoformat() == "1998-05-02", "identité recopiée de la préinscription"
    assert enrollment.session_id == s3.id and enrollment.funding == "CPF"
    assert data["conversion"]["session"]["reference"] == "SSIAP1-2026-03"
    names = set(demo.scalars(select(OutboxEvent.name).where(OutboxEvent.processed_at.is_(None))))
    assert {"preinscription.converted", "learner.enrolled"} <= names
    # Plus rien à convertir ensuite.
    r = client.post(f"/api/v1/preinscriptions/{p.id}/conversion", json={}, headers=gestion)
    assert r.status_code == 409 and r.json()["error"] == "CONVERSION_IMPOSSIBLE"


def test_conversion_reprend_le_stagiaire_connu_sans_session(db: Session, client) -> None:  # noqa: ANN001
    known = t.Learner(first_name="Léa", last_name="Martin", email="LEA.MARTIN@exemple.fr", city="Villeurbanne")
    db.add(known)
    db.commit()
    p = _demande(db, client)
    _, gestion = make_user(db, "gestion")
    assert client.get(f"/api/v1/preinscriptions/{p.id}", headers=gestion).json()["stagiaire_existant"]["id"] == known.id
    r = client.post(f"/api/v1/preinscriptions/{p.id}/conversion", json={}, headers=gestion)
    assert r.status_code == 200, r.text
    assert r.json()["resultat"] == {"stagiaire_id": known.id, "stagiaire_existant": True, "inscription_id": None,
                                    "session_id": None}
    assert db.scalar(select(func.count()).select_from(t.Learner)) == 1
    db.refresh(known)
    assert known.city == "Villeurbanne" and known.postal_code == "69003", "seuls les champs vides sont complétés"


def test_conversion_refusee_motivee(demo: Session, client) -> None:  # noqa: ANN001
    s1 = find_session(demo, "SSIAP1-2026-01")  # session terminée : inscriptions fermées
    p = _demande(demo, client)
    _, gestion = make_user(demo, "gestion")
    _, financement = make_user(demo, "financement")
    r = client.post(f"/api/v1/preinscriptions/{p.id}/conversion", json={"session_id": s1.id}, headers=gestion)
    assert r.status_code == 409
    data = r.json()
    assert data["error"] == "CONVERSION_IMPOSSIBLE" and [d["code"] for d in data["details"]] == ["ENROLLMENT_CLOSED"]
    assert demo.get(Preinscription, p.id).status == "NOUVELLE"
    assert demo.scalar(select(func.count()).select_from(t.Learner).where(t.Learner.email == p.email)) == 0
    # Sans leads.write : 403 de la route ; la session inconnue répond 404.
    assert client.post(f"/api/v1/preinscriptions/{p.id}/conversion", json={}, headers=financement).status_code == 403
    r = client.post(f"/api/v1/preinscriptions/{p.id}/conversion", json={"session_id": "inconnue"}, headers=gestion)
    assert r.status_code == 404


def test_conversion_refusee_si_deja_inscrit(demo: Session, client) -> None:  # noqa: ANN001
    s3 = find_session(demo, "SSIAP1-2026-03")
    inscrit = s3.enrollments[0].learner
    inscrit.email = "deja@exemple.fr"
    demo.commit()
    p = _demande(demo, client, email="deja@exemple.fr")
    _, gestion = make_user(demo, "gestion")
    r = client.post(f"/api/v1/preinscriptions/{p.id}/conversion", json={"session_id": s3.id}, headers=gestion)
    assert r.status_code == 409 and [d["code"] for d in r.json()["details"]] == ["ALREADY_ENROLLED"]


def test_demo_installe_et_retire_les_demandes(demo: Session) -> None:
    from app.application.service.demo import remove_demo

    statuses = demo.scalars(select(Preinscription.status).order_by(Preinscription.reference)).all()
    assert sorted(statuses) == ["CONVERTIE", "EN_COURS", "NOUVELLE", "REFUSEE"]
    converted = demo.scalar(select(Preinscription).where(Preinscription.status == "CONVERTIE"))
    assert converted.enrollment_id and converted.session_id == find_session(demo, "SSIAP1-2026-03").id
    assert demo.scalar(select(Preinscription.refusal_reason).where(Preinscription.status == "REFUSEE"))
    assert remove_demo(demo)["preinscription"] == 4
    assert demo.scalar(select(func.count()).select_from(Preinscription)) == 0
