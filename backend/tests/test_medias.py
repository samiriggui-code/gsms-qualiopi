"""Photos des personnes et vignettes des formations : chemin de la médiathèque validé, exposé par les écrans."""

from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.service.demo import ACTOR, AVATARS, complete_demo
from app.application.service.training.images import complete_program_images, vignettes
from app.application.service.training.import_school import import_gsms_school
from app.common.media import media_path
from app.types import training as t
from app.types.hr import StaffMember
from tests.conftest import find_session, make_user

API = "/api/v1"


@pytest.mark.parametrize("value", ["media/avatars/300-1.png", "assets/gsms/formations/sst.jpg", " media/a.png "])
def test_chemin_de_la_mediatheque_accepte(value: str) -> None:
    assert media_path(value) == value.strip()


@pytest.mark.parametrize("value", [
    "https://exemple.fr/a.png", "//exemple.fr/a.png", "/media/a.png", "media/../secret", "media/a/../../b.png",
    "javascript:alert(1)", "images/a.png", "media/", "media/a b.png", "media/" + "a" * 200, "data:image/png;base64,AAAA",
])
def test_chemin_de_la_mediatheque_refuse(value: str) -> None:
    with pytest.raises(ValueError):
        media_path(value)
    assert media_path("") is None and media_path(None) is None


def test_photo_modifiable_et_validee_par_les_routes_existantes(client, demo: Session) -> None:  # noqa: ANN001
    _, h = make_user(demo, "gestion")
    s = find_session(demo, "SST-2026-02")
    learner = s.enrollments[0].learner
    r = client.patch(f"{API}/learners/{learner.id}", headers=h, json={"photo_url": "https://exemple.fr/x.png"})
    assert r.status_code == 422, "jamais une adresse externe"
    r = client.patch(f"{API}/learners/{learner.id}", headers=h, json={"photo_url": "media/avatars/300-9.png"})
    assert r.status_code == 200 and r.json()["photo_url"] == "media/avatars/300-9.png"
    assert client.patch(f"{API}/trainers/{s.trainer_id}", headers=h, json={"photo_url": "media/../x"}).status_code == 422
    program = s.program
    r = client.patch(f"{API}/programs/{program.id}", headers=h, json={"image_url": "media/formations/vignettes/br.jpg"})
    assert r.status_code == 200 and r.json()["image_url"] == "media/formations/vignettes/br.jpg"

    detail = client.get(f"{API}/sessions/{s.id}", headers=h).json()
    row = next(i for i in detail["inscriptions"] if i["learner_id"] == learner.id)
    assert row["photo_url"] == "media/avatars/300-9.png"
    assert detail["session"]["program_image_url"] == "media/formations/vignettes/br.jpg"
    assert detail["session"]["trainer_photo_url"] == s.trainer.photo_url
    listed = next(x for x in client.get(f"{API}/learners", headers=h).json() if x["id"] == learner.id)
    assert listed["photo_url"] == "media/avatars/300-9.png"
    fiche = client.get(f"{API}/fiches/{program.id}", headers=h).json()
    assert fiche["program"]["image_url"] == "media/formations/vignettes/br.jpg"
    cat = next(x for x in client.get(f"{API}/formation/catalogue", headers=h).json()["formations"] if x["id"] == program.id)
    assert cat["image_url"] == "media/formations/vignettes/br.jpg"


def test_personnel_cree_avec_photo(client, demo: Session) -> None:  # noqa: ANN001
    _, ha = make_user(demo, "admin")
    _, hr = make_user(demo, "rh")
    assert client.put(f"{API}/features/hr", json={"enabled": True}, headers=ha).status_code == 200
    body = {"first_name": "Lina", "last_name": "Morel", "kind": "SALARIE"}
    assert client.post(f"{API}/rh/personnel", headers=hr, json=body | {"photo_url": "http://x/y.png"}).status_code == 422
    r = client.post(f"{API}/rh/personnel", headers=hr, json=body | {"photo_url": "media/avatars/300-30.png"})
    assert r.status_code == 201 and r.json()["photo_url"] == "media/avatars/300-30.png"


def test_demo_une_photo_distincte_et_stable_par_personne(client, demo: Session) -> None:  # noqa: ANN001
    trainers = demo.scalars(select(t.Trainer).where(t.Trainer.created_by == ACTOR)).all()
    learners = demo.scalars(select(t.Learner).where(t.Learner.created_by == ACTOR)).all()
    staff = demo.scalars(select(StaffMember).where(StaffMember.created_by == ACTOR)).all()
    own = [*trainers, *learners, *(m for m in staff if m.trainer_id is None)]
    photos = [p.photo_url for p in own]
    assert all(p in AVATARS for p in photos) and len(set(photos)) == len(photos), "une photo différente par personne"
    by_trainer = {tr.id: tr.photo_url for tr in trainers}
    assert all(m.photo_url == by_trainer[m.trainer_id] for m in staff if m.trainer_id), "même personne, même photo"
    assert {p.code: p.image_url for p in demo.scalars(select(t.Program).where(t.Program.created_by == ACTOR))} == {
        "SSIAP1": "media/formations/vignettes/ssiap1.jpg", "SST": "media/formations/vignettes/sst.jpg",
        "MAC-SST": "media/formations/vignettes/sst.jpg"}

    # Base installée avant les photos : complétée à l'identique, sans rien remplacer.
    expected = {p.id: p.photo_url for p in own}
    for p in own[1:]:
        p.photo_url = None
    own[0].photo_url = "media/avatars/300-34.png"  # choisie à la main
    demo.flush()
    out = complete_demo(demo)
    assert out["photos"] == len(own) - 1 and out["adresses"] == [] and out["vignettes"] == []
    assert own[0].photo_url == "media/avatars/300-34.png"
    assert all(p.photo_url == expected[p.id] for p in own[1:])
    assert complete_demo(demo) == {"adresses": [], "photos": 0, "vignettes": []}

    _, h = make_user(demo, "gestion")
    s = find_session(demo, "SST-2026-02")
    view = next(v for v in client.get(f"{API}/sessions", headers=h).json() if v["id"] == s.id)
    assert view["program_image_url"] == "media/formations/vignettes/sst.jpg" and view["trainer_photo_url"]
    rows = client.get(f"{API}/parcours/registres/inscriptions", headers=h).json()["lignes"]
    assert rows and all(r["stagiaire_photo_url"] in AVATARS and r["session"]["image_url"] for r in rows)
    plan = client.get(f"{API}/planning", headers=h, params={"du": s.start_date.isoformat(),
                                                            "au": (s.start_date + timedelta(days=6)).isoformat()}).json()
    assert "photo_url" in str(plan) and "image_url" in str(plan)


def test_vignettes_des_formations_importees_sans_rien_remplacer(demo: Session) -> None:
    paths = vignettes()
    assert all(v.startswith("media/formations/vignettes/") for v in paths.values())
    import_gsms_school(demo)
    br = demo.scalar(select(t.Program).where(t.Program.code == "BR"))
    assert br.image_url == paths["BR"]
    ssiap = demo.scalar(select(t.Program).where(t.Program.code == "SSIAP1-MAC"))
    ssiap.image_url = "media/formations/SSIAP1-RECYCLAGE.jpg"  # choisie à la main
    br.image_url = None
    demo.flush()
    assert complete_program_images(demo, ["BR", "SSIAP1-MAC", "INCONNU"]) == ["BR"]
    assert ssiap.image_url == "media/formations/SSIAP1-RECYCLAGE.jpg"
