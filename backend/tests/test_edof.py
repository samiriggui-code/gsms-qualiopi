"""Référencement EDOF : fiche formation versionnée, contrôles exploitables, pièces, cycle déclaratif."""

from datetime import date, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.models import User
from app.edof import checks, fiche, service
from app.edof import models as m
from app.edof.formssi import import_formssi
from app.platform.decisions import PolicyDenied
from app.training import models as t
from tests.conftest import make_user

PDF = b"%PDF-1.4\n% piece\n%%EOF\n"
TODAY = date.today()
SIRET = "85372584400015"
ADMIN_PERMS = frozenset({"edof.read", "edof.write", "edof.validate", "edof.sensitive", "sessions.write",
                         "programs.validate"})


@pytest.fixture
def formssi(db: Session) -> Session:
    import_formssi(db)
    db.commit()
    return db


def _admin(db: Session) -> User:
    user = db.scalar(select(User).where(User.email == "direction@test.local"))
    return user or make_user(db, "admin", "direction@test.local")[0]


def _tfp(db: Session) -> t.Program:
    return db.scalar(select(t.Program).where(t.Program.catalog_slug == "tfp-aps"))


def _messages(db: Session, dossier: m.Dossier) -> list[str]:
    return [a.message for a in checks.anomalies(db, dossier, TODAY)]


def _upload(db: Session, dossier: m.Dossier, code: str, **meta) -> m.Piece:
    return service.upload_piece(db, dossier, code, content=PDF + code.encode(), filename=f"{code}.pdf",
                                mime="application/pdf", user=_admin(db), perms=ADMIN_PERMS, meta=meta)


# ── Import des données réelles ───────────────────────────────────────────────────


def test_import_formssi_reprend_les_sources_sans_inventer(formssi: Session) -> None:
    org = formssi.scalar(select(t.Organization))
    assert (org.name, org.siret, org.nda_number) == ("FORM' SSI", SIRET, None)
    p = _tfp(formssi)
    assert [mod["code"] for mod in p.modules] == [f"UV{i}" for i in range(1, 15)]
    assert p.duration_hours is None and p.price_eur is None and p.objectives == []
    assert any("140 h à 175 h" in n["message"] for n in p.review_notes), "la divergence de durée est visible"
    cert = fiche.certification_of(formssi, p.id)
    assert (cert.basis, cert.habilitation) == ("A_DETERMINER", "A_VERIFIER")
    assert all(r.status == "A_REDIGER" for r in fiche.resources_of(formssi, p.id)), "contenus générés : à rédiger"
    assert service.formation_dossier(formssi, p.id) is not None


def test_import_idempotent_et_ne_remplace_aucune_saisie(formssi: Session) -> None:
    est = formssi.scalar(select(m.Establishment))
    est.legal_name = "FORM'SSI SARL (saisie)"
    formssi.commit()
    out = import_formssi(formssi)
    formssi.commit()
    assert out["formations"] == []
    assert est.legal_name == "FORM'SSI SARL (saisie)"
    assert any("Écart conservé (établissement.legal_name)" in line for line in out["report"])
    assert formssi.scalar(select(func.count()).select_from(t.Program)) == 1


# ── Contrôles ────────────────────────────────────────────────────────────────────


def test_formation_importee_dossier_incomplet_avec_messages_exploitables(formssi: Session) -> None:
    d = service.formation_dossier(formssi, _tfp(formssi).id)
    found = checks.anomalies(formssi, d, TODAY)
    messages = [a.message for a in found]
    for expected in ("Programme non validé", "Fondement d'éligibilité CPF non identifié", "Modalités d'évaluation manquantes",
                     "Tarif manquant", "Objectifs manquants", "Aucun intervenant associé",
                     "Dossier de l'établissement incomplet"):
        assert expected in messages, expected
    assert any(msg.startswith("Contenu à rédiger") for msg in messages)
    assert any(msg.startswith("Autorisation à vérifier") for msg in messages)
    assert service.display_status(d, found) == "INCOMPLET"
    # Chaque anomalie mène à ce qu'il faut corriger.
    evaluation = next(a for a in found if a.message == "Modalités d'évaluation manquantes")
    assert (evaluation.etape, evaluation.cible) == ("programme", {"type": "champ", "champ": "evaluation_methods"})


def test_etablissement_pieces_selon_la_situation(formssi: Session) -> None:
    d = service.establishment_dossier(formssi)
    found = checks.anomalies(formssi, d, TODAY)
    messages = [a.message for a in found]
    assert "NDA non renseigné" in messages
    assert "Accès EFP Connect habilité à EDOF manquant" in messages
    kbis = [msg for msg in messages if "Kbis" in msg and msg.startswith("Pièce manquante")]
    assert kbis == ["Pièce manquante : Extrait Kbis de moins de 3 mois ou Extrait du registre national des entreprises (RNE)"]
    # Nature du représentant inconnue : la pièce d'identité est « peut-être requise », pas inventée.
    identity = next(a for a in found if a.cible.get("code") == "IDENTITE_REPRESENTANT")
    assert identity.code == "APPLICABILITE_A_DETERMINER" and identity.niveau == "A_VERIFIER"
    assert not any("association" in msg.lower() for msg in messages), "pièces d'association non applicables"


def test_justificatif_expire_et_siret_different(formssi: Session) -> None:
    d = service.establishment_dossier(formssi)
    _upload(formssi, d, "KBIS", issued_on=TODAY - timedelta(days=100), siret_on_document="85372584400023")
    formssi.commit()
    found = [a for a in checks.anomalies(formssi, d, TODAY) if a.cible.get("code") == "KBIS"]
    assert {a.message for a in found} >= {"Justificatif expiré", "SIRET différent de celui de l'établissement"}
    assert not any(a.message.startswith("Pièce manquante : Extrait Kbis") for a in checks.anomalies(formssi, d, TODAY))
    # Nouvelle version : la précédente reste dans l'historique, jamais écrasée.
    _upload(formssi, d, "KBIS", issued_on=TODAY - timedelta(days=5), siret_on_document=SIRET)
    formssi.commit()
    kbis = [p for p in d.pieces if p.requirement == "KBIS"]
    assert len(kbis) == 2 and sum(1 for p in kbis if p.replaced_at is None) == 1
    current = [a.message for a in checks.anomalies(formssi, d, TODAY) if a.cible.get("code") == "KBIS"]
    assert current == ["Pièce à valider : Extrait Kbis de moins de 3 mois"]
    docs = formssi.scalars(select(t.Document).where(t.Document.entity_type == "EDOF")).all()
    assert sorted((doc.version, doc.status) for doc in docs) == [(1, "REMPLACE"), (2, "EMIS")]


def test_habilitation_et_siret_du_partenaire(formssi: Session) -> None:
    p = _tfp(formssi)
    cert = fiche.certification_of(formssi, p.id)
    cert.basis, cert.code, cert.registration_end = "RNCP", "RNCP36648", date(2027, 7, 1)
    cert.habilitation, cert.partner_siret = "FORMER", "12345678200010"
    formssi.commit()
    found = checks.anomalies(formssi, service.formation_dossier(formssi, p.id), TODAY)
    messages = [a.message for a in found]
    assert "SIRET différent de celui de l'établissement" in messages
    assert "Habilitation à vérifier" in messages
    assert "Partenaire évaluateur à identifier" in messages, "former n'est pas organiser l'évaluation"
    assert "Pièce manquante : Convention de partenariat avec l'organisme évaluateur" in messages
    assert "Validité et périmètre de la certification à vérifier" in messages
    cert.registration_end = TODAY - timedelta(days=1)
    formssi.commit()
    expired = [a for a in checks.anomalies(formssi, service.formation_dossier(formssi, p.id), TODAY)
               if a.code == "CERTIFICATION_EXPIREE"]
    assert expired and expired[0].message == "Justificatif expiré"


def test_correspondance_competences_evaluation(formssi: Session) -> None:
    p = _tfp(formssi)
    cert = fiche.certification_of(formssi, p.id)
    cert.basis, cert.code = "RNCP", "RNCP36648"
    cert.competence_mapping = [{"competence": "Contrôler les accès", "modules": ["UV8"], "evaluation": ""},
                               {"competence": "Secourir", "modules": ["UV99"], "evaluation": "Mise en situation"}]
    formssi.commit()
    found = checks.anomalies(formssi, service.formation_dossier(formssi, p.id), TODAY)
    details = {(a.message, a.detail) for a in found if a.etape == "certification"}
    assert ("Modalités d'évaluation manquantes", "Compétence « Contrôler les accès » : aucune modalité d'évaluation.") in details
    assert ("Module inconnu dans la correspondance", "Compétence « Secourir » : UV99 absent(s) du programme.") in details


# ── Fiche formation versionnée ───────────────────────────────────────────────────


def _complete_program(db: Session, p: t.Program) -> None:
    p.objectives = ["Contrôler les accès d'un site"]
    p.skills = ["Surveiller et contrôler les accès"]
    p.duration_hours = 175
    p.teaching_means = "Salle équipée, poste de sécurité pédagogique, matériel de secourisme"
    p.accessibility_info = "Accessibilité étudiée avec le référent handicap"
    p.evaluation_methods = "Épreuves définies par le certificateur"
    p.access_delay = "Deux semaines"
    p.price_eur = 1500
    tr = t.Trainer(first_name="Alex", last_name="Martin")
    db.add(tr)
    db.flush()
    db.add(t.ProgramTrainer(program_id=p.id, trainer_id=tr.id))
    db.flush()


def test_validation_figee_et_modification_ulterieure(formssi: Session) -> None:
    p = _tfp(formssi)
    with pytest.raises(PolicyDenied) as refused:
        fiche.validate_version(formssi, p, _admin(formssi))
    assert "Modalités d'évaluation manquantes" in refused.value.details
    _complete_program(formssi, p)
    v1 = fiche.validate_version(formssi, p, _admin(formssi))
    formssi.commit()
    assert fiche.version_state(formssi, p)["state"] == "VALIDEE"
    p.price_eur = 1700
    formssi.commit()
    assert fiche.version_state(formssi, p)["state"] == "MODIFIEE"
    assert "Programme non validé" in _messages(formssi, service.formation_dossier(formssi, p.id))
    html = fiche.render_programme(v1)
    assert "1500.00 €" in html and "1700" not in html, "le programme émis reste celui de la version 1"
    assert "UV14 — Module industriel spécifique" in html


# ── Cycle déclaratif ─────────────────────────────────────────────────────────────


def _ready_establishment(db: Session) -> m.Dossier:
    org = db.scalar(select(t.Organization))
    org.nda_number = "11 92 12345 92"
    est = db.scalar(select(m.Establishment))
    for key, value in dict(representative_kind="PERSONNE_MORALE", representative_name="Gérance", qualiopi_certificate="Q-1",
                           qualiopi_valid_until=TODAY + timedelta(days=300), qualiopi_categories=["AF"],
                           efp_connect_status="HABILITE", bpf_last_year=TODAY.year - 1, cgu_version_read="15",
                           cgu_read_on=TODAY, uses_subcontracting=False, identity_checked_on=TODAY, nda_checked_on=TODAY,
                           qualiopi_checked_on=TODAY, obligations_checked_on=TODAY).items():
        setattr(est, key, value)
    d = service.establishment_dossier(db)
    for code in ("KBIS", "IMMATRICULATION_REPRESENTANT_PM"):
        piece = _upload(db, d, code, issued_on=TODAY - timedelta(days=10), siret_on_document=SIRET)
        service.review_piece(db, piece.id, approve=True, reason=None, user=_admin(db))
    db.commit()
    return d


def test_cycle_etablissement_jusqua_la_decision(formssi: Session) -> None:
    d = _ready_establishment(formssi)
    user = _admin(formssi)
    assert service.display_status(d, checks.anomalies(formssi, d, TODAY)) == "PRET_VALIDATION_INTERNE"
    service.transition(formssi, d, "valider", user, ADMIN_PERMS, {})
    with pytest.raises(Exception, match="rouvrez-le"):
        _upload(formssi, d, "STATUTS")
    service.transition(formssi, d, "declarer_depot", user, ADMIN_PERMS, {"date": TODAY, "reference": "DEM-1"})
    assert d.status == "DEPOSE" and d.submission_snapshot["pieces"]
    assert "Accompagnement obligatoire de la CDC : aucun suivi enregistré" in _messages(formssi, d)
    service.transition(formssi, d, "enregistrer_complements", user, ADMIN_PERMS,
                       {"items": [{"requirement": "ATTESTATION_VIGILANCE", "due_on": TODAY + timedelta(days=14)}]})
    assert "Pièce demandée par la CDC non fournie" in _messages(formssi, d)
    with pytest.raises(PolicyDenied, match="non fournie"):
        service.transition(formssi, d, "declarer_complements_transmis", user, ADMIN_PERMS, {})
    complement = d.complements[0]
    _upload(formssi, d, "ATTESTATION_VIGILANCE", issued_on=TODAY, siret_on_document=SIRET, complement_id=complement.id)
    assert complement.status == "FOURNIE"
    service.transition(formssi, d, "declarer_complements_transmis", user, ADMIN_PERMS, {})
    service.transition(formssi, d, "enregistrer_decision", user, ADMIN_PERMS,
                       {"decision": "ACCEPTEE", "date": TODAY, "note": "Courrier reçu sur EDOF"})
    formssi.commit()
    assert (d.status, d.decision) == ("DECISION_RECUE", "ACCEPTEE")


def test_validation_interne_refusee_tant_que_des_points_restent_a_verifier(formssi: Session) -> None:
    d = _ready_establishment(formssi)
    piece = _upload(formssi, d, "KBIS", issued_on=TODAY, siret_on_document=SIRET)  # nouvelle version, à valider
    decision = service.capability(formssi, d, "valider", ADMIN_PERMS, TODAY)
    assert decision.code == "VERIFICATIONS_EN_ATTENTE" and "Pièce à valider : Extrait Kbis de moins de 3 mois" in decision.details
    assert service.capability(formssi, d, "valider", ADMIN_PERMS - {"edof.validate"}, TODAY).code == "PERMISSION"
    service.review_piece(formssi, piece.id, approve=True, reason=None, user=_admin(formssi))
    assert service.capability(formssi, d, "valider", ADMIN_PERMS, TODAY).allowed


def test_offre_deposee_apres_letablissement_et_version_figee(formssi: Session) -> None:
    p = _tfp(formssi)
    _complete_program(formssi, p)
    cert = fiche.certification_of(formssi, p.id)
    cert.basis, cert.code, cert.registration_end = "RNCP", "RNCP36648", date(2027, 7, 1)
    cert.habilitation, cert.partner_siret, cert.evaluator_name = "FORMER_ET_EVALUER", SIRET, None
    cert.checked_on = cert.habilitation_checked_on = TODAY
    cert.competence_mapping = [{"competence": "Contrôler les accès", "modules": ["UV8"], "evaluation": "Mise en situation"}]
    cert.other_requirements = [{**cert.other_requirements[0], "verified_on": TODAY.isoformat()}]
    for r in fiche.resources_of(formssi, p.id):
        r.status = "VALIDE"
    formssi.add(t.TrainerQualification(trainer_id=fiche.trainers_of(formssi, p.id)[0][1].id, label="Carte formateur",
                                       valid_until=TODAY + timedelta(days=200)))
    v1 = fiche.validate_version(formssi, p, _admin(formssi))
    d = service.formation_dossier(formssi, p.id)
    for code in ("JUSTIFICATIF_HABILITATION", "AUTORISATION_EXERCICE"):
        piece = _upload(formssi, d, code, siret_on_document=SIRET, valid_until=TODAY + timedelta(days=400))
        service.review_piece(formssi, piece.id, approve=True, reason=None, user=_admin(formssi))
    parent = _ready_establishment(formssi)
    assert [a.message for a in checks.anomalies(formssi, d, TODAY)] == []
    service.transition(formssi, d, "valider", _admin(formssi), ADMIN_PERMS, {})
    refused = service.capability(formssi, d, "declarer_depot", ADMIN_PERMS, TODAY)
    assert refused.code == "ETABLISSEMENT_NON_DEPOSE"
    service.transition(formssi, parent, "valider", _admin(formssi), ADMIN_PERMS, {})
    service.transition(formssi, parent, "declarer_depot", _admin(formssi), ADMIN_PERMS, {"date": TODAY})
    service.transition(formssi, d, "declarer_depot", _admin(formssi), ADMIN_PERMS, {"date": TODAY})
    formssi.commit()
    assert d.program_version_id == v1.id and d.submission_snapshot["programme"]["version"] == 1
    p.access_delay = "Un mois"  # la fiche évolue après le dépôt
    formssi.commit()
    assert d.submission_snapshot["programme"]["sha256"] == v1.sha256
    assert "Programme non validé" not in _messages(formssi, d), "un dossier déposé reste lié à sa version"


# ── Pièces partagées et sensibles (API) ──────────────────────────────────────────


def test_piece_commune_rattachee_sans_copie(formssi: Session) -> None:
    p1 = _tfp(formssi)
    p2 = t.Program(code="SSIAP1", title="SSIAP 1", action_category="AF")
    formssi.add(p2)
    formssi.flush()
    d1 = service.formation_dossier(formssi, p1.id)
    d2 = service.formation_dossier(formssi, p2.id, create=True)
    piece = _upload(formssi, d1, "JUSTIFICATIFS_INTERVENANTS")
    before = formssi.scalar(select(func.count()).select_from(t.Document))
    shared = service.link_piece(formssi, d2, "JUSTIFICATIFS_INTERVENANTS", piece.document_id, user=_admin(formssi),
                                perms=ADMIN_PERMS, meta={})
    formssi.commit()
    assert shared.document_id == piece.document_id and shared.shared
    assert formssi.scalar(select(func.count()).select_from(t.Document)) == before
    service.review_piece(formssi, shared.id, approve=False, reason="Contrat manquant pour un intervenant", user=_admin(formssi))
    assert piece.status == "A_VALIDER", "chaque dossier garde sa propre validation"


def test_pieces_sensibles_reservees(client, formssi: Session) -> None:  # noqa: ANN001
    _, qualite = make_user(formssi, "qualite")
    _, admin = make_user(formssi, "admin", "admin2@test.local")
    d = service.establishment_dossier(formssi)
    formssi.commit()
    url = f"/api/v1/edof/dossiers/{d.id}/pieces/DECLARATION_NON_CONDAMNATION"
    files = {"file": ("dnc.pdf", PDF, "application/pdf")}
    refused = client.post(url, headers=qualite, files=files, data={"issued_on": TODAY.isoformat()})
    assert refused.status_code == 422 and "sensible" in refused.json()["detail"]
    ok = client.post(url, headers=admin, files=files, data={"issued_on": TODAY.isoformat()})
    assert ok.status_code == 200, ok.text
    piece_id = ok.json()["id"]
    view = client.get(f"/api/v1/edof/dossiers/{d.id}", headers=qualite).json()
    row = next(x for x in view["pieces"] if x["code"] == "DECLARATION_NON_CONDAMNATION")
    assert row["piece"]["restricted"] and row["piece"]["document"] is None
    assert client.get(f"/api/v1/edof/pieces/{piece_id}/contenu", headers=qualite).status_code == 403
    assert client.get(f"/api/v1/documents/{ok.json()['document_id']}/contenu", headers=qualite).status_code == 403
    assert client.get(f"/api/v1/edof/pieces/{piece_id}/contenu", headers=admin).content == PDF


def test_api_vue_etablissement_et_capacites(client, formssi: Session) -> None:  # noqa: ANN001
    _, admin = make_user(formssi, "admin")
    _, lecture = make_user(formssi, "lecture")
    body = client.get("/api/v1/edof/etablissement", headers=admin).json()
    assert body["dossier"]["display_label"] == "Dossier incomplet"
    assert "n'est pas une acceptation" in body["dossier"]["reminder"]
    assert any(f["code"] == "TFP-APS" and f["dossier"] for f in body["formations"])
    caps = client.get("/api/v1/edof/etablissement", headers=lecture).json()["dossier"]["capabilities"]
    assert caps["valider"]["code"] == "PERMISSION"
    patch = client.patch("/api/v1/edof/etablissement", headers=lecture, json={"nda_number": "1"})
    assert patch.status_code == 403
    attest = client.patch("/api/v1/edof/etablissement", headers=admin, json={"nda_number": "11 92 12345 92",
                                                                             "nda_checked_on": TODAY.isoformat()})
    assert attest.status_code == 200
    messages = [a["message"] for a in attest.json()["dossier"]["anomalies"]]
    assert "NDA non renseigné" not in messages and "NDA actif à vérifier" not in messages


def test_api_fiche_programme_et_apercu(client, formssi: Session) -> None:  # noqa: ANN001
    _, admin = make_user(formssi, "admin")
    p = _tfp(formssi)
    fiche_view = client.get(f"/api/v1/fiches/{p.id}", headers=admin).json()
    assert fiche_view["capabilities"]["validate"]["code"] == "FICHE_INCOMPLETE"
    assert fiche_view["version_state"]["state"] == "JAMAIS_VALIDEE"
    _complete_program(formssi, p)
    formssi.commit()
    created = client.post(f"/api/v1/fiches/{p.id}/versions", headers=admin, json={"note": "Relu"})
    assert created.status_code == 201, created.text
    vid = created.json()["id"]
    html = client.get(f"/api/v1/fiches/{p.id}/versions/{vid}/programme", headers=admin)
    assert html.status_code == 200 and "Agent de prévention et de sécurité (TFP APS)" in html.text
    preview = client.get(f"/api/v1/fiches/{p.id}/versions/{vid}/apercu-public", headers=admin).json()
    assert preview["mention_cpf"] is None, "aucune mention CPF sans offre constatée sur EDOF"
    patch = client.patch(f"/api/v1/programs/{p.id}", headers=admin,
                         json={"modules": [{"code": "UV1", "title": "Secourisme", "details": [], "hours": 14}]})
    assert patch.status_code == 200, patch.text
    assert client.get(f"/api/v1/fiches/{p.id}", headers=admin).json()["version_state"]["state"] == "MODIFIEE"
    suivi = client.get(f"/api/v1/fiches/{p.id}/suivi-pedagogique", headers=admin).json()
    assert suivi["sessions"] == [] and any("connexion" in line for line in suivi["limits"])


def test_attestation_de_verification_reservee_et_retombe_si_la_valeur_change(client, formssi: Session) -> None:  # noqa: ANN001
    _, gestion = make_user(formssi, "gestion")
    _, admin = make_user(formssi, "admin")
    p = _tfp(formssi)
    put = client.put(f"/api/v1/fiches/{p.id}/certification", headers=gestion,
                     json={"basis": "RNCP", "code": "RNCP36648", "registration_end": "2027-07-01"})
    assert put.status_code == 200, put.text
    assert client.post(f"/api/v1/fiches/{p.id}/verifications", headers=gestion, json={"quoi": "certification"}).status_code == 403
    assert client.post(f"/api/v1/fiches/{p.id}/verifications", headers=admin, json={"quoi": "certification"}).status_code == 200
    cert = client.put(f"/api/v1/fiches/{p.id}/certification", headers=gestion, json={"code": "RNCP38451"}).json()
    assert cert["checked_on"] is None, "une vérification porte sur une valeur précise"
