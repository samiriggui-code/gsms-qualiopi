"""Journal des modifications : qui a changé quoi, quand, champ par champ."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.journal import ChangeLog, set_actor
from app.training import models as t
from tests.conftest import make_user


def _log(db: Session, table: str, entity_id: str) -> list[ChangeLog]:
    return list(db.scalars(select(ChangeLog).where(ChangeLog.table_name == table, ChangeLog.entity_id == entity_id).order_by(ChangeLog.id)))


def test_creation_modification_suppression(db: Session) -> None:
    set_actor(db, "Marie Qualité <marie@of.fr>")
    learner = t.Learner(first_name="Inès", last_name="Moreau", email="ines@exemple.fr")
    db.add(learner)
    db.commit()
    assert learner.created_by == "Marie Qualité <marie@of.fr>", "created_by se remplit avec l'auteur"

    learner.email = "ines.moreau@exemple.fr"
    learner.phone = None  # inchangé : ne doit pas apparaître
    db.commit()
    db.delete(learner)
    db.commit()

    rows = _log(db, "formation.learner", learner.id)
    assert [r.action for r in rows] == ["CREATION", "MODIFICATION", "SUPPRESSION"]
    assert rows[0].changes["last_name"] == [None, "Moreau"]
    assert rows[1].changes == {"email": ["ines@exemple.fr", "ines.moreau@exemple.fr"]}
    assert rows[2].changes["first_name"] == [None, "Inès"]
    assert {r.actor for r in rows} == {"Marie Qualité <marie@of.fr>"}


def test_auteur_par_defaut(db: Session) -> None:
    c = t.Company(name="ACME")
    db.add(c)
    db.commit()
    assert _log(db, "formation.company", c.id)[0].actor == "système"


def test_tables_du_moteur_non_journalisees(demo: Session) -> None:
    moteur = demo.scalar(select(func.count()).select_from(ChangeLog).where(ChangeLog.table_name.like("qualite.%")))
    assert moteur == 0, "preuves, résultats et constats ont leur propre historique"
    assert demo.scalar(select(func.count()).select_from(ChangeLog).where(ChangeLog.table_name == "formation.positioning")) == 15  # 11 + 3 + 1


def test_api_auteur_authentifie_et_mot_de_passe_masque(client, db: Session) -> None:  # noqa: ANN001
    admin, headers = make_user(db, "admin")
    r = client.post("/api/v1/auth/users", headers=headers,
                    json={"email": "nouveau@test.local", "full_name": "Nouvel utilisateur", "password": "un-mot-de-passe-long", "role": "gestion"})
    assert r.status_code == 200, r.text
    new_id = r.json()["id"]
    entries = client.get("/api/v1/journal", headers=headers, params={"table": "iam.user", "entity_id": new_id}).json()
    assert len(entries) == 1
    assert entries[0]["actor"] == f"{admin.full_name} <{admin.email}>"
    assert entries[0]["changes"]["password_hash"] == [None, "***"]
