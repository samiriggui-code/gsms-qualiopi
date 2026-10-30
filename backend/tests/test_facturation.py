"""Facturation : numérotation continue, figeage, avoirs, encaissements, refus motivés et droits."""

from __future__ import annotations

import threading
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.application.service.invoicing import service
from app.application.service.platform.features import set_feature
from app.application.service.platform.settings import ConfigurationService
from app.database import db as core_db
from app.types import training as t
from app.types.editions import Project, QuoteLine
from app.types.invoicing import Invoice, Payment
from tests.conftest import make_user

BASE = "/api/v1/factures"
TODAY = date.today()
YEAR = TODAY.year


def _setup(db: Session, *, regime: str = "EXONERE", enable: bool = True) -> dict:
    db.add(t.Organization(name="Form'SSI", siret="12345678900011", nda_number="11756543210"))
    if enable:
        set_feature(db, "invoicing", True)
    config = ConfigurationService(db)
    config.set("documents.adresse", "12 rue de l'Exemple, 69003 Lyon")
    if regime != "NON_RENSEIGNE":
        config.set("documents.tva_regime", regime, reason="Attestation de l'organisme")
    company = t.Company(name="Sécurité Exemple", code="SECU69", siret="11111111100011", address="1 avenue Test",
                        postal_code="69007", city="Lyon")
    program = t.Program(code="SSIAP1", title="SSIAP 1", price_eur=Decimal("1200.00"), duration_hours=Decimal("67"))
    db.add_all([company, program])
    db.flush()
    session = t.TrainingSession(reference="SSIAP1-T-01", program_id=program.id, start_date=TODAY - timedelta(days=10),
                                end_date=TODAY - timedelta(days=6), status="TERMINEE")
    db.add(session)
    db.flush()
    enrollments = []
    for i in range(3):
        learner = t.Learner(first_name=f"Prénom{i}", last_name=f"Nom{i}")
        db.add(learner)
        db.flush()
        e = t.Enrollment(session_id=session.id, learner_id=learner.id, company_id=company.id, status="TERMINE")
        db.add(e)
        enrollments.append(e)
    db.commit()
    return {"company": company.id, "session": session.id, "enrollments": [e.id for e in enrollments],
            "program": program.id, "learner": enrollments[0].learner_id}


def _draft(client, h: dict, ids: dict, n: int | None = None) -> dict:
    body = {"client_type": "ENTREPRISE", "entreprise_id": ids["company"], "session_id": ids["session"]}
    if n is not None:
        body["inscription_ids"] = ids["enrollments"][:n]
    r = client.post(BASE, json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _issue(client, h: dict, invoice_id: str) -> dict:
    r = client.post(f"{BASE}/{invoice_id}/emettre", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_brouillon_sans_numero_puis_emission_numerotee_et_figee(client, db: Session) -> None:
    ids = _setup(db)
    _, h = make_user(db, "admin")
    draft = _draft(client, h, ids)
    assert draft["numero"] is None and draft["statut"] == "BROUILLON"
    assert len(draft["lignes"]) == 3 and draft["total_ttc_centimes"] == 360000
    assert draft["mention_tva"].startswith("TVA non applicable, article 261, 4, 4° a")
    assert draft["capabilities"]["emettre"]["allowed"] is True
    apercu = client.get(f"{BASE}/{draft['id']}/apercu", headers=h)
    assert "Brouillon" in apercu.text and "numéro attribué à l'émission" in apercu.text

    issued = _issue(client, h, draft["id"])
    assert issued["numero"] == f"FA-{YEAR}-0001" and issued["statut"] == "EMISE"
    assert issued["echeance"] == (TODAY + timedelta(days=30)).isoformat()
    assert issued["document"]["sha256"] and issued["capabilities"]["modifier"]["allowed"] is False
    page = client.get(f"{BASE}/{draft['id']}/apercu", headers=h)
    assert page.headers["X-Content-SHA256"] == issued["document"]["sha256"]
    assert f"FA-{YEAR}-0001" in page.text and "Opérations : prestations de services" in page.text
    assert "40 €" in page.text and "Escompte pour paiement anticipé : néant" in page.text
    # La fiche client change : la facture émise, elle, ne bouge pas.
    db.get(t.Company, ids["company"]).name = "Nouveau nom"
    db.commit()
    assert client.get(f"{BASE}/{draft['id']}/apercu", headers=h).text == page.text


def test_numerotation_continue_brouillon_supprime_sans_trou(client, db: Session) -> None:
    ids = _setup(db)
    _, h = make_user(db, "admin")
    a, b, c = (_draft(client, h, ids, 1) for _ in range(3))
    assert client.delete(f"{BASE}/{b['id']}", headers=h).status_code == 204
    assert [_issue(client, h, x["id"])["numero"] for x in (c, a)] == [f"FA-{YEAR}-0001", f"FA-{YEAR}-0002"]
    avoir = client.post(f"{BASE}/{a['id']}/avoirs", json={"motif": "Erreur de prix"}, headers=h).json()
    assert avoir["numero"] == f"AV-{YEAR}-0001", "les avoirs ont leur propre série"


def test_emission_qui_echoue_ne_consomme_aucun_numero(db: Session) -> None:
    ids = _setup(db)
    first = service.create(db, client_kind="ENTREPRISE", company_id=ids["company"], session_id=ids["session"],
                           actor="test", actor_id=None)
    db.commit()
    service.issue(db, first, "test", None)
    db.rollback()  # par exemple : rédaction interrompue
    first = db.get(Invoice, first.id)
    assert first.number is None and first.status == "BROUILLON"
    service.issue(db, first, "test", None)
    db.commit()
    assert first.number == f"FA-{YEAR}-0001"


def test_numerotation_sans_trou_en_concurrence(db: Session) -> None:
    ids = _setup(db)
    drafts = [service.create(db, client_kind="ENTREPRISE", company_id=ids["company"], session_id=ids["session"],
                             enrollment_ids=ids["enrollments"][:1], actor="test", actor_id=None).id for _ in range(8)]
    db.commit()
    errors: list[Exception] = []
    barrier = threading.Barrier(len(drafts))

    def work(invoice_id: str, fail: bool) -> None:
        s = core_db.session_factory()()
        try:
            barrier.wait()
            invoice = service.lock(s, invoice_id)
            service.issue(s, invoice, "test", None)
            if fail:
                raise RuntimeError("échec simulé après numérotation")
            s.commit()
        except RuntimeError:
            s.rollback()
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)
            s.rollback()
        finally:
            s.close()

    threads = [threading.Thread(target=work, args=(x, i == 3)) for i, x in enumerate(drafts)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    assert not errors
    db.expire_all()
    numbers = sorted(db.scalars(select(Invoice.number).where(Invoice.number.is_not(None))))
    assert numbers == [f"FA-{YEAR}-{i:04d}" for i in range(1, len(drafts))], "7 émises, numéros 1 à 7, aucun trou"


def test_refus_motives_avant_emission(client, db: Session) -> None:
    _setup(db, regime="NON_RENSEIGNE")
    _, h = make_user(db, "admin")
    r = client.post(BASE, json={"client_type": "FINANCEUR"}, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "CLIENT_MISSING"
    draft = client.post(BASE, json={"client_type": "FINANCEUR", "financeur": {"nom": "Opco Exemple"}}, headers=h).json()
    codes = {v["code"]: v for v in draft["verifications"]}
    assert {"VAT_REGIME", "CLIENT_ADDRESS", "NO_LINES", "SERVICE_DATE"} <= set(codes)
    assert codes["CLIENT_SIREN"]["bloquant"] is False and codes["VAT_REGIME"]["fondement"].startswith("CGI")
    r = client.post(f"{BASE}/{draft['id']}/emettre", headers=h)
    assert r.status_code == 409 and r.json()["error"] == "CHECKS_FAILED"
    assert all(d["bloquant"] for d in r.json()["details"])
    assert db.scalar(select(func.count()).select_from(Invoice).where(Invoice.number.is_not(None))) == 0


def test_facture_emise_ne_se_modifie_plus(client, db: Session) -> None:
    ids = _setup(db)
    _, h = make_user(db, "admin")
    invoice = _issue(client, h, _draft(client, h, ids)["id"])
    for method, path, body in (("patch", "", {"titre": "Autre"}), ("put", "/lignes", []), ("delete", "", None)):
        r = client.request(method.upper(), f"{BASE}/{invoice['id']}{path}", json=body, headers=h)
        assert r.status_code == 409 and r.json()["error"] == "NOT_DRAFT", (method, r.text)
    # Même en contournant l'API, la base refuse.
    with pytest.raises(DBAPIError):
        db.execute(text("UPDATE facturation.facture SET total_ttc_cents = 1 WHERE id = :i"), {"i": invoice["id"]})
    db.rollback()
    with pytest.raises(DBAPIError):
        db.execute(text("DELETE FROM facturation.facture_ligne WHERE invoice_id = :i"), {"i": invoice["id"]})
    db.rollback()
    with pytest.raises(DBAPIError):
        db.execute(text("DELETE FROM facturation.facture WHERE id = :i"), {"i": invoice["id"]})
    db.rollback()


def test_avoir_plafonne_au_restant_puis_annulation(client, db: Session) -> None:
    ids = _setup(db)
    _, h = make_user(db, "admin")
    invoice = _issue(client, h, _draft(client, h, ids)["id"])
    line = invoice["lignes"][0]
    r = client.post(f"{BASE}/{invoice['id']}/avoirs", headers=h,
                    json={"motif": "Trop", "lignes": [{"ligne_id": line["id"], "montant_ht_centimes": 120001}]})
    assert r.status_code == 409 and r.json()["error"] == "CREDIT_EXCEEDS_REMAINING"
    assert r.json()["details"][0]["restant"] == 120000
    r = client.post(f"{BASE}/{invoice['id']}/avoirs", headers=h,
                    json={"motif": "Autre facture", "lignes": [{"ligne_id": "inconnue", "montant_ht_centimes": 1}]})
    assert r.status_code == 409, "une ligne d'une autre facture est refusée"
    partial = client.post(f"{BASE}/{invoice['id']}/avoirs", headers=h, json={
        "motif": "Absence", "lignes": [{"ligne_id": line["id"], "montant_ht_centimes": 20000}]}).json()
    assert partial["type"] == "AVOIR" and partial["total_ttc_centimes"] == 20000
    page = client.get(f"{BASE}/{partial['id']}/apercu", headers=h).text
    assert f"Rectifie la facture n° {invoice['numero']}" in page
    detail = client.get(f"{BASE}/{invoice['id']}", headers=h).json()
    assert detail["reste_du_centimes"] == 340000 and detail["lignes"][0]["credite_centimes"] == 20000
    r = client.post(f"{BASE}/{partial['id']}/avoirs", json={"motif": "x"}, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "NOT_AN_INVOICE"
    total = client.post(f"{BASE}/{invoice['id']}/avoirs", json={"motif": "Annulation"}, headers=h).json()
    assert total["total_ttc_centimes"] == 340000
    detail = client.get(f"{BASE}/{invoice['id']}", headers=h).json()
    assert detail["statut"] == "ANNULEE" and detail["avoirs_centimes"] == detail["total_ttc_centimes"]
    r = client.post(f"{BASE}/{invoice['id']}/avoirs", json={"motif": "Encore"}, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "NOTHING_TO_CREDIT"


def test_tva_par_taux_et_avoir_total_sans_ecart_d_arrondi(client, db: Session) -> None:
    ids = _setup(db, regime="ASSUJETTI")
    ConfigurationService(db).set("facturation.numero_tva", "FR00123456789")
    db.commit()
    _, h = make_user(db, "admin")
    draft = client.post(BASE, json={"client_type": "ENTREPRISE", "entreprise_id": ids["company"]}, headers=h).json()
    draft = client.put(f"{BASE}/{draft['id']}/lignes", headers=h, json=[
        {"libelle": "Formation", "quantite": "3", "prix_unitaire_centimes": 3333, "exoneree": True},
        {"libelle": "Support imprimé", "quantite": "1", "prix_unitaire_centimes": 1001},
        {"libelle": "Repas", "quantite": "1", "prix_unitaire_centimes": 999, "tva_taux": "10", "remise_pct": "5"},
    ]).json()
    assert [g["taux"] for g in draft["tva"]] == [None, "10.00", "20.00"]
    assert {g["taux"]: g["tva_centimes"] for g in draft["tva"]} == {None: 0, "10.00": 95, "20.00": 200}
    assert draft["total_ht_centimes"] == 9999 + 1001 + 949 and draft["total_ttc_centimes"] == 11949 + 295
    client.patch(f"{BASE}/{draft['id']}", json={"prestation_au": TODAY.isoformat()}, headers=h)
    invoice = _issue(client, h, draft["id"])
    lines = invoice["lignes"]
    client.post(f"{BASE}/{invoice['id']}/avoirs", headers=h, json={
        "motif": "Moitié", "lignes": [{"ligne_id": lines[1]["id"], "montant_ht_centimes": 501}]})
    client.post(f"{BASE}/{invoice['id']}/avoirs", json={"motif": "Solde"}, headers=h)
    detail = client.get(f"{BASE}/{invoice['id']}", headers=h).json()
    assert detail["statut"] == "ANNULEE" and detail["avoirs_centimes"] == invoice["total_ttc_centimes"]


def test_encaissements_partiel_total_et_annulation(client, db: Session) -> None:
    ids = _setup(db)
    _, h = make_user(db, "admin")
    invoice = _issue(client, h, _draft(client, h, ids, 1)["id"])
    pay = f"{BASE}/{invoice['id']}/encaissements"
    body = {"montant_centimes": 50000, "recu_le": TODAY.isoformat(), "mode": "VIREMENT", "reference": "VIR 1"}
    detail = client.post(pay, json=body, headers=h).json()
    assert detail["statut"] == "PAYEE_PARTIELLEMENT" and detail["reste_du_centimes"] == 70000
    r = client.post(pay, json={**body, "montant_centimes": 70001}, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "PAYMENT_EXCEEDS_DUE"
    assert r.json()["details"][0]["reste_du_centimes"] == 70000
    assert client.post(pay, json={**body, "recu_le": (TODAY + timedelta(days=1)).isoformat()},
                       headers=h).status_code == 422
    assert client.post(pay, json={**body, "montant_centimes": 12.5}, headers=h).status_code == 422
    detail = client.post(pay, json={**body, "montant_centimes": 70000}, headers=h).json()
    assert detail["statut"] == "PAYEE" and detail["capabilities"]["encaisser"]["allowed"] is False
    r = client.post(pay, json={**body, "montant_centimes": 1}, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "INVALID_STATE"
    payment_id = detail["encaissements"][0]["id"]
    detail = client.post(f"/api/v1/encaissements/{payment_id}/annulation", json={"motif": "Rejet bancaire"},
                         headers=h).json()
    assert detail["statut"] == "PAYEE_PARTIELLEMENT" and detail["reste_du_centimes"] == 50000
    r = client.post(f"/api/v1/encaissements/{payment_id}/annulation", json={"motif": "x"}, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "ALREADY_CANCELLED"
    assert len(client.get("/api/v1/encaissements", headers=h).json()) == 1
    assert len(client.get("/api/v1/encaissements?annules=true", headers=h).json()) == 2
    with pytest.raises(DBAPIError):
        db.execute(text("DELETE FROM facturation.encaissement WHERE id = :i"), {"i": payment_id})
    db.rollback()
    overview = client.get(f"{BASE}/synthese", headers=h).json()
    assert overview["a_encaisser_centimes"] == 50000 and overview["encaisse_ce_mois_centimes"] == 70000


def test_retard_signale(client, db: Session) -> None:
    ids = _setup(db)
    invoice = service.create(db, client_kind="ENTREPRISE", company_id=ids["company"], session_id=ids["session"],
                             actor="test", actor_id=None)
    service.issue(db, invoice, "test", None, TODAY - timedelta(days=40))
    db.commit()
    _, h = make_user(db, "admin")
    late = client.get(f"{BASE}?en_retard=true", headers=h).json()
    assert [x["id"] for x in late] == [invoice.id]
    assert client.get(f"{BASE}/synthese", headers=h).json()["alertes"][0]["niveau"] == "danger"


def test_facture_depuis_un_devis_valide(client, db: Session) -> None:
    ids = _setup(db)
    _, h = make_user(db, "admin")
    quote = Project(reference="DEV-SECU69-001", kind="DEVIS", title="Devis SSIAP", status="BROUILLON",
                    company_id=ids["company"])
    quote.lines.append(QuoteLine(label="SSIAP 1", quantity=Decimal(2), unit="STAGIAIRE", unit_price=Decimal("1100.50"),
                                 discount_pct=Decimal(0)))
    db.add(quote)
    db.commit()
    body = {"client_type": "ENTREPRISE", "entreprise_id": ids["company"], "devis_id": quote.id}
    r = client.post(BASE, json=body, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "QUOTE_NOT_VALIDATED"
    quote.status = "VALIDE"
    db.commit()
    other = t.Company(name="Autre", code="AUTRE")
    db.add(other)
    db.commit()
    r = client.post(BASE, json={**body, "entreprise_id": other.id}, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "QUOTE_OTHER_CLIENT"
    draft = client.post(BASE, json=body, headers=h).json()
    assert draft["devis_id"] == quote.id and draft["total_ht_centimes"] == 220100


def test_droits_et_module(client, db: Session) -> None:
    ids = _setup(db, enable=False)
    _, admin = make_user(db, "admin")
    r = client.get(BASE, headers=admin)
    assert r.status_code == 403 and "désactivé" in r.json()["detail"], "module désactivé par défaut"
    set_feature(db, "invoicing", True)
    db.commit()
    _, gestion = make_user(db, "gestion")
    _, lecture = make_user(db, "lecture")
    _, financement = make_user(db, "financement")
    _, formateur = make_user(db, "formateur")
    assert client.get(BASE, headers=lecture).status_code == 403
    assert client.get(BASE, headers=formateur).status_code == 403
    draft = _draft(client, gestion, ids)
    assert draft["capabilities"]["emettre"]["allowed"] is False
    assert draft["capabilities"]["emettre"]["code"] == "PERMISSION_MISSING"
    assert client.post(f"{BASE}/{draft['id']}/emettre", headers=gestion).status_code == 403
    invoice = _issue(client, financement, draft["id"])
    pay = {"montant_centimes": 100, "recu_le": TODAY.isoformat(), "mode": "CHEQUE"}
    assert client.post(f"{BASE}/{invoice['id']}/encaissements", json=pay, headers=gestion).status_code == 403
    assert client.post(f"{BASE}/{invoice['id']}/avoirs", json={"motif": "x"}, headers=gestion).status_code == 403
    assert client.post(f"{BASE}/{invoice['id']}/encaissements", json=pay, headers=financement).status_code == 201
    assert client.get(f"{BASE}/inconnue", headers=financement).status_code == 404


def test_demo_factures_puis_retrait(demo: Session) -> None:
    from app.application.service.demo import remove_demo
    from app.types.qualiopi_audit import Sequence

    statuses = sorted(demo.scalars(select(Invoice.status).where(Invoice.kind == "FACTURE")))
    assert statuses == ["BROUILLON", "EMISE", "PAYEE", "PAYEE_PARTIELLEMENT"]
    assert demo.scalar(select(func.count()).select_from(Invoice).where(Invoice.kind == "AVOIR")) == 1
    assert all(n.startswith("DEMO-") for n in demo.scalars(select(Invoice.number).where(Invoice.number.is_not(None))))
    remove_demo(demo)
    demo.commit()
    assert demo.scalar(select(func.count()).select_from(Invoice)) == 0
    assert demo.scalar(select(func.count()).select_from(Payment)) == 0
    assert demo.scalar(select(func.count()).select_from(Sequence).where(Sequence.name.like("DEMO-%"))) == 0


def test_mise_a_jour_refuse_titre_ou_client_vide(client, db: Session) -> None:
    ids = _setup(db)
    _, h = make_user(db, "admin")
    draft = _draft(client, h, ids, 1)
    for field in ("titre", "client_nom"):
        r = client.patch(f"{BASE}/{draft['id']}", json={field: None}, headers=h)
        assert r.status_code == 422, (field, r.status_code)


def test_synthese_ignore_les_brouillons(client, db: Session) -> None:
    ids = _setup(db)
    _, h = make_user(db, "admin")
    draft = _draft(client, h, ids, 1)
    client.patch(f"{BASE}/{draft['id']}", json={"echeance": (TODAY + timedelta(days=3)).isoformat()}, headers=h)
    overview = client.get(f"{BASE}/synthese", headers=h).json()
    assert overview["a_encaisser_centimes"] == 0 and overview["alertes"] == []
    assert overview["brouillons"] == 1
