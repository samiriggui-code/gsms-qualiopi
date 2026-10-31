"""Offre de formation : import GSMS School, lieux et équipements, résultats mesurés, ressources pédagogiques."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.application.service.training.import_school import (
    import_gsms_school,
    is_filler,
    load,
    load_drafts,
    without_filler,
)
from app.types import training as t
from tests.conftest import make_user

API = "/api/v1"


def test_import_gsms_school_idempotent_et_prudent(demo: Session) -> None:
    out = import_gsms_school(demo)
    demo.commit()
    assert len(out["formations"]) == 29 and len(out["lieux"]) == 10 and out["equipements"] == 43
    assert any("tfp-aps" in line for line in out["report"]), "les formations écartées sont dites"

    ssiap = demo.scalar(select(t.Program).where(t.Program.catalog_slug == "ssiap-1-initial"))
    assert ssiap.code == "SSIAP1-INI" and ssiap.duration_hours == 67 and [m["code"] for m in ssiap.modules][:2] == ["UV1", "UV2"]
    assert ssiap.success_rate is None and ssiap.satisfaction_rate is None, "aucun taux écrit en dur n'est repris"
    assert any(n["champ"] == "success_rate" for n in ssiap.review_notes)
    mac = demo.scalar(select(t.Program).where(t.Program.code == "SSIAP1-MAC"))
    assert [m["title"] for m in mac.modules] == ["Actualisation réglementaire", "Moyens de secours", "Mises en situation d'urgence"]
    assert all(m["details"] and not any(is_filler(d) for d in m["details"]) for m in mac.modules), \
        "le détail de remplissage de la landing n'est pas repris ; celui rédigé par GSMS l'est"
    assert sum(n["champ"] == "modules" for n in mac.review_notes) == 3, "à rédiger + intitulés + rédaction à relire"
    cyno = demo.scalar(select(t.Program).where(t.Program.code == "ASC-CYNO"))
    assert cyno.modules[0] | {"details": []} == {"code": "UV1", "title": "Législation et réglementations cynophiles", "details": [], "hours": 35}
    assert "SI.Groupe" not in str([p.evaluation_methods for p in demo.scalars(select(t.Program))])

    resources = demo.scalars(select(t.ProgramResource).where(t.ProgramResource.program_id == ssiap.id)).all()
    assert {r.status for r in resources} == {"A_REDIGER"} and {r.origin for r in resources} == {"GSMS_SCHOOL"}

    phoenix = demo.scalar(select(t.Premises).where(t.Premises.code == "PHOENIX"))
    assert phoenix.parent_id and phoenix.status == "A_VERIFIER"
    ext = demo.scalar(select(t.Equipment).where(t.Equipment.code == "incendie.extincteur-co2"))
    assert ext.premises_id == phoenix.id and ext.quantity == 6 and ext.status == "A_VERIFIER"

    again = import_gsms_school(demo)
    assert again["formations"] == [] and again["lieux"] == [] and again["equipements"] == 0 and again["completees"] == []
    assert demo.scalar(select(func.count()).select_from(t.Program).where(t.Program.catalog_slug.is_not(None))) == 29


def test_catalogue_sans_taux_ni_texte_d_un_autre_organisme() -> None:
    data = load()
    for f in data["formations"]:
        assert "success_rate" not in f and "satisfaction_rate" not in f
        assert "SI.Groupe" not in str({k: v for k, v in f.items() if k != "review_notes"})


def test_lieux_et_equipements(client, demo: Session) -> None:  # noqa: ANN001
    _, hl = make_user(demo, "lecture")
    _, hg = make_user(demo, "gestion")
    lieu = {"code": "SALLE-A", "name": "Salle A", "kind": "SALLE", "capacity": 14}
    assert client.post(f"{API}/premises", json=lieu, headers=hl).status_code == 403
    r = client.post(f"{API}/premises", json=lieu, headers=hg)
    assert r.status_code == 201, r.text
    salle = r.json()
    assert salle["status"] == "A_VERIFIER" and salle["kind_label"] == "Salle de formation"
    assert client.post(f"{API}/premises", json={**lieu, "code": "X", "kind": "GARAGE"}, headers=hg).status_code == 422
    assert client.patch(f"{API}/premises/{salle['id']}", json={"parent_id": salle["id"]}, headers=hg).status_code == 422

    eq = {"code": "dae-1", "label": "DAE de formation", "category": "SECOURISME", "quantity": 2,
          "premises_id": salle["id"], "next_check_on": "2020-01-01"}
    r = client.post(f"{API}/equipment", json=eq, headers=hg)
    assert r.status_code == 201, r.text
    row = r.json()
    assert row["premises_name"] == "Salle A" and row["check_overdue"] and row["category_label"] == "Secourisme"
    listed = {r["id"]: r for r in client.get(f"{API}/premises", headers=hl).json()}
    assert listed[salle["id"]]["equipment"] == 1


def test_resultats_mesures_et_publication(client, demo: Session) -> None:  # noqa: ANN001
    _, hl = make_user(demo, "lecture")
    _, hg = make_user(demo, "gestion")
    data = client.get(f"{API}/formation/resultats", headers=hg).json()
    assert data["periode"]["mois"] == 12 and data["methode"]["reussite"]
    ssiap = next(f for f in data["formations"] if f["code"] == "SSIAP1")
    m = ssiap["mesure"]
    assert (m["stagiaires"], m["abandons"], m["examines"], m["reussis"]) == (13, 1, 12, 12)
    assert m["taux_reussite"] == 100.0 and m["taux_abandon"] == 7.7
    assert (m["enquetes"], m["repondants"], m["taux_satisfaction"], m["note_moyenne"]) == (10, 10, 100.0, 4.5)
    assert any("sans base de calcul" in e for e in ssiap["ecarts"]), "92 % publiés sans période ni effectif"
    assert ssiap["capabilities"]["publier"]["allowed"]
    sst = next(f for f in data["formations"] if f["code"] == "SST")
    assert sst["mesure"] is None and sst["capabilities"]["publier"]["code"] == "NOTHING_MEASURED"
    assert client.post(f"{API}/formation/resultats/{sst['id']}/publication", json={}, headers=hg).status_code == 409

    lecture = client.get(f"{API}/formation/resultats", headers=hl).json()
    assert next(f for f in lecture["formations"] if f["code"] == "SSIAP1")["capabilities"]["publier"]["code"] == "PERMISSION_MISSING"
    assert client.post(f"{API}/formation/resultats/{ssiap['id']}/publication", json={}, headers=hl).status_code == 409

    r = client.post(f"{API}/formation/resultats/{ssiap['id']}/publication", json={"mois": 12}, headers=hg)
    assert r.status_code == 200, r.text
    assert r.json()["taux_reussite"] == 100.0 and r.json()["base"]["stagiaires"] == 13
    ssiap = next(f for f in client.get(f"{API}/formation/resultats", headers=hg).json()["formations"] if f["code"] == "SSIAP1")
    assert ssiap["ecarts"] == [] and ssiap["publie"]["base"]["publie_par"] == "Test gestion"


def test_ressources_pedagogiques(client, demo: Session) -> None:  # noqa: ANN001
    import_gsms_school(demo)
    demo.commit()
    _, hl = make_user(demo, "lecture")
    data = client.get(f"{API}/formation/ressources", headers=hl).json()
    assert len(data["ressources"]) == 58 and data["ressources"][0]["program_code"]
    assert data["capabilities"]["ecrire"]["code"] == "PERMISSION_MISSING"
    assert sum(f["ressources"] for f in data["formations"]) == 58


def test_import_complete_une_formation_deja_importee_sans_rien_remplacer(demo: Session) -> None:
    import_gsms_school(demo)
    ssiap = demo.scalar(select(t.Program).where(t.Program.code == "SSIAP1-INI"))
    assert (ssiap.track, ssiap.pathway) == ("INCENDIE", "INITIAL") and ssiap.skills and ssiap.evaluation_steps
    # Base importée avant l'ajout des rubriques : vides, sauf une compétence saisie à la main.
    ssiap.track = ssiap.pathway = None
    ssiap.evaluation_steps = []
    ssiap.skills = ["Saisie par la direction"]
    demo.flush()
    out = import_gsms_school(demo)
    assert "SSIAP1-INI" in out["completees"] and out["formations"] == []
    assert (ssiap.track, ssiap.pathway) == ("INCENDIE", "INITIAL") and ssiap.evaluation_steps
    assert ssiap.skills == ["Saisie par la direction"], "une valeur saisie n'est jamais remplacée"
    ssiap2 = demo.scalar(select(t.Program).where(t.Program.code == "SSIAP2-INI"))
    assert ssiap2.skills and any(n["champ"] == "skills" and "Rédigé par GSMS" in n["message"]
                                 for n in ssiap2.review_notes), "compétences absentes de la vitrine : rédaction GSMS"
    assert import_gsms_school(demo)["completees"] == []


def test_catalogue_et_fiche(client, demo: Session) -> None:  # noqa: ANN001
    import_gsms_school(demo)
    demo.commit()
    _, hl = make_user(demo, "lecture")
    _, hg = make_user(demo, "gestion")
    data = client.get(f"{API}/formation/catalogue", headers=hl).json()
    assert data["capabilities"]["ecrire"]["allowed"] is False
    assert client.get(f"{API}/formation/catalogue", headers=hg).json()["capabilities"]["ecrire"]["allowed"] is True
    row = next(f for f in data["formations"] if f["code"] == "SSIAP1-INI")
    assert row["track_label"] == "Incendie" and row["pathway"] == "INITIAL" and row["modules"] == 5
    assert row["ressources"] == {"total": 2, "a_rediger": 2} and row["points_a_arbitrer"] >= 1
    assert row["publie"]["taux_reussite"] is None and row["fiche"] == "JAMAIS_VALIDEE"
    assert data["totaux"]["formations"] == len(data["formations"])
    assert {f["value"] for f in data["filieres"]} >= {"INCENDIE", "SURETE", "SST"}
    demo_ssiap = next(f for f in data["formations"] if f["code"] == "SSIAP1")
    item = client.get(f"{API}/formation/catalogue/{demo_ssiap['id']}", headers=hl).json()
    assert item["sessions"] and all("learners" in s for s in item["sessions"])
    assert client.get(f"{API}/formation/catalogue/inconnu", headers=hl).status_code == 404


def test_liste_des_sessions_porte_la_filiere(client, demo: Session) -> None:  # noqa: ANN001
    demo.scalar(select(t.Program).where(t.Program.code == "SSIAP1")).track = "INCENDIE"
    demo.commit()
    _, h = make_user(demo, "gestion")
    rows = client.get(f"{API}/sessions", headers=h).json()
    ssiap = next(r for r in rows if r["program_code"] == "SSIAP1")
    assert ssiap["program_track"] == "INCENDIE" and ssiap["program_track_label"] == "Incendie"
    assert "program_slug" in ssiap


def test_landing_sans_texte_de_remplissage() -> None:
    assert is_filler("Approfondissement des objectifs du module « Moyens de secours ».")
    assert is_filler("Conformité avec le référentiel et les objectifs pédagogiques du parcours.")
    assert is_filler("Parcours « OVT » : pièces et niveau demandés au bulletin d'inscription.")
    assert is_filler("Être majeur (18 ans révolus) ou dérogation conforme au référentiel.") and is_filler("Bloc 4")
    assert not is_filler("Casier judiciaire vierge (enquête administrative)")
    assert without_filler("modules", [{"code": "UV1", "title": "Bloc 5", "details": []}]) is None
    assert without_filler("prerequisites", ["Bloc 4", "Diplôme SSIAP 1"]) == ["Diplôme SSIAP 1"]
    data = load()
    assert "landing_fiches" in data["sources"]
    for c in data["complements_landing"]:
        assert set(c) <= {"catalog_slug", "modules", "teaching_methods", "prerequisites", "audience", "content", "outcomes",
                          "trainees_min", "trainees_max", "access_conditions", "badge", "review_notes"}
        text = str({k: v for k, v in c.items() if k != "review_notes"})
        assert not any(w in text for w in ("Approfondissement", "Conformité avec", "Sur devis", "exemple.fr", "%  ")), c
        for key in ("modules", "teaching_methods", "prerequisites", "audience", "content"):
            if key in c:
                assert without_filler(key, c[key]) == c[key], c["catalog_slug"]
                assert any(n["champ"] == key and "à relire" in n["message"] for n in c["review_notes"])


def test_landing_complete_sans_rien_remplacer(demo: Session) -> None:
    import_gsms_school(demo)
    ovt = demo.scalar(select(t.Program).where(t.Program.code == "OVT"))
    assert ovt.teaching_methods.startswith("Répartition annoncée sur la vitrine (landing) : 50 % théorie")
    assert any(n["champ"] == "teaching_methods" and "à relire" in n["message"] for n in ovt.review_notes)
    mac_aps = demo.scalar(select(t.Program).where(t.Program.code == "MAC-APS"))
    assert "20% théorie, 80% pratique" in mac_aps.teaching_methods, "la fiche vitrine reste, l'écart est noté"
    assert any(n["champ"] == "teaching_methods" and "écart" in n["message"] for n in mac_aps.review_notes)
    # Saisie par la direction, puis base importée avant la landing : rubriques vides sauf celle saisie.
    ssiap2 = demo.scalar(select(t.Program).where(t.Program.code == "SSIAP2-MAC"))
    ssiap2.modules = [{"code": "M1", "title": "Saisi par la direction", "details": []}]
    ssiap3 = demo.scalar(select(t.Program).where(t.Program.code == "SSIAP3-MAC"))
    ssiap3.modules = []
    ssiap3.review_notes = [n for n in ssiap3.review_notes if "à relire" not in n["message"]]
    ssiap2.review_notes = [n for n in ssiap2.review_notes if "à relire" not in n["message"]]
    demo.flush()
    out = import_gsms_school(demo)
    assert "SSIAP3-MAC" in out["completees"] and "SSIAP2-MAC" not in out["completees"]
    assert ssiap2.modules == [{"code": "M1", "title": "Saisi par la direction", "details": []}], "jamais remplacé"
    assert not any("à relire" in n["message"] for n in ssiap2.review_notes), "pas de note sur une valeur non reprise"
    assert [m["code"] for m in ssiap3.modules] == ["UV1", "UV2", "UV3"]
    notes = len(ssiap3.review_notes)
    assert import_gsms_school(demo)["completees"] == [] and len(ssiap3.review_notes) == notes, "idempotent"


def test_redaction_gsms_signalee_et_sans_promesse() -> None:
    data = load_drafts()
    slugs = {f["catalog_slug"] for f in load()["formations"]} | {"tfp-aps"}
    for f in data["formations"]:
        assert f["catalog_slug"] in slugs and f["textes"] and f["objectives"] and f["teaching_means"], f["catalog_slug"]
        text = str(f)
        assert not any(w in text for w in ("%", "taux", "obligatoire", "garanti")), f["catalog_slug"]
        assert "accessibility_info" not in f and "access_delay" not in f, "propres à l'organisme, jamais rédigés ici"
    assert all("inventaire" in m for m in data["moyens"].values()), "les moyens disent d'où vient le matériel"


def test_redaction_gsms_complete_sans_rien_remplacer(demo: Session) -> None:
    import_gsms_school(demo)
    epi = demo.scalar(select(t.Program).where(t.Program.code == "EPI"))
    assert epi.objectives and epi.skills and "Aire feu" in epi.teaching_means
    assert {n["champ"] for n in epi.review_notes if "Rédigé par GSMS" in n["message"]} >= {"objectives", "skills",
                                                                                            "teaching_means"}
    ssiap1 = demo.scalar(select(t.Program).where(t.Program.code == "SSIAP1-MAC"))
    assert all(m["details"] for m in ssiap1.modules), "détail des recyclages SSIAP rédigé"
    assert any(n["champ"] == "modules" and "Rédigé par GSMS" in n["message"] for n in ssiap1.review_notes)
    # Une rubrique saisie par l'organisme n'est jamais remplacée, ni annotée.
    br = demo.scalar(select(t.Program).where(t.Program.code == "BR"))
    br.objectives = ["Saisi par la direction"]
    br.teaching_means = None
    br.review_notes = [n for n in br.review_notes if "Rédigé par GSMS" not in n["message"]]
    demo.flush()
    out = import_gsms_school(demo)
    assert "BR" in out["completees"] and br.objectives == ["Saisi par la direction"]
    assert br.teaching_means and [n["champ"] for n in br.review_notes if "Rédigé par GSMS" in n["message"]] == [
        "teaching_means"]
    notes = len(br.review_notes)
    assert import_gsms_school(demo)["completees"] == [] and len(br.review_notes) == notes, "idempotent"


def test_rubriques_vitrine_reprises_de_la_landing(demo: Session) -> None:
    import_gsms_school(demo)
    ovt = demo.scalar(select(t.Program).where(t.Program.code == "OVT"))
    assert ovt.outcomes == ["Opérateur PC", "Agent de télésurveillance", "Opérateur vidéoprotection"]
    assert (ovt.trainees_min, ovt.trainees_max, ovt.badge) == (4, 12, "Titre Pro")
    casier = next(c["value"] for c in ovt.access_conditions if c["label"] == "Casier judiciaire")
    assert "vierge" not in casier.lower(), "le CNAPS examine la compatibilité du casier, pas son absence"
    ssiap = demo.scalar(select(t.Program).where(t.Program.code == "SSIAP1-INI"))
    assert "Casier judiciaire" not in [c["label"] for c in ssiap.access_conditions]
    guide = demo.scalar(select(t.Program).where(t.Program.code == "GUIDE-FILE"))
    assert not any("certifié" in o for o in guide.outcomes)
    assert any(n["champ"] == "outcomes" and "à relire" in n["message"] for n in ovt.review_notes)


def test_certifications_relevees_sans_attester_la_verification(demo: Session) -> None:
    import_gsms_school(demo)
    ssiap = demo.scalar(select(t.Program).where(t.Program.code == "SSIAP2-INI"))
    cert = demo.scalar(select(t.ProgramCertification).where(t.ProgramCertification.program_id == ssiap.id))
    assert (cert.basis, cert.code, str(cert.registration_end)) == ("RS", "RS5642", "2026-12-31") and ssiap.is_certifying
    assert cert.checked_on is None and cert.habilitation == "A_VERIFIER", "la vérification reste humaine"
    sst = demo.scalar(select(t.Program).where(t.Program.code == "SST-INI"))
    sst_cert = demo.scalar(select(t.ProgramCertification).where(t.ProgramCertification.program_id == sst.id))
    assert sst_cert.basis == "NON_CERTIFIANTE" and "inactive" in next(
        n["message"] for n in sst.review_notes if n["champ"] == "certification")
    # Une certification saisie n'est jamais remplacée.
    cert.basis, cert.code = "RNCP", "RNCP00000"
    demo.flush()
    import_gsms_school(demo)
    assert (cert.basis, cert.code) == ("RNCP", "RNCP00000")


def test_financements_sans_cpf_pour_une_formation_non_certifiante(client, demo: Session) -> None:  # noqa: ANN001
    import_gsms_school(demo)
    demo.commit()
    _, h = make_user(demo, "gestion")
    ssiap = demo.scalar(select(t.Program).where(t.Program.code == "SSIAP1-INI"))
    sst = demo.scalar(select(t.Program).where(t.Program.code == "SST-INI"))
    assert ssiap.funding_channels[0] == "CPF" and "CPF" not in sst.funding_channels
    # CPF coché à la main sur une formation non certifiante : l'API le garde et le signale.
    r = client.patch(f"{API}/programs/{sst.id}", json={"funding_channels": ["CPF", "ENTREPRISE"]}, headers=h)
    assert r.status_code == 200, r.text
    funding = {f["code"]: f for f in client.get(f"{API}/fiches/{sst.id}", headers=h).json()["funding"]}
    assert funding["CPF"]["alert"] and funding["ENTREPRISE"]["alert"] is None
    assert funding["ENTREPRISE"]["logo"] == "media/formations/opco.png"


def test_dossier_pedagogique_importe_en_ressources(client, demo: Session, tmp_path) -> None:  # noqa: ANN001
    from app.application.service.training.pedagogie import import_pedagogie

    import_gsms_school(demo)
    root = tmp_path / "ssiap-1-initial"
    for folder in ("01-cours-initial", "02-qcm", "06-ressources-sources"):
        (root / folder).mkdir(parents=True)
    (root / "01-cours-initial" / "A06-deontologie.md").write_text(
        '---\nmodule: "Respecter la déontologie professionnelle"\n---\n# Déontologie\nR631-1…', encoding="utf-8")
    (root / "02-qcm" / "banque.yaml").write_text("questions: []\n", encoding="utf-8")
    (root / "06-ressources-sources" / "ancien.md").write_text("# Ancien support\n", encoding="utf-8")
    out = import_pedagogie(demo, "ssiap-1-initial", root)
    demo.commit()
    assert len(out["crees"]) == 2, "les sources brutes ne sont jamais importées"
    tfp = demo.scalar(select(t.Program).where(t.Program.catalog_slug == "ssiap-1-initial"))
    cours = demo.scalar(select(t.ProgramResource).where(t.ProgramResource.module_code == "A06"))
    assert (cours.title, cours.kind, cours.status, cours.rights) == (
        "Respecter la déontologie professionnelle", "COURS", "BROUILLON", "PROPRIETAIRE")
    _, h = make_user(demo, "lecture")
    r = client.get(f"{API}/fiches/{tfp.id}/ressources/{cours.id}/fichier", headers=h)
    assert r.status_code == 200 and "R631-1" in r.text and r.headers["content-type"].startswith("text/markdown")
    # Validé puis modifié : repasse en brouillon ; inchangé : rien ne bouge.
    cours.status = "VALIDE"
    demo.commit()
    assert import_pedagogie(demo, "ssiap-1-initial", root)["inchanges"] == 2
    (root / "01-cours-initial" / "A06-deontologie.md").write_text("# Déontologie v2\n", encoding="utf-8")
    assert import_pedagogie(demo, "ssiap-1-initial", root)["mis_a_jour"] and cours.status == "BROUILLON"
