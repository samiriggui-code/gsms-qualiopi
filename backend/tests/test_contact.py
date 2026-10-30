"""Formulaire de contact du site : POST /api/v1/public/contact, transmis à l'équipe par le journal des communications."""

from __future__ import annotations

import logging

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.service.relances import sender as sender_module
from app.application.service.relances.service import dispatch
from app.types.relances import Message
from tests.conftest import TODAY, make_user

URL = "/api/v1/public/contact"


def body(**changes) -> dict:  # noqa: ANN003
    """Corps exact envoyé par landing/app/widgets.tsx (ContactForm)."""
    data = {"name": "Léa Martin", "email": "Lea.Martin@exemple.fr", "subject": "Dates SSIAP 1",
            "message": "Bonjour, quelles sont les prochaines dates ?\nMerci.", "_trap": ""}
    return data | changes


class FakeSender:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send(self, **kw) -> str:  # noqa: ANN003
        self.sent.append(kw)
        return f"<{len(self.sent)}@test>"


@pytest.fixture
def outbox():  # noqa: ANN201
    fake = FakeSender()
    previous = sender_module.get_sender()
    sender_module.set_sender(fake)
    yield fake
    sender_module.set_sender(previous)


def test_message_transmis_a_l_equipe_et_envoye(db: Session, client, outbox, caplog) -> None:  # noqa: ANN001
    make_user(db, "gestion", "accueil@of.test")
    make_user(db, "formateur", "julie@of.test")  # sans leads.read : non destinataire
    caplog.set_level(logging.DEBUG)
    r = client.post(URL, json=body())
    assert r.status_code == 201, r.text
    assert set(r.json()) == {"message"}
    msgs = list(db.scalars(select(Message)))
    assert [m.recipient_email for m in msgs] == ["accueil@of.test"]
    m = msgs[0]
    assert m.status == "PREVU" and not m.external and m.rule_key == "contact_site" and m.due_on == TODAY
    assert m.subject == "Message du site : Dates SSIAP 1"
    assert "lea.martin@exemple.fr" in m.body_text and "quelles sont les prochaines dates" in m.body_text
    assert m.created_by == "formulaire public du site"
    # Aucune donnée de la personne dans les journaux de l'application.
    assert not any(x in caplog.text.lower() for x in ("lea.martin", "léa martin", "prochaines dates"))

    assert dispatch(db, TODAY)["envoyes"] == 1  # aucune règle du calendrier : il part quand même
    assert outbox.sent[0]["to"] == "accueil@of.test"
    db.refresh(m)
    assert m.status == "ENVOYE"


def test_contenu_echappe_dans_l_e_mail(db: Session, client) -> None:  # noqa: ANN001
    make_user(db, "gestion", "accueil@of.test")
    r = client.post(URL, json=body(message="<script>alert(1)</script> et <b>gras</b>"))
    assert r.status_code == 201
    html = db.scalar(select(Message.body_html))
    assert "<script>" not in html and "&lt;script&gt;" in html


def test_meme_message_renvoye_une_seule_fois(db: Session, client) -> None:  # noqa: ANN001
    make_user(db, "gestion", "accueil@of.test")
    assert client.post(URL, json=body()).status_code == 201
    assert client.post(URL, json=body()).status_code == 201
    assert len(list(db.scalars(select(Message)))) == 1


def test_sans_destinataire_le_message_est_signale(db: Session, client) -> None:  # noqa: ANN001
    assert client.post(URL, json=body()).status_code == 201
    m = db.scalar(select(Message))
    assert m.status == "SANS_ADRESSE" and m.recipient_email is None


def test_robot_meme_reponse_rien_transmis(db: Session, client) -> None:  # noqa: ANN001
    make_user(db, "gestion", "accueil@of.test")
    r = client.post(URL, json=body(_trap="http://spam.example"))
    assert r.status_code == 201
    assert db.scalar(select(Message.id)) is None


@pytest.mark.parametrize(("changes", "champ"), [
    ({"name": "L"}, "name"),
    ({"email": "pas-une-adresse"}, "email"),
    ({"subject": "Oui"}, "subject"),
    ({"message": "court"}, "message"),
    ({"message": "x" * 5001}, "message"),
    ({"telephone": "0600000000"}, "telephone"),
])
def test_validation_stricte(db: Session, client, changes: dict, champ: str) -> None:  # noqa: ANN001
    r = client.post(URL, json=body(**changes))
    assert r.status_code == 422, r.text
    out = r.json()
    assert out["error"] == "invalid_state" and out["message"] == out["detail"]
    assert [d["champ"] for d in out["details"]] == [champ]
    assert db.scalar(select(Message.id)) is None


def test_corps_illisible_ou_trop_gros(client) -> None:  # noqa: ANN001
    assert client.post(URL, content=b"pas du json", headers={"Content-Type": "application/json"}).status_code == 400
    assert client.post(URL, json=["liste"]).status_code == 400
    r = client.post(URL, json=body(message="x" * 20_000))
    assert r.status_code == 413 and "message" in r.json()


def test_limite_de_debit(db: Session, client) -> None:  # noqa: ANN001
    for i in range(5):
        assert client.post(URL, json=body(message=f"Message numéro {i} pour la limite")).status_code == 201
    r = client.post(URL, json=body(message="Un message de trop pour la limite"))
    assert r.status_code == 429
    assert r.json()["error"] == "trop_de_demandes" and int(r.headers["Retry-After"]) >= 1
