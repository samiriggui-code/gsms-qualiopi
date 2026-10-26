"""Liens publics de documents : expiration signée, clé dérivée propre à l'usage, anciens liens en transition."""

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.application.service.platform.settings import ConfigurationService
from app.application.service.questionnaires import tokens
from app.types import training as t
from tests.conftest import find_session, make_user

URL = "/api/v1/public/documents/"


def _convocation(client, demo: Session) -> tuple[str, t.Document]:  # noqa: ANN001
    ConfigurationService(demo).set("attendance.weekdays", [1, 2, 3, 4, 5, 6, 7])
    demo.commit()
    _, h = make_user(demo, "gestion")
    s = find_session(demo, "SST-2026-04")
    paul = next(e for e in s.enrollments if e.learner.first_name == "Paul")
    client.post(f"/api/v1/sessions/{s.id}/creneaux", headers=h)
    doc = client.post(f"/api/v1/inscriptions/{paul.id}/parcours/convocation", headers=h).json()["produit"]["document"]
    return paul.id, demo.get(t.Document, doc["id"])


def test_lien_signe_avec_expiration(client, demo: Session) -> None:  # noqa: ANN001
    enrollment_id, doc = _convocation(client, demo)
    assert client.get(URL + tokens.sign_document(enrollment_id, doc.id)).status_code == 200
    old = datetime.now(UTC) - timedelta(days=tokens.DOCUMENT_LINK_DAYS + 1)
    r = client.get(URL + tokens.sign_document(enrollment_id, doc.id, now=old))
    assert r.status_code == 410 and "expiré" in r.json()["detail"]
    # Date modifiée à la main : la signature ne correspond plus.
    value, sig = tokens.sign_document(enrollment_id, doc.id, now=old).rsplit(".", 1)
    forged = value.rsplit(":", 1)[0] + f":{int(datetime.now(UTC).timestamp()) + 3600}.{sig}"
    assert client.get(URL + forged).status_code == 404


def test_cle_derivee_distincte_de_jwt_secret(client, demo: Session) -> None:  # noqa: ANN001
    enrollment_id, doc = _convocation(client, demo)
    value = tokens.sign_document(enrollment_id, doc.id).rsplit(".", 1)[0]
    # Même valeur datée signée avec l'ancienne clé (JWT_SECRET) : refusée.
    assert client.get(URL + tokens.sign(tokens.DOCUMENT_PURPOSE, value)).status_code == 404


def test_ancien_lien_sans_date_en_transition(client, demo: Session) -> None:  # noqa: ANN001
    enrollment_id, doc = _convocation(client, demo)
    legacy = tokens.sign(tokens.DOCUMENT_PURPOSE, f"{enrollment_id}:{doc.id}")
    assert client.get(URL + legacy).status_code == 200, "lien déjà envoyé, document récent : toujours lisible"
    doc.created_at = datetime.now(UTC) - timedelta(days=tokens.DOCUMENT_LINK_DAYS + 1)
    demo.commit()
    assert client.get(URL + legacy).status_code == 410
