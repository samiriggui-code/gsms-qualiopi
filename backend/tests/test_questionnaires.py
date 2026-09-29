"""Questionnaires en ligne : lien personnel envoyé par les relances, réponse → données réelles → preuves."""

import hashlib
import re
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.events.models import OutboxEvent
from app.platform.features import set_feature
from app.platform.settings import ConfigurationService
from app.questionnaires import service
from app.questionnaires.models import Invitation
from app.relances.models import Message
from app.relances.planner import plan
from app.training import models as t
from tests.conftest import find_session, make_user
from tests.test_relances import outbox  # noqa: F401  (fixture)

BESOIN = {"objectif": "Devenir SST dans mon équipe", "situation": "Salarié(e)", "experience": "Aucune", "niveau": 2,
          "prerequis": True, "amenagement": False}


def _enable(db: Session) -> None:
    set_feature(db, "relances", True)
    db.commit()


def _messages(db: Session, rule: str) -> dict[str, Message]:
    return {m.recipient_name: m for m in db.scalars(select(Message).where(Message.rule_key == rule))}


def _token(m: Message, path: str) -> str:
    return re.search(rf"{path}/([^\"'\s<]+)", m.body_html).group(1)


def test_besoin_et_positionnement_par_le_stagiaire(client, demo: Session) -> None:  # noqa: ANN001
    _enable(demo)
    s = find_session(demo, "SST-2026-04")
    day = s.start_date - timedelta(days=10)
    plan(demo, day)
    demo.commit()
    msgs = _messages(demo, "questionnaire.besoin")
    assert set(msgs) == {"Nora Fontaine", "Éric Chevalier", "Zoé Robin"}, "Paul a déjà son besoin et son positionnement"
    eric = msgs["Éric Chevalier"]
    assert eric.status == "A_VALIDER" and eric.indicators == [4, 8] and "/q/" in eric.body_text

    token = _token(eric, "/q")
    r = client.get(f"/api/v1/public/questionnaires/{token}")
    assert r.status_code == 200, r.text
    view = r.json()
    assert view["pour"] == "Éric" and view["session"]["reference"] == "SST-2026-04"
    assert "prerequis" not in {q["id"] for q in view["questionnaire"]["questions"]}, "SST : aucun prérequis, rien à demander"
    inv = demo.scalar(select(Invitation).where(Invitation.kind == "BESOIN_POSITIONNEMENT",
                                               Invitation.enrollment_id == eric.enrollment_id))
    demo.refresh(inv)
    assert inv.opened_at is not None

    # Refus précis, question par question ; l'aménagement demandé impose sa précision.
    r = client.post(f"/api/v1/public/questionnaires/{token}", json={"reponses": BESOIN | {"niveau": 9, "amenagement": True}})
    assert r.status_code == 422
    assert {d["question"] for d in r.json()["details"]} == {"niveau", "amenagement_detail"}

    r = client.post(f"/api/v1/public/questionnaires/{token}", json={"reponses": BESOIN})
    assert r.status_code == 200 and r.json()["merci"] is True
    e = demo.get(t.Enrollment, eric.enrollment_id)
    demo.refresh(e)
    assert e.needs_analysis.summary == "Recueilli auprès de l'employeur", "une saisie existante n'est jamais écrasée"
    assert e.positioning.completed_on is not None
    assert e.positioning.method.startswith("Questionnaire en ligne") and e.positioning.prerequisites_met is True
    assert e.positioning.created_by == "Éric Chevalier (questionnaire en ligne)"
    names = set(demo.scalars(select(OutboxEvent.name).where(OutboxEvent.entity_id == e.positioning.id)))
    assert names == {"positioning.completed"}, "le moteur Qualiopi est prévenu comme pour une saisie"

    assert client.get(f"/api/v1/public/questionnaires/{token}").status_code == 410, "une seule réponse"
    assert client.post(f"/api/v1/public/questionnaires/{token}", json={"reponses": BESOIN}).status_code == 410

    # La relance suivante n'a plus d'objet pour Éric : le message en attente est annulé.
    plan(demo, day + timedelta(days=1))
    demo.commit()
    demo.refresh(eric)
    assert eric.status == "ANNULE"
    demo.expire_all()
    _, h = make_user(demo, "gestion")
    answers = client.get(f"/api/v1/inscriptions/{e.id}/parcours", headers=h).json()["questionnaires"]
    assert answers[0]["repondu_le"] and {"question": "Votre situation actuelle", "reponse": "Salarié(e)"} in answers[0]["reponses"]


def test_satisfaction_a_chaud_devient_une_appreciation(client, demo: Session) -> None:  # noqa: ANN001
    _enable(demo)
    s = find_session(demo, "SST-2026-02")
    plan(demo, s.end_date)
    demo.commit()
    msgs = _messages(demo, "questionnaire.chaud")
    assert len(msgs) == 3 and all(m.indicators == [30] for m in msgs.values())
    m = next(iter(msgs.values()))
    token = _token(m, "/q")
    answers = {"note_globale": 4, "objectifs": 5, "animation": 5, "organisation": 3, "recommandation": True,
               "commentaire": "  Très concret.  "}
    assert client.post(f"/api/v1/public/questionnaires/{token}", json={"reponses": answers}).status_code == 200
    sv = demo.scalar(select(t.SatisfactionSurvey).where(t.SatisfactionSurvey.enrollment_id == m.enrollment_id,
                                                        t.SatisfactionSurvey.audience == "APPRENANT_CHAUD"))
    assert sv.score == 4 and sv.comment == "Très concret." and sv.answered_on is not None


def test_lien_invalide_ou_expire(client, demo: Session) -> None:  # noqa: ANN001
    e = find_session(demo, "SST-2026-04").enrollments[0]
    inv = service.get_or_create(demo, e, "SATISFACTION_CHAUD", find_session(demo, "SST-2026-04").start_date)
    demo.commit()
    token = service.link(inv).rsplit("/", 1)[1]
    assert client.get(f"/api/v1/public/questionnaires/{token[:-1]}x").status_code == 404, "signature vérifiée"
    inv.expires_on = inv.expires_on - timedelta(days=400)
    demo.commit()
    r = client.get(f"/api/v1/public/questionnaires/{token}")
    assert r.status_code == 410 and "expiré" in r.json()["detail"]


def test_convocation_transmise_par_lien_signe(client, demo: Session, outbox) -> None:  # noqa: ANN001, F811
    _enable(demo)
    ConfigurationService(demo).set("attendance.weekdays", [1, 2, 3, 4, 5, 6, 7])
    demo.commit()
    _, h = make_user(demo, "gestion")
    s = find_session(demo, "SST-2026-04")
    paul = next(e for e in s.enrollments if e.learner.first_name == "Paul")
    client.post(f"/api/v1/sessions/{s.id}/creneaux", headers=h)
    doc = client.post(f"/api/v1/inscriptions/{paul.id}/parcours/convocation", headers=h).json()["produit"]["document"]

    day = s.start_date - timedelta(days=10)
    plan(demo, day)
    demo.commit()
    [msg] = _messages(demo, "document.convocation").values()
    assert msg.recipient_name == "Paul Lambert", "seuls les stagiaires dont la convocation est rédigée"
    token = _token(msg, "/api/public/documents")
    f = client.get(f"/api/v1/public/documents/{token}")
    assert f.status_code == 200 and hashlib.sha256(f.content).hexdigest() == doc["sha256"]
    assert client.get(f"/api/v1/public/documents/{token[:-1]}x").status_code == 404

    assert client.post(f"/api/v1/communications/{msg.id}/valider", headers=h).json()["statut"] == "ENVOYE"
    plan(demo, s.start_date - timedelta(days=5))
    demo.commit()
    assert len(_messages(demo, "document.convocation")) == 1, "transmise une fois : pas de relance"


def test_prerequis_de_la_formation_demandes_quand_il_y_en_a(demo: Session) -> None:
    e = find_session(demo, "SSIAP1-2026-03").enrollments[0]
    inv = service.get_or_create(demo, e, "BESOIN_POSITIONNEMENT", find_session(demo, "SSIAP1-2026-03").start_date)
    view = service.public_view(demo, service.link(inv).rsplit("/", 1)[1], today=inv.created_at.date())
    [q] = [x for x in view["questionnaire"]["questions"] if x["id"] == "prerequis"]
    assert q["libelle"] == ("Remplissez-vous les prérequis de la formation : Aptitude médicale, "
                            "Secourisme SST ou PSC1 en cours de validité ?")
    service.submit(demo, service.link(inv).rsplit("/", 1)[1], BESOIN | {"prerequis": False}, today=inv.created_at.date())
    assert e.positioning.prerequisites_met is False
