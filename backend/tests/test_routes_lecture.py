"""Routes de lecture demandées par les écrans : inscriptions d'un stagiaire, filtres, échéances RH,
listes de valeurs, circuit de session et règles de financement datées."""

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.application.service.platform.features import set_feature
from app.types import training as t
from app.types.editions import Project
from tests.conftest import make_user

API = "/api/v1"


def _jeu(db: Session) -> dict:
    """Deux entreprises, deux formateurs, deux sessions, un stagiaire inscrit aux deux."""
    acme, beta = t.Company(name="Acme"), t.Company(name="Beta")
    paul, rita = t.Trainer(first_name="Paul", last_name="Durand"), t.Trainer(first_name="Rita", last_name="Morel")
    prog = t.Program(code="SST", title="Sauveteur secouriste du travail")
    db.add_all([acme, beta, paul, rita, prog])
    db.flush()
    jean = t.Learner(first_name="Jean", last_name="Petit", company_id=acme.id)
    lea = t.Learner(first_name="Léa", last_name="Roux", company_id=beta.id)
    s1 = t.TrainingSession(reference="S-PAUL", program_id=prog.id, trainer_id=paul.id,
                           start_date=date(2026, 3, 2), end_date=date(2026, 3, 3))
    s2 = t.TrainingSession(reference="S-RITA", program_id=prog.id, trainer_id=rita.id,
                           start_date=date(2026, 5, 4), end_date=date(2026, 5, 5))
    db.add_all([jean, lea, s1, s2])
    db.flush()
    db.add_all([t.Enrollment(session_id=s1.id, learner_id=jean.id, company_id=acme.id, funding="OPCO"),
                t.Enrollment(session_id=s2.id, learner_id=jean.id, status="CONFIRME"),
                t.TrainerQualification(trainer_id=paul.id, kind="SSIAP3", label="SSIAP 3",
                                       valid_until=date.today() + timedelta(days=10)),
                t.TrainerQualification(trainer_id=rita.id, label="Diplôme", valid_until=date.today() + timedelta(days=400)),
                t.StaffDevelopmentAction(trainer_id=paul.id, label="Recyclage SST"),
                t.StaffDevelopmentAction(trainer_id=rita.id, label="Pédagogie active"),
                Project(reference="DEV-1", kind="DEVIS", title="Devis Acme", company_id=acme.id),
                Project(reference="DEV-2", kind="DEVIS", title="Devis Beta", company_id=beta.id),
                Project(reference="PROP-1", kind="PROPOSITION", title="Proposition Acme", company_id=acme.id)])
    db.commit()
    return {"acme": acme.id, "beta": beta.id, "paul": paul.id, "rita": rita.id, "jean": jean.id, "lea": lea.id,
            "s1": s1.id, "s2": s2.id}


def test_inscriptions_d_un_stagiaire(client, db: Session) -> None:  # noqa: ANN001
    ids = _jeu(db)
    _, h = make_user(db, "gestion")
    r = client.get(f"{API}/learners/{ids['jean']}/inscriptions", headers=h)
    assert r.status_code == 200
    rows = r.json()
    assert [x["session"]["reference"] for x in rows] == ["S-RITA", "S-PAUL"]  # la plus récente d'abord
    paul = rows[1]
    assert paul["statut"] == "INSCRIT" and paul["financement"] == "OPCO" and paul["entreprise_id"] == ids["acme"]
    assert paul["session"]["formation_code"] == "SST" and paul["session"]["formateur"] == "Paul Durand"
    assert client.get(f"{API}/learners/{ids['lea']}/inscriptions", headers=h).json() == []
    assert client.get(f"{API}/learners/inconnu/inscriptions", headers=h).status_code == 404
    # Comme la fiche stagiaire : réservé à qui voit toutes les sessions.
    _, formateur = make_user(db, "formateur")
    assert client.get(f"{API}/learners/{ids['jean']}/inscriptions", headers=formateur).status_code == 403


def test_filtres_entreprise_type_et_formateur(client, db: Session) -> None:  # noqa: ANN001
    ids = _jeu(db)
    _, h = make_user(db, "gestion")
    learners = client.get(f"{API}/learners", params={"entreprise": ids["acme"]}, headers=h).json()
    assert [x["id"] for x in learners] == [ids["jean"]]
    assert len(client.get(f"{API}/learners", headers=h).json()) == 2

    editions = client.get(f"{API}/editions", params={"entreprise": ids["acme"]}, headers=h).json()
    assert sorted(x["reference"] for x in editions) == ["DEV-1", "PROP-1"]
    devis = client.get(f"{API}/editions", params={"entreprise": ids["acme"], "type": "DEVIS"}, headers=h).json()
    assert [x["reference"] for x in devis] == ["DEV-1"]
    assert client.get(f"{API}/editions", params={"type": "INCONNU"}, headers=h).status_code == 422

    titres = client.get(f"{API}/trainer-qualifications", params={"formateur": ids["paul"]}, headers=h).json()
    assert [x["label"] for x in titres] == ["SSIAP 3"]
    actions = client.get(f"{API}/staff-development", params={"formateur": ids["rita"]}, headers=h).json()
    assert [x["label"] for x in actions] == ["Pédagogie active"]

    sessions = client.get(f"{API}/sessions", params={"formateur": ids["paul"]}, headers=h).json()
    assert [x["reference"] for x in sessions] == ["S-PAUL"]


def test_filtre_formateur_ne_sort_pas_de_la_portee(client, db: Session) -> None:  # noqa: ANN001
    ids = _jeu(db)
    user, h = make_user(db, "formateur")
    db.get(t.Trainer, ids["paul"]).user_id = user.id
    db.commit()
    assert [x["reference"] for x in client.get(f"{API}/sessions", headers=h).json()] == ["S-PAUL"]
    assert client.get(f"{API}/sessions", params={"formateur": ids["rita"]}, headers=h).json() == []


def test_echeances_rh_renvoient_l_identifiant_du_titre(client, db: Session) -> None:  # noqa: ANN001
    _jeu(db)
    set_feature(db, "hr", True)
    _, h = make_user(db, "rh")
    rows = client.get(f"{API}/rh/echeances", headers=h).json()
    assert len(rows) == 1
    titre = db.get(t.TrainerQualification, rows[0]["titre_id"])
    assert titre is not None and titre.label == "SSIAP 3"


def test_listes_de_valeurs(client, db: Session) -> None:  # noqa: ANN001
    _, h = make_user(db, "lecture")
    assert client.get(f"{API}/listes-de-valeurs").status_code == 401
    listes = {x["code"]: x for x in client.get(f"{API}/listes-de-valeurs", headers=h).json()}
    attendues = {"types_de_lieu", "statuts_de_lieu", "categories_d_equipement", "types_de_partenaire", "domaines_de_veille",
                 "types_de_reclamation", "parties_prenantes", "publics_d_enquete", "types_de_titre"}
    assert attendues <= set(listes)
    lieux = {v["code"]: v["libelle"] for v in listes["types_de_lieu"]["valeurs"]}
    assert lieux == t.PREMISES_KINDS
    assert [v["code"] for v in listes["domaines_de_veille"]["valeurs"]] == list(t.WATCH_DOMAINS)
    assert listes["parties_prenantes"]["libelle"] and listes["types_de_lieu"]["source"] == "PREMISES_KINDS"


def test_les_listes_publiees_sont_celles_que_l_api_accepte(client, db: Session) -> None:  # noqa: ANN001
    _, h = make_user(db, "qualite")
    refus = client.post(f"{API}/partners", json={"kind": "INCONNU", "name": "X"}, headers=h)
    assert refus.status_code == 422 and all(k in refus.json()["detail"] for k in t.PARTNER_KINDS)
    assert client.post(f"{API}/partners", json={"kind": next(iter(t.PARTNER_KINDS)), "name": "X"},
                       headers=h).status_code == 201


def test_circuit_de_session(client, db: Session) -> None:  # noqa: ANN001
    _, h = make_user(db, "qualite")
    r = client.get(f"{API}/qualiopi/circuit", headers=h)
    assert r.status_code == 200
    circuit = r.json()
    assert circuit["code"] == "STANDARD" and circuit["jalons"]
    convention = circuit["jalons"][0]
    assert convention["cle"] == "J-15.convention" and convention["ancre"] == "start" and convention["decalage_jours"] == -15
    _, formateur = make_user(db, "formateur")
    assert client.get(f"{API}/qualiopi/circuit", headers=formateur).status_code == 403


def test_regles_de_financement_datees(client, db: Session) -> None:  # noqa: ANN001
    set_feature(db, "funding", True)
    _, h = make_user(db, "financement")
    r = client.get(f"{API}/financement/regles", headers=h, params={"le": "2026-06-01"})
    assert r.status_code == 200
    regles = {x["cle"]: x for x in r.json()}
    cpf = regles["cpf.participation_titulaire_eur"]
    assert cpf["description"] and len(cpf["valeurs"]) == 2
    assert cpf["en_vigueur"] == {"key": "cpf.participation_titulaire_eur", "value": 150, "since": "2026-04-01",
                                 "source": "Décret n° 2026-234 du 30 mars 2026"}
    assert cpf["valeurs"][0] == {"depuis": "2024-05-02", "valeur": 100, "source": "Décret n° 2024-394 du 29 avril 2024"}
