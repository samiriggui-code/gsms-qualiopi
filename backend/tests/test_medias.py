"""Photos des personnes et vignettes des formations : chemin de la médiathèque validé, exposé par les écrans."""

from collections import Counter
from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.service.demo import ACTOR, GENRES, avatar, complete_demo, equipe
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


def test_demo_photos_de_l_equipe_et_des_stagiaires(client, demo: Session) -> None:  # noqa: ANN001
    data = equipe()
    team = {avatar(p["photo"]) for p in data["equipe"]}
    learners = demo.scalars(select(t.Learner).where(t.Learner.created_by == ACTOR)).all()
    assert all(p.first_name in GENRES for p in learners), "chaque prénom de stagiaire a son genre écrit à la main"
    photos = [p.photo_url for p in learners if p.photo_url]
    assert not set(photos) & team, "jamais la photo d'un membre de l'équipe"
    for p in learners:
        if p.photo_url:
            info = data["avatars"][int(p.photo_url.removeprefix("media/avatars/300-").removesuffix(".png"))]
            assert info["genre"] == GENRES[p.first_name] and info["age"] != "enfant", p.full_name
    counts = Counter(photos)
    assert all(n <= data["partage_max"][data["avatars"][int(u[18:-4])]["genre"]] for u, n in counts.items())
    assert [c for c in counts.values() if c > 1], "plus de stagiaires que de photos de femmes : partage permis par le fichier"
    trainers = demo.scalars(select(t.Trainer).where(t.Trainer.created_by == ACTOR)).all()
    staff = demo.scalars(select(StaffMember).where(StaffMember.created_by == ACTOR)).all()
    assert {p.photo_url for p in [*trainers, *staff]} == team and len(team) == 15
    assert {p.code: p.image_url for p in demo.scalars(select(t.Program).where(t.Program.created_by == ACTOR))} == {
        "SSIAP1": "media/formations/vignettes/ssiap1.jpg", "SST": "media/formations/vignettes/sst.jpg",
        "MAC-SST": "media/formations/vignettes/sst.jpg"}

    # Base installée avant les photos : complétée à l'identique ; une photo choisie hors des exemples reste.
    people = [*trainers, *staff, *learners]
    expected = {p.id: p.photo_url for p in people}
    chosen = learners[0]
    for p in people:
        p.photo_url = None
    chosen.photo_url = "media/photos/choisie.png"  # choisie à la main
    demo.flush()
    out = complete_demo(demo)
    assert out["photos"] == sum(v is not None for v in expected.values()) - (expected[chosen.id] is not None)
    assert out["adresses"] == [] and out["vignettes"] == [] and chosen.photo_url == "media/photos/choisie.png"
    assert all(p.photo_url == expected[p.id] for p in people if p is not chosen)
    assert complete_demo(demo) == {"adresses": [], "photos": 0, "identites": 0, "vignettes": []}

    # Ancienne attribution (photos d'exemple sans tenir compte du genre) : corrigée, jamais une photo choisie à la main.
    for i, p in enumerate(people):
        if p is not chosen:
            p.photo_url = f"media/avatars/300-{i % 34 + 1}.png"
    demo.flush()
    assert complete_demo(demo)["photos"] == 0, "sans « corriger », rien n'est remplacé"
    complete_demo(demo, corriger=True)
    assert all(p.photo_url == expected[p.id] for p in people if p is not chosen)
    assert chosen.photo_url == "media/photos/choisie.png" and complete_demo(demo, corriger=True)["photos"] == 0

    _, h = make_user(demo, "gestion")
    s = find_session(demo, "SST-2026-02")
    view = next(v for v in client.get(f"{API}/sessions", headers=h).json() if v["id"] == s.id)
    assert view["program_image_url"] == "media/formations/vignettes/sst.jpg" and view["trainer_photo_url"]
    rows = client.get(f"{API}/parcours/registres/inscriptions", headers=h).json()["lignes"]
    assert rows and all(r["session"]["image_url"] for r in rows)
    assert any(r["stagiaire_photo_url"] for r in rows)
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


def test_personnel_par_service(client, demo: Session) -> None:  # noqa: ANN001
    _, ha = make_user(demo, "admin")
    _, hr = make_user(demo, "rh")
    _, h = make_user(demo, "gestion")
    assert client.put(f"{API}/features/hr", json={"enabled": True}, headers=ha).status_code == 200
    rows = client.get(f"{API}/rh/personnel", headers=hr, params={"service": "DIRECTION"}).json()
    assert sorted(r["nom"] for r in rows) == ["Claire Dumont", "Julien Roche", "Nora Lefèvre"]
    assert rows[0]["service_libelle"] == "Direction" and rows[0]["site"]["visible"] is True
    assert client.get(f"{API}/rh/personnel", headers=hr, params={"service": "COMPTA"}).status_code == 422
    counts = {c["code"]: c["effectif"] for c in client.get(f"{API}/rh/personnel/services", headers=hr).json()}
    assert counts == {"DIRECTION": 3, "PEDAGOGIE": 3, "RH": 3, None: 0}
    body = {"first_name": "Lina", "last_name": "Morel", "kind": "SALARIE"}
    assert client.post(f"{API}/rh/personnel", headers=hr, json=body | {"service": "COMPTA"}).status_code == 422
    r = client.post(f"{API}/rh/personnel", headers=hr, json=body | {"service": "RH"})
    assert r.status_code == 201 and r.json()["service"] == "RH"
    lists = {x["code"]: x for x in client.get(f"{API}/listes-de-valeurs", headers=h).json()}
    assert [v["code"] for v in lists["services_du_personnel"]["valeurs"]] == ["DIRECTION", "PEDAGOGIE", "RH"]
