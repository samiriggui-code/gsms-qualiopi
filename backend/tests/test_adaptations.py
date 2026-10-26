"""Besoins d'adaptation (écran « Handicap & accessibilité ») : sessions visibles seulement."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.types import training as t
from tests.conftest import make_user


def test_adaptations_listees_selon_la_portee(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "gestion")
    rows = client.get("/api/v1/parcours/adaptations", headers=h).json()
    assert rows and all(r["statut"] in ("A_TRAITER", "VALIDEE", "MISE_EN_OEUVRE", "AUCUNE") for r in rows)
    _, hf = make_user(demo, "formateur", email="sans-session-adapt@test.local")
    assert client.get("/api/v1/parcours/adaptations", headers=hf).json() == []


def test_besoin_d_adaptation_reserve_a_qui_mene_le_parcours(client, demo: Session) -> None:  # noqa: ANN001
    na = demo.scalar(select(t.NeedsAnalysis).where(t.NeedsAnalysis.adaptation_required.is_(True)))
    na.adaptation_notes = "Salle accessible en fauteuil, supports en gros caractères"
    demo.commit()
    _, hg = make_user(demo, "gestion", email="g-adapt@test.local")
    _, hl = make_user(demo, "lecture", email="l-adapt@test.local")
    assert any(r["besoin"] for r in client.get("/api/v1/parcours/adaptations", headers=hg).json())
    lecture = client.get("/api/v1/parcours/adaptations", headers=hl).json()
    assert lecture and all(r["besoin"] is None and r["statut"] for r in lecture)
