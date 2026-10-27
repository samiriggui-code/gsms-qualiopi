"""Serveur MCP : outils d'action (après approbation de la personne dans le moteur IA).

Chaque action reprend la route POST : même effet en base, même refus motivé, journal au nom de la personne marqué
« via l'assistant IA », droits croisés de la personne et du compte technique ; les lectures n'enregistrent rien.
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.application.service.ia.compte import ROLE
from app.common.journal import ChangeLog
from app.handler.mcp_outils import ACTION_TOOLS, BY_NAME, READ_TOOLS
from app.router.rbac import SYSTEM_ROLES
from app.types import training as t
from app.types.funding import FundingCase
from app.types.invoicing import Invoice
from app.types.preinscriptions import Preinscription
from app.types.qualiopi_audit import Audit
from app.types.qualiopi_capa import CapaAction
from app.types.qualiopi_evaluation import EvaluationRun
from app.types.qualiopi_evidence import Evidence
from app.types.qualiopi_review import IndicatorReview
from tests.conftest import TODAY, find_session, make_user
from tests.test_mcp import acting, rpc, tool


def _person(db: Session, role: str, name: str):  # noqa: ANN202
    person, headers = make_user(db, role, email=f"{name}@test.local")
    return person, acting(db, person), headers


def _actor(person) -> str:  # noqa: ANN001
    return f"{person.full_name} <{person.email}> via l'assistant IA"


def _actors(db: Session, table: str, entity_id: str) -> set[str]:
    return set(db.scalars(select(ChangeLog.actor).where(ChangeLog.table_name == table, ChangeLog.entity_id == entity_id)))


def _count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model))


def _journal_size(db: Session) -> int:
    return _count(db, ChangeLog)


def test_descripteurs_des_actions() -> None:
    assert {tool.name for tool in ACTION_TOOLS} == {
        "creer_session", "changer_statut_session", "inscrire_stagiaire", "etape_parcours", "reevaluer_qualiopi",
        "ouvrir_audit", "juger_indicateur_audit", "cloturer_audit", "ouvrir_action_corrective",
        "avancer_action_corrective", "valider_preuve", "revue_indicateur", "ouvrir_dossier_financement",
        "ajouter_source_financement", "creer_facture_brouillon", "traiter_preinscription", "convertir_preinscription",
        "lancer_relances", "valider_message"}
    for action in ACTION_TOOLS:
        d = action.descriptor()
        assert action.writes and d["annotations"]["readOnlyHint"] is False and d["annotations"]["destructiveHint"] is True
        assert "approbation" in d["description"] and "au nom de la personne" in d["description"]
        assert set(d["inputSchema"].get("required", [])) <= set(d["inputSchema"]["properties"])
    for read in READ_TOOLS:
        assert not read.writes and read.descriptor()["annotations"]["readOnlyHint"] is True
    # Idempotence : rejouer une réévaluation ou un jugement ne change rien de plus ; créer, si.
    assert BY_NAME["reevaluer_qualiopi"].descriptor()["annotations"]["idempotentHint"] is True
    assert BY_NAME["creer_session"].descriptor()["annotations"]["idempotentHint"] is False
    assert BY_NAME["lancer_relances"].descriptor()["annotations"]["openWorldHint"] is True  # des e-mails peuvent partir
    # Mêmes permissions que les routes reprises.
    assert {n: BY_NAME[n].permissions for n in ("creer_session", "etape_parcours", "ouvrir_audit", "valider_preuve",
                                                 "reevaluer_qualiopi", "creer_facture_brouillon")} == {
        "creer_session": ("sessions.write",), "etape_parcours": ("sessions.read", "sessions.read_own"),
        "ouvrir_audit": ("quality.read",), "valider_preuve": ("evidence.validate",),
        "reevaluer_qualiopi": ("quality.write",), "creer_facture_brouillon": ("invoices.write",)}


def test_creer_une_session_puis_la_confirmer(client, demo: Session) -> None:  # noqa: ANN001
    person, h, _ = _person(demo, "gestion", "gestionnaire")
    start = TODAY + timedelta(days=60)
    trainer = demo.scalar(select(t.Trainer).order_by(t.Trainer.last_name))
    is_error, out = tool(client, h, "creer_session", reference="SSIAP1-IA-01", formation="SSIAP1",
                         debut=start.isoformat(), fin=(start + timedelta(days=4)).isoformat(), capacite=8, lieu="Lyon",
                         formateur=f"{trainer.first_name} {trainer.last_name}")
    assert not is_error, out
    assert out["reference"] == "SSIAP1-IA-01" and out["status"] == "PLANIFIEE" and out["capacity"] == 8
    assert out["trainer_id"] == trainer.id
    demo.expire_all()
    session = find_session(demo, "SSIAP1-IA-01")
    assert session is not None and session.program.code == "SSIAP1"
    assert _actors(demo, "formation.session", session.id) == {_actor(person)}

    # Refus du domaine (référence déjà prise) : motif rendu, rien d'enregistré.
    before = (_count(demo, t.TrainingSession), _journal_size(demo))
    is_error, text = tool(client, h, "creer_session", reference="SSIAP1-IA-01", formation="SSIAP1",
                          debut=start.isoformat(), fin=start.isoformat())
    assert is_error and "existe déjà" in text
    assert tool(client, h, "creer_session", reference="X", formation="SSIAP1", debut="demain", fin="2030-01-01")[0]
    is_error, text = tool(client, h, "creer_session", reference="X", formation="SSIAP1", debut=start.isoformat())
    assert is_error and "end_date" in text  # modèle de la route : refus lisible
    assert (_count(demo, t.TrainingSession), _journal_size(demo)) == before
    # Confirmation refusée par la politique (lieu et formateur exigés) : le motif est rendu.
    tool(client, h, "creer_session", reference="SSIAP1-IA-02", formation="SSIAP1", debut=start.isoformat(),
         fin=start.isoformat())
    is_error, text = tool(client, h, "changer_statut_session", session="SSIAP1-IA-02", action="confirm")
    assert is_error and "À renseigner avant confirmation" in text and "formateur" in text

    is_error, out = tool(client, h, "changer_statut_session", session="SSIAP1-IA-01", action="confirm")
    assert not is_error and out["status"] == "CONFIRMEE"
    is_error, text = tool(client, h, "changer_statut_session", session="SSIAP1-IA-01", action="cancel")
    assert is_error and "motif" in text
    is_error, text = tool(client, h, "changer_statut_session", session="SSIAP1-IA-01", action="close")
    assert is_error
    demo.expire_all()
    assert find_session(demo, "SSIAP1-IA-01").status == "CONFIRMEE"


def test_inscrire_puis_mener_le_parcours(client, demo: Session) -> None:  # noqa: ANN001
    person, h, _ = _person(demo, "gestion", "gestionnaire")
    session = find_session(demo, "SSIAP1-2026-03")
    enrolled = {e.learner_id for e in session.enrollments}
    learner = demo.scalar(select(t.Learner).where(t.Learner.id.not_in(enrolled)).order_by(t.Learner.last_name))
    is_error, out = tool(client, h, "inscrire_stagiaire", session="SSIAP1-2026-03", stagiaire=learner.id)
    assert not is_error, out
    assert out["statut"] == "INSCRIT"
    demo.expire_all()
    enrollment = demo.get(t.Enrollment, out["id"])
    assert enrollment.learner_id == learner.id and enrollment.session_id == session.id
    assert _actors(demo, "formation.enrollment", enrollment.id) == {_actor(person)}
    is_error, text = tool(client, h, "inscrire_stagiaire", session="SSIAP1-2026-03", stagiaire=learner.id)
    assert is_error and "déjà inscrit" in text

    # Étape refusée par la politique (formation pas commencée) : motif, rien d'enregistré.
    before = _journal_size(demo)
    is_error, text = tool(client, h, "etape_parcours", inscription=enrollment.id, action="abandonner",
                          donnees={"date": TODAY.isoformat(), "motif": "Départ"})
    assert is_error
    assert _journal_size(demo) == before
    # L'inscription se désigne aussi par sa session et son stagiaire.
    is_error, out = tool(client, h, "etape_parcours", session="SSIAP1-2026-03",
                         stagiaire=f"{learner.first_name} {learner.last_name}", action="annuler",
                         donnees={"motif": "Erreur de saisie"})
    assert not is_error, out
    assert out["produit"] == {"statut": "ANNULE"} and out["parcours"]["statut"] == "ANNULE"
    demo.expire_all()
    assert demo.get(t.Enrollment, enrollment.id).status == "ANNULE"
    assert tool(client, h, "etape_parcours", inscription=enrollment.id, action="inconnue")[0]
    assert tool(client, h, "etape_parcours", action="confirmer")[0]


def test_droits_croises_pour_les_actions(client, demo: Session, monkeypatch) -> None:  # noqa: ANN001
    # La personne n'a pas le droit : refus lisible, rien d'enregistré.
    _, lecteur, _ = _person(demo, "lecture", "lecteur")
    _, formateur, _ = _person(demo, "formateur", "formatrice")
    before = _journal_size(demo)
    is_error, text = tool(client, lecteur, "creer_session", reference="R-1", formation="SSIAP1",
                          debut="2030-01-01", fin="2030-01-02")
    assert is_error and "sessions.write" in text
    futur = next(iter(find_session(demo, "SSIAP1-2026-03").enrollments))
    assert tool(client, formateur, "etape_parcours", inscription=futur.id, action="convocation")[0]
    assert _journal_size(demo) == before

    # La personne a le droit, le compte technique non : la politique de la route le refuse aussi (droits croisés
    # jusque dans les politiques, pas seulement à l'entrée de l'outil).
    label, perms = SYSTEM_ROLES[ROLE]
    monkeypatch.setitem(SYSTEM_ROLES, ROLE, (label, perms - {"enrollments.write"}))
    _, h, gestion = _person(demo, "gestion", "gestionnaire")
    is_error, text = tool(client, h, "etape_parcours", inscription=futur.id, action="annuler", donnees={"motif": "x"})
    assert is_error and "enrollments.write" in text
    demo.expire_all()
    assert demo.get(t.Enrollment, futur.id).status != "ANNULE"
    # La même personne avec son propre jeton (client MCP personnel) agit avec ses propres droits.
    is_error, out = tool(client, gestion, "etape_parcours", inscription=futur.id, action="annuler",
                         donnees={"motif": "Erreur"})
    assert not is_error, out


def test_qualiopi_reevaluer_auditer_et_corriger(client, demo: Session) -> None:  # noqa: ANN001
    person, h, _ = _person(demo, "qualite", "responsable-qualite")
    runs = _count(demo, EvaluationRun)
    is_error, out = tool(client, h, "reevaluer_qualiopi")
    assert not is_error, out
    assert _count(demo, EvaluationRun) == runs + 1

    session = find_session(demo, "SSIAP1-2026-01")
    is_error, audit = tool(client, h, "ouvrir_audit", titre="Audit blanc de la session", auditeur="Test qualite",
                           sessions=["SSIAP1-2026-01"])
    assert not is_error, audit
    assert audit["statut"] == "EN_COURS" and audit["echantillon"] == ["SSIAP1-2026-01"]
    demo.expire_all()
    row = demo.get(Audit, audit["id"])
    assert row.sample_session_ids == [session.id]
    assert _actors(demo, "qualite.audit", row.id) == {_actor(person)}

    number = audit["indicateurs"][0]["numero"]
    is_error, out = tool(client, h, "juger_indicateur_audit", audit=audit["reference"], numero=number,
                         jugement="SATISFAIT")
    assert not is_error, out
    assert next(i for i in out["indicateurs"] if i["numero"] == number)["jugement"] == "CONFORME"
    assert tool(client, h, "juger_indicateur_audit", audit=audit["id"], numero=number, jugement="PARFAIT")[0]
    # Clôture refusée tant que tout n'est pas jugé : motif et détail, l'audit reste ouvert.
    is_error, text = tool(client, h, "cloturer_audit", audit=audit["id"], conclusion="Bilan")
    assert is_error and "encore à juger" in text and "non jugé" in text
    demo.expire_all()
    assert demo.get(Audit, audit["id"]).status == "EN_COURS"

    # Audit de l'organisme (sans échantillon imposé) par quelqu'un qui n'a pas quality.write : refus de la politique.
    _, gestion, _ = _person(demo, "gestion", "gestionnaire")
    audits = _count(demo, Audit)
    is_error, text = tool(client, gestion, "ouvrir_audit", titre="Audit organisme", auditeur="X")
    assert is_error and "quality.write" in text and _count(demo, Audit) == audits

    _, gaps = tool(client, h, "lister_ecarts")
    gap = next(g for g in gaps["ecarts"] if g["statut"] == "OUVERT")
    is_error, capa = tool(client, h, "ouvrir_action_corrective", ecart=gap["reference"], titre="Corriger",
                          plan="Reprendre les pièces manquantes", responsable="Test qualite",
                          echeance=(TODAY + timedelta(days=30)).isoformat())
    assert not is_error, capa
    demo.expire_all()
    row = demo.scalar(select(CapaAction).where(CapaAction.finding_id == gap["id"]))
    assert row is not None and row.status == "OUVERTE"
    assert _actors(demo, "qualite.capa_action", row.id) == {_actor(person)}
    is_error, text = tool(client, h, "ouvrir_action_corrective", ecart=gap["id"], titre="Bis", plan="p",
                          responsable="r", echeance=(TODAY - timedelta(days=1)).isoformat())
    assert is_error
    is_error, out = tool(client, h, "avancer_action_corrective", action_corrective=row.reference, action="demarrer")
    assert not is_error, out
    is_error, text = tool(client, h, "avancer_action_corrective", action_corrective=row.id, action="realiser")
    assert is_error and "réalisé" in text  # note obligatoire
    demo.expire_all()
    assert demo.get(CapaAction, row.id).status == "EN_COURS"


def test_valider_une_preuve_et_revue_d_indicateur(client, demo: Session) -> None:  # noqa: ANN001
    _, h, _ = _person(demo, "qualite", "responsable-qualite")
    ev = demo.scalar(select(Evidence).where(Evidence.status == "EXPLOITABLE").order_by(Evidence.reference))
    is_error, text = tool(client, h, "valider_preuve", preuve=ev.reference, decision="REJETEE")
    assert is_error and "motif" in text.lower()
    is_error, out = tool(client, h, "valider_preuve", preuve=ev.reference, decision="REJETEE",
                         commentaire="Pièce illisible, à redéposer")
    assert not is_error, out
    assert out == {"id": ev.id, "reference": ev.reference, "status": "REJETEE"}
    demo.expire_all()
    assert demo.get(Evidence, ev.id).status == "REJETEE"

    reviews = _count(demo, IndicatorReview)
    is_error, out = tool(client, h, "revue_indicateur", numero=11, conclusion="SATISFAISANT",
                         commentaire="Revue des preuves de l'indicateur, rien à signaler.")
    assert not is_error, out
    assert _count(demo, IndicatorReview) == reviews + 1 and out["valid_until"]

    # La personne n'a pas evidence.validate : refus.
    _, assistante, _ = _person(demo, "assistant_qualite", "assistante")
    assert "evidence.validate" in tool(client, assistante, "valider_preuve", preuve=ev.reference, decision="VALIDEE")[1]


def test_financement_facture_et_preinscription(client, demo: Session) -> None:  # noqa: ANN001
    person, h, admin = _person(demo, "admin", "direction")
    for module in ("funding", "invoicing"):
        assert client.put(f"/api/v1/features/{module}", json={"enabled": True}, headers=admin).status_code == 200
    funded = select(FundingCase.enrollment_id)
    enrollment = demo.scalar(select(t.Enrollment).where(t.Enrollment.id.not_in(funded), t.Enrollment.status != "ANNULE")
                             .order_by(t.Enrollment.id))
    is_error, case = tool(client, h, "ouvrir_dossier_financement", inscription=enrollment.id)
    assert not is_error, case
    demo.expire_all()
    row = demo.scalar(select(FundingCase).where(FundingCase.enrollment_id == enrollment.id))
    assert row is not None and _actors(demo, "financement.funding_case", row.id) == {_actor(person)}
    is_error, text = tool(client, h, "ouvrir_dossier_financement", inscription=enrollment.id)
    assert is_error
    assert tool(client, h, "ouvrir_dossier_financement", inscription=enrollment.id, cout="beaucoup")[0]

    company = demo.scalar(select(t.Company).order_by(t.Company.name))
    invoices = _count(demo, Invoice)
    is_error, invoice = tool(client, h, "creer_facture_brouillon", type_client="ENTREPRISE", entreprise=company.id,
                             titre="Formation SSIAP")
    assert not is_error, invoice
    assert _count(demo, Invoice) == invoices + 1
    demo.expire_all()
    row = demo.scalar(select(Invoice).order_by(Invoice.created_at.desc()))
    assert row.status == "BROUILLON" and row.company_id == company.id
    assert _actors(demo, "facturation.facture", row.id) == {_actor(person)}
    is_error, text = tool(client, h, "creer_facture_brouillon", type_client="INCONNU")
    assert is_error and "client_type" in text
    assert _count(demo, Invoice) == invoices + 1

    p = demo.scalar(select(Preinscription).where(Preinscription.status == "NOUVELLE").order_by(Preinscription.reference))
    is_error, out = tool(client, h, "traiter_preinscription", demande=p.reference, statut="REFUSEE")
    assert is_error  # motif obligatoire
    is_error, out = tool(client, h, "traiter_preinscription", demande=p.reference, statut="EN_COURS")
    assert not is_error and out["statut"] == "EN_COURS"
    is_error, out = tool(client, h, "convertir_preinscription", demande=p.reference)
    assert not is_error, out
    assert out["statut"] == "CONVERTIE"
    demo.expire_all()
    assert demo.get(Preinscription, p.id).status == "CONVERTIE"
    is_error, text = tool(client, h, "convertir_preinscription", demande=p.reference)
    assert is_error and "rien à convertir" in text


def test_lancer_les_relances(client, demo: Session) -> None:  # noqa: ANN001
    _, h, admin = _person(demo, "admin", "direction")
    assert client.put("/api/v1/features/relances", json={"enabled": True}, headers=admin).status_code == 200
    is_error, out = tool(client, h, "lancer_relances")
    assert not is_error, out
    assert set(out) == set(client.post("/api/v1/communications/planifier", headers=admin).json())
    is_error, text = tool(client, h, "valider_message", message="MSG-INCONNU")
    assert is_error and "introuvable" in text
    _, gestion_ia, _ = _person(demo, "financement", "financement")
    is_error, text = tool(client, gestion_ia, "lancer_relances")
    assert is_error and "communications.manage" in text


def test_les_lectures_n_enregistrent_toujours_rien(client, demo: Session) -> None:  # noqa: ANN001
    _, h, _ = _person(demo, "admin", "direction")
    before = _journal_size(demo)
    for name, args in (("etat_indicateurs", {}), ("referencement_edof", {}), ("lister_sessions", {}),
                       ("fiche_session", {"session": "SSIAP1-2026-01"}), ("lister_audits", {})):
        assert not tool(client, h, name, **args)[0], name
    assert _journal_size(demo) == before
    # Une action inconnue n'existe pas : rien d'enregistré non plus.
    assert rpc(client, h, "tools/call", {"name": "supprimer_tout", "arguments": {}}).json()["result"]["isError"]
    assert _journal_size(demo) == before
