"""Relances : planification idempotente, validation, annulation quand c'est fait, envoi tracé, alertes internes."""

from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.platform.features import set_feature
from app.relances import sender as sender_module
from app.relances.models import Message
from app.relances.planner import plan
from app.relances.service import dispatch
from app.training import models as t
from tests.conftest import TODAY, find_session, make_user


class FakeSender:
    def __init__(self, fail: bool = False):
        self.sent: list[dict] = []
        self.fail = fail

    def send(self, **kw) -> str:  # noqa: ANN003
        if self.fail:
            raise ConnectionRefusedError("serveur SMTP injoignable")
        self.sent.append(kw)
        return f"<{len(self.sent)}@test>"


@pytest.fixture
def outbox():  # noqa: ANN201
    fake = FakeSender()
    previous = sender_module.get_sender()
    sender_module.set_sender(fake)
    yield fake
    sender_module.set_sender(previous)


def _enable(db: Session) -> None:
    set_feature(db, "relances", True)
    db.commit()


def _messages(db: Session, rule: str) -> list[Message]:
    return list(db.scalars(select(Message).where(Message.rule_key == rule).order_by(Message.recipient_name)))


def test_convention_relance_validation_et_annulation_quand_signee(client, demo: Session, outbox) -> None:  # noqa: ANN001
    _enable(demo)
    _, h = make_user(demo, "gestion")
    s = find_session(demo, "SST-2026-04")
    day = s.start_date - timedelta(days=10)  # 2e échéance : c'est une relance
    plan(demo, day)
    demo.commit()
    msgs = _messages(demo, "convention.a_signer")
    named = {m.recipient_name: m for m in msgs}
    assert set(named) == {"Éric Chevalier", "Zoé Robin"}, "Paul et Nora ont signé"
    assert all(m.status == "A_VALIDER" and m.external for m in msgs), "externe : validation avant envoi"
    assert named["Éric Chevalier"].subject.startswith("Relance : La convention à signer")
    assert named["Zoé Robin"].subject.startswith("Relance : Le contrat de formation à signer"), "sans entreprise : contrat"
    assert "SST-2026-04" in msgs[0].body_html and "Formation" in msgs[0].body_text

    assert plan(demo, day)["crees"] == 0, "idempotent : pas de doublon"

    eric = next(e for e in s.enrollments if e.learner.first_name == "Éric")
    eric.agreement.signed_on, eric.agreement.signed_by = day, "DRH ACME"
    demo.commit()
    plan(demo, day + timedelta(days=1))
    demo.commit()
    by_name = {m.recipient_name: m for m in _messages(demo, "convention.a_signer")}
    assert by_name["Éric Chevalier"].status == "ANNULE"
    assert by_name["Éric Chevalier"].cancel_reason == "Devenu sans objet : la convention est signée"

    zoe = by_name["Zoé Robin"]
    r = client.post(f"/api/v1/communications/{zoe.id}/valider", headers=h)
    assert r.status_code == 200 and r.json()["statut"] == "ENVOYE" and r.json()["valide_par"].startswith("Test gestion")
    assert [m["to"] for m in outbox.sent] == ["zoé.robin@acme.exemple"]
    assert outbox.sent[0]["subject"] == zoe.subject
    assert client.post(f"/api/v1/communications/{zoe.id}/valider", headers=h).status_code == 409


def test_alertes_internes_de_l_echeancier_envoyees_sans_validation(demo: Session, outbox) -> None:  # noqa: ANN001
    _enable(demo)
    make_user(demo, "gestion")
    make_user(demo, "admin", email="direction@test.local")
    result = plan(demo, TODAY)
    demo.commit()
    assert result["crees"] > 0
    alerts = _messages(demo, "echeancier.alerte")
    besoin = next(m for m in alerts if "Analyse du besoin" in m.subject and "SST-2026-02" in m.subject)
    assert besoin.status == "PREVU" and besoin.recipient_email == "gestion@test.local", "la direction n'est pas noyée d'alertes"
    assert besoin.subject.startswith("[En retard]") and "Louis Morin" in besoin.body_html

    sent = dispatch(demo, TODAY)
    demo.commit()
    assert sent["envoyes"] >= 1 and any(m["subject"] == besoin.subject for m in outbox.sent)
    assert demo.get(Message, besoin.id).status == "ENVOYE"


def test_formateur_sans_adresse_puis_evaluations_manquantes(demo: Session, outbox) -> None:  # noqa: ANN001
    _enable(demo)
    s = find_session(demo, "SST-2026-02")
    day = s.end_date + timedelta(days=1)
    plan(demo, day)
    demo.commit()
    [msg] = _messages(demo, "formateur.evaluations")
    assert msg.status == "SANS_ADRESSE" and msg.recipient_name == "Julie Martin", "signalé, pas perdu"

    s.trainer.email = "julie.martin@exemple.fr"
    demo.commit()
    plan(demo, day)
    demo.commit()
    sent = next(m for m in _messages(demo, "formateur.evaluations") if m.recipient_email)
    assert sent.status == "PREVU" and "Noah Clement" in sent.body_html
    dispatch(demo, day)
    demo.commit()
    assert outbox.sent[-1]["to"] == "julie.martin@exemple.fr"


def test_synthese_hebdomadaire_le_lundi_seulement(demo: Session, outbox) -> None:  # noqa: ANN001
    _enable(demo)
    make_user(demo, "qualite")
    monday = TODAY - timedelta(days=TODAY.weekday())
    plan(demo, monday + timedelta(days=1))
    assert _messages(demo, "qualite.synthese") == []
    plan(demo, monday)
    demo.commit()
    [digest] = _messages(demo, "qualite.synthese")
    assert digest.recipient_email == "qualite@test.local" and "Écarts ouverts" in digest.body_html


def test_rattrapage_limite_et_module_inactif(demo: Session, outbox) -> None:  # noqa: ANN001
    assert plan(demo, TODAY)["inactif"] is True
    _enable(demo)
    s = find_session(demo, "SST-2026-04")
    plan(demo, s.start_date - timedelta(days=15) + timedelta(days=5))  # 5 jours après la 1re échéance
    assert not [m for m in _messages(demo, "convention.a_signer") if m.due_on == s.start_date - timedelta(days=15)]


def test_echec_d_envoi_trace_puis_renvoi(client, demo: Session) -> None:  # noqa: ANN001
    _enable(demo)
    _, h = make_user(demo, "gestion")
    failing = FakeSender(fail=True)
    previous = sender_module.get_sender()
    sender_module.set_sender(failing)
    try:
        plan(demo, TODAY)
        for _ in range(3):
            dispatch(demo, TODAY)
        demo.commit()
        failed = demo.scalar(select(Message).where(Message.status == "ECHEC"))
        assert failed is not None and failed.attempts == 3 and "injoignable" in failed.last_error
        sender_module.set_sender(FakeSender())
        r = client.post(f"/api/v1/communications/{failed.id}/renvoyer", headers=h)
        assert r.json()["statut"] == "ENVOYE"
    finally:
        sender_module.set_sender(previous)


def test_droits_et_apercu(client, demo: Session, outbox) -> None:  # noqa: ANN001
    _enable(demo)
    _, hg = make_user(demo, "gestion")
    _, hl = make_user(demo, "lecture")
    _, hf = make_user(demo, "formateur", email="f@test.local")
    plan(demo, TODAY)
    demo.commit()
    assert client.get("/api/v1/communications", headers=hl).status_code == 403
    assert client.get("/api/v1/communications", headers=hf).status_code == 403
    data = client.get("/api/v1/communications", headers=hg).json()
    assert data["compteurs"] and data["messages"]
    msg = next(m for m in data["messages"] if m["statut"] in ("PREVU", "A_VALIDER"))
    html = client.get(f"/api/v1/communications/{msg['id']}/apercu", headers=hg)
    assert html.status_code == 200 and demo.scalar(select(t.Organization)).name in html.text
    assert client.post(f"/api/v1/communications/{msg['id']}/annuler", json={"motif": ""}, headers=hg).status_code == 422
    r = client.post(f"/api/v1/communications/{msg['id']}/annuler", json={"motif": "Doublon avec un appel"}, headers=hg)
    assert r.json()["statut"] == "ANNULE" and "Doublon" in r.json()["motif_annulation"]
    regles = client.get("/api/v1/communications/regles", headers=hg).json()
    assert {r["cle"] for r in regles} >= {"convention.a_signer", "echeancier.alerte", "qualite.synthese"}


def test_expediteur_smtp_adresses_accentuees(monkeypatch) -> None:  # noqa: ANN001
    """Vrai code d'envoi, faux serveur : en-têtes, texte + HTML, SMTPUTF8 seulement quand il le faut."""
    import smtplib

    from app.relances.sender import SmtpSender

    sent: list[tuple] = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):  # noqa: ANN001
            self.host = host

        def __enter__(self):  # noqa: ANN204
            return self

        def __exit__(self, *a) -> None:  # noqa: ANN002
            pass

        def ehlo(self) -> None:
            pass

        def has_extn(self, name: str) -> bool:
            return name == "smtputf8"

        def send_message(self, msg, mail_options=()) -> None:  # noqa: ANN001
            sent.append((msg, tuple(mail_options)))

    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    s = SmtpSender()
    s.send(to="paul.lambert@acme.exemple", to_name="Paul Lambert", subject="Convocation", html="<p>Bonjour</p>",
           text="Bonjour", from_name="Form'SSI", reply_to="contact@formssi.fr")
    s.send(to="éric.chevalier@acme.exemple", to_name="Éric Chevalier", subject="Relance é", html="<p>é</p>",
           text="é", from_name="Form'SSI", reply_to=None)
    (ascii_msg, ascii_opts), (utf8_msg, utf8_opts) = sent
    assert ascii_opts == () and utf8_opts == ("SMTPUTF8",)
    assert ascii_msg["To"] == "Paul Lambert <paul.lambert@acme.exemple>" and ascii_msg["Reply-To"] == "contact@formssi.fr"
    assert "éric.chevalier@acme.exemple" in str(utf8_msg["To"])
    assert [p.get_content_type() for p in ascii_msg.iter_parts()] == ["text/plain", "text/html"]
