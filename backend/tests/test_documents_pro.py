"""Documents professionnels : code client, numérotation par client, vérifications, circuit et archivage."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.service.platform.settings import ConfigurationService
from app.application.service.qualiopi.engine import scope_of
from app.types import training as t
from app.types.editions import Project
from app.types.event import OutboxEvent
from tests.conftest import make_user

BASE = "/api/v1/editions"


def _setup(db: Session, *, regime: str = "EXONERE") -> dict:
    db.add(t.Organization(name="Form'SSI", siret="12345678900011", nda_number="11756543210"))
    config = ConfigurationService(db)
    config.set("documents.adresse", "12 rue de l'Exemple, 69003 Lyon")
    if regime != "NON_RENSEIGNE":
        config.set("documents.tva_regime", regime, reason="Attestation de l'organisme")
    company = t.Company(name="Sécurité Exemple", code="SECU69", address="1 avenue Test", postal_code="69007",
                        city="Lyon", contact_name="Mme Martin")
    other = t.Company(name="Autre Client", code="AUTRE")
    program = t.Program(code="SSIAP1", title="SSIAP 1", price_eur=Decimal("1200"), duration_hours=Decimal("67"))
    db.add_all([company, other, program])
    db.commit()
    return {"company": company.id, "other": other.id, "program": program.id}


def _line(program_id: str | None = None, price: float | None = 1100, qty: float = 6) -> dict:
    return {"formation_id": program_id, "libelle": "SSIAP 1 · formation initiale", "quantite": qty,
            "unite": "STAGIAIRE", "prix_unitaire": price}


def test_numerotation_propre_a_chaque_client(client, db: Session) -> None:
    ids = _setup(db)
    _, h = make_user(db, "admin")
    refs = [client.post(BASE, json={"client_id": ids["company"]}, headers=h).json()["reference"] for _ in range(2)]
    refs.append(client.post(BASE, json={"client_id": ids["other"]}, headers=h).json()["reference"])
    assert refs == ["DEV-SECU69-001", "DEV-SECU69-002", "DEV-AUTRE-001"]


def test_code_client_obligatoire_et_normalise(client, db: Session) -> None:
    _setup(db)
    _, h = make_user(db, "admin")
    bare = client.post("/api/v1/companies", json={"name": "Sans Code"}, headers=h).json()
    r = client.post(BASE, json={"client_id": bare["id"]}, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "CLIENT_CODE_MISSING"
    r = client.patch(f"/api/v1/companies/{bare['id']}", json={"code": " sc 1"}, headers=h)
    assert r.status_code == 422, "espaces interdits dans le code"
    r = client.patch(f"/api/v1/companies/{bare['id']}", json={"code": "sc01"}, headers=h)
    assert r.status_code == 200 and r.json()["code"] == "SC01"
    r = client.patch(f"/api/v1/companies/{bare['id']}", json={"code": "SECU69"}, headers=h)
    assert r.status_code == 409, "un code ne sert qu'à un client"


def test_types_pas_encore_construits_refuses(client, db: Session) -> None:
    ids = _setup(db)
    _, h = make_user(db, "admin")
    r = client.post(BASE, json={"client_id": ids["company"], "type": "PROPOSITION"}, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "NOT_BUILT"


def test_verifications_bloquent_la_relecture(client, db: Session) -> None:
    ids = _setup(db, regime="NON_RENSEIGNE")
    _, h = make_user(db, "admin")
    devis = client.post(BASE, json={"client_id": ids["other"]}, headers=h).json()
    codes = {v["code"] for v in devis["verifications"]}
    assert codes == {"VAT_REGIME", "CLIENT_ADDRESS", "NO_LINES"}
    assert devis["capabilities"]["soumettre"]["allowed"] is False
    devis = client.put(f"{BASE}/{devis['id']}/lignes", json=[_line(price=None)], headers=h).json()
    assert "LINE_PRICE" in {v["code"] for v in devis["verifications"]}
    r = client.post(f"{BASE}/{devis['id']}/actions/soumettre", json={}, headers=h)
    assert r.status_code == 409 and r.json()["error"] == "CHECKS_FAILED"


def test_tarif_a_confirmer_bloque_tant_qu_il_est_repris_tel_quel(client, db: Session) -> None:
    ids = _setup(db)
    db.get(t.Program, ids["program"]).review_notes = [{"champ": "price_eur", "message": "Prix « à partir de »"}]
    db.commit()
    _, h = make_user(db, "admin")
    devis = client.post(BASE, json={"client_id": ids["company"]}, headers=h).json()
    devis = client.put(f"{BASE}/{devis['id']}/lignes", json=[_line(ids["program"], price=1200)], headers=h).json()
    assert [v["code"] for v in devis["verifications"]] == ["PRICE_TO_CONFIRM"]
    devis = client.put(f"{BASE}/{devis['id']}/lignes", json=[_line(ids["program"], price=1100)], headers=h).json()
    assert devis["verifications"] == []


def test_montants_tva_exoneree_et_assujettie(client, db: Session) -> None:
    ids = _setup(db)
    _, h = make_user(db, "admin")
    devis = client.post(BASE, json={"client_id": ids["company"]}, headers=h).json()
    lines = [_line(price=1100, qty=6), {**_line(price=333.33, qty=1), "libelle": "Déplacement", "remise_pct": 10}]
    devis = client.put(f"{BASE}/{devis['id']}/lignes", json=lines, headers=h).json()
    assert [x["montant_ht"] for x in devis["lignes"]] == [6600.0, 300.0]
    assert devis["totaux"]["total_ht"] == 6900.0 and devis["totaux"]["tva"] == 0.0
    assert devis["totaux"]["total_ttc"] == 6900.0 and "261" in devis["totaux"]["mention_tva"]
    ConfigurationService(db).set("documents.tva_regime", "ASSUJETTI", reason="Changement de régime")
    db.commit()
    devis = client.get(f"{BASE}/{devis['id']}", headers=h).json()
    assert devis["totaux"]["tva"] == 1380.0 and devis["totaux"]["total_ttc"] == 8280.0
    assert devis["totaux"]["mention_tva"] is None


def test_circuit_complet_et_archive_versionnee(client, db: Session) -> None:
    ids = _setup(db)
    _, author = make_user(db, "gestion")
    _, quality = make_user(db, "qualite")
    devis = client.post(BASE, json={"client_id": ids["company"]}, headers=author).json()
    pid = devis["id"]
    client.put(f"{BASE}/{pid}/lignes", json=[_line(ids["program"])], headers=author)
    apercu = client.get(f"{BASE}/{pid}/apercu", headers=author).text
    assert "Brouillon · non validé" in apercu and "DEV-SECU69-001" in apercu and "6 600,00 €" in apercu

    assert client.post(f"{BASE}/{pid}/actions/soumettre", json={}, headers=author).status_code == 200
    r = client.post(f"{BASE}/{pid}/actions/valider", json={}, headers=author)
    assert r.status_code == 409 and r.json()["error"] == "PERMISSION_MISSING", "la gestion ne valide pas"
    r = client.patch(f"{BASE}/{pid}", json={"titre": "Autre"}, headers=author)
    assert r.status_code == 409 and r.json()["error"] == "NOT_DRAFT"

    v1 = client.post(f"{BASE}/{pid}/actions/valider", json={}, headers=quality).json()
    assert v1["statut"] == "VALIDE" and v1["version"] == 1 and len(v1["versions"]) == 1
    archived = client.get(f"{BASE}/{pid}/versions/{v1['versions'][0]['id']}", headers=author).text
    assert "Brouillon" not in archived and "Version 1 validée" in archived and "261" in archived
    assert "ne vaut pas agrément de l'État" in archived
    doc = db.get(t.Document, v1["versions"][0]["id"])
    assert doc.kind == "DEVIS" and doc.indicator_hints == [] and doc.sha256 and doc.status == "EMIS"

    r = client.post(f"{BASE}/{pid}/actions/reprendre", json={}, headers=author)
    assert r.status_code == 422, "le motif est demandé"
    client.post(f"{BASE}/{pid}/actions/reprendre", json={"motif": "Quantité revue"}, headers=author)
    client.put(f"{BASE}/{pid}/lignes", json=[_line(ids["program"], qty=8)], headers=author)
    client.post(f"{BASE}/{pid}/actions/soumettre", json={}, headers=author)
    v2 = client.post(f"{BASE}/{pid}/actions/valider", json={}, headers=quality).json()
    assert v2["version"] == 2 and [v["statut"] for v in v2["versions"]] == ["EMIS", "REMPLACE"]
    sent = client.post(f"{BASE}/{pid}/actions/envoyer", json={}, headers=author).json()
    assert sent["statut"] == "ENVOYE" and sent["envoye_le"]
    assert [s["action"] for s in sent["historique"]][:2] == ["envoyer", "valider"]


def test_lecture_seule_et_formateur(client, db: Session) -> None:
    ids = _setup(db)
    _, admin = make_user(db, "admin")
    _, reader = make_user(db, "lecture")
    _, trainer = make_user(db, "formateur")
    pid = client.post(BASE, json={"client_id": ids["company"]}, headers=admin).json()["id"]
    detail = client.get(f"{BASE}/{pid}", headers=reader).json()
    assert detail["capabilities"]["modifier"]["allowed"] is False
    assert client.post(BASE, json={"client_id": ids["company"]}, headers=reader).status_code == 403
    assert client.get(BASE, headers=trainer).status_code == 403


def test_documents_commerciaux_sans_effet_sur_le_moteur(client, db: Session) -> None:
    ids = _setup(db)
    _, h = make_user(db, "admin")
    client.post(BASE, json={"client_id": ids["company"]}, headers=h)
    events = list(db.scalars(select(OutboxEvent).where(OutboxEvent.name.like("edition.%"))))
    assert [e.name for e in events] == ["edition.created"]
    scope = scope_of(db, events)
    assert not (scope.organization or scope.session_ids or scope.program_ids)


def test_synthese_de_l_accueil(client, db: Session) -> None:
    ids = _setup(db, regime="NON_RENSEIGNE")
    _, h = make_user(db, "admin")
    client.post(BASE, json={"client_id": ids["company"]}, headers=h)
    s = client.get(f"{BASE}/synthese", headers=h).json()
    assert s["total"] == 1 and s["statuts"]["BROUILLON"] == 1
    assert len(s["valides_par_mois"]) == 6 and s["alertes"][0]["niveau"] == "warning"
    assert db.scalar(select(Project)).reference == "DEV-SECU69-001"


def test_chaine_css_ne_sort_pas_du_bloc_style() -> None:
    from app.common.rendu_a4 import css_string

    out = str(css_string('Org</style><script>alert("x")</script> & \\ fin\nligne'))
    assert "<" not in out and ">" not in out and "&" not in out
    assert out == 'Org\\3c /style\\3e \\3c script\\3e alert(\\"x\\")\\3c /script\\3e  \\26  \\\\ fin ligne'


def test_synthese_six_mois_calendaires(client, db: Session, monkeypatch) -> None:  # noqa: ANN001
    """Les six derniers mois de la courbe sont des mois calendaires consécutifs, février compris."""
    from datetime import date

    from app.handler import editions

    class Mars(date):
        @classmethod
        def today(cls) -> date:
            return date(2027, 3, 28)

    monkeypatch.setattr(editions, "date", Mars)
    _, h = make_user(db, "admin")
    s = client.get(f"{BASE}/synthese", headers=h).json()
    assert [m["mois"] for m in s["valides_par_mois"]] == ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]
