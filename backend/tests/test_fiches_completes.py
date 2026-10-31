"""Fiches complètes : identité du stagiaire, fiche du personnel, téléversement de photo."""

import struct
import zlib

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.images import ImageRefusee, clean_image
from app.common.journal import ChangeLog
from app.common.limites import reset_all
from app.handler import medias
from app.types import training as t
from tests.conftest import make_user

API = "/api/v1"
IDENTITE = {"civility": "MME", "usage_name": "Durand", "birth_date": "1990-04-12", "birth_city": "Lyon",
            "birth_department": "69", "birth_country": "France", "nationality": "Française", "address": "3 rue des Lilas",
            "postal_code": "69003", "city": "Lyon", "current_situation": "Salariée"}


def _png(width: int = 32, height: int = 32, text: bool = True) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    raw = b"".join(b"\x00" + b"\x00" * width * 3 for _ in range(height))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + (chunk(b"tEXt", b"GPS\x0048.85,2.35") + chunk(b"eXIf", b"MM\x00*GPS") if text else b"")
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def _jpeg(width: int = 64, height: int = 48) -> bytes:
    def seg(marker: int, body: bytes) -> bytes:
        return bytes([0xFF, marker]) + struct.pack(">H", len(body) + 2) + body
    return (b"\xff\xd8" + seg(0xE0, b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00")
            + seg(0xE1, b"Exif\x00\x00GPS-48.85-2.35") + seg(0xFE, b"commentaire")
            + seg(0xC0, b"\x08" + struct.pack(">HH", height, width) + b"\x01\x01\x11\x00")
            + seg(0xDA, b"\x01\x01\x00\x00\x3f\x00") + b"\x12\xff\x00\x56" + b"\xff\xd9" + b"MotionPhoto-GPS")


def _webp() -> bytes:
    vp8x = bytes([0x08 | 0x04, 0, 0, 0]) + (99).to_bytes(3, "little") + (49).to_bytes(3, "little")
    chunks = (b"VP8X" + struct.pack("<I", len(vp8x)) + vp8x + b"EXIF" + struct.pack("<I", 4) + b"GPS!"
              + b"VP8L" + struct.pack("<I", 6) + b"\x2f\x00\x00\x00\x00\x00")
    return b"RIFF" + struct.pack("<I", 4 + len(chunks)) + b"WEBP" + chunks


def test_images_nettoyees_et_controlees() -> None:
    png = clean_image(_png())
    assert (png.mime, png.width, png.height) == ("image/png", 32, 32)
    assert b"GPS" not in png.content and b"tEXt" not in png.content and png.content.endswith(b"IEND\xaeB`\x82")
    jpg = clean_image(_jpeg())
    assert (jpg.extension, jpg.width, jpg.height) == ("jpg", 64, 48)
    assert b"Exif" not in jpg.content and b"commentaire" not in jpg.content and b"JFIF" in jpg.content
    assert jpg.content.endswith(b"\x12\xff\x00\x56\xff\xd9"), "rien après la fin d'image"
    webp = clean_image(_webp())
    assert (webp.width, webp.height, webp.mime) == (100, 50, "image/webp")
    assert b"EXIF" not in webp.content and webp.content[20] & 0x0C == 0
    assert struct.unpack("<I", webp.content[4:8])[0] == len(webp.content) - 8
    for bad, why in ((b"GIF89a" + b"\x00" * 40, "Format"), (_png(8, 8), "Dimensions"), (_png(5000, 16, False), "Dimensions"),
                     (_png()[:40], "illisible|incomplet|mal formé"), (b"\x89PNG\r\n\x1a\n" + b"\x00" * (3 * 1024 * 1024), "lourde")):
        with pytest.raises(ImageRefusee, match=why):
            clean_image(bad)


def test_televersement_et_lecture_publique(client, db: Session, tmp_path, monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setattr(medias, "photos_dir", lambda: tmp_path)
    reset_all()
    _, gestion = make_user(db, "gestion")
    _, lecture = make_user(db, "lecture")
    files = {"file": ("moi.png", _png(), "image/jpeg")}  # type annoncé faux : seuls les octets comptent
    assert client.post(f"{API}/medias/photos", files=files).status_code == 401
    assert client.post(f"{API}/medias/photos", files=files, headers=lecture).status_code == 403
    r = client.post(f"{API}/medias/photos", files=files, headers=gestion)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["chemin"].startswith("media/photos/") and body["chemin"].endswith(".png") and body["type"] == "image/png"
    name = body["chemin"].rsplit("/", 1)[1]
    stored = (tmp_path / name).read_bytes()
    assert b"GPS" not in stored
    got = client.get(f"{API}/medias/photos/{name}")  # sans compte : photos de l'équipe sur le site
    assert got.status_code == 200 and got.content == stored and got.headers["content-type"] == "image/png"
    assert got.headers["x-content-type-options"] == "nosniff"
    for bad in ("../secret.png", "abc.png", name.replace(".png", ".svg")):
        assert client.get(f"{API}/medias/photos/{bad}").status_code == 404
    learner = t.Learner(first_name="Léa", last_name="Roux")
    db.add(learner)
    db.commit()
    r = client.patch(f"{API}/learners/{learner.id}", json={"photo_url": body["chemin"]}, headers=gestion)
    assert r.status_code == 200 and r.json()["photo_url"] == body["chemin"]
    refused = client.post(f"{API}/medias/photos", files={"file": ("x.gif", b"GIF89a" + b"\x00" * 64, "image/gif")},
                          headers=gestion)
    assert refused.status_code == 422 and "JPEG, PNG ou WebP" in refused.json()["detail"]
    for _ in range(30):
        client.post(f"{API}/medias/photos", files=files, headers=gestion)
    assert client.post(f"{API}/medias/photos", files=files, headers=gestion).status_code == 429
    reset_all()


def test_identite_du_stagiaire_dans_le_detail_seulement(client, db: Session) -> None:  # noqa: ANN001
    _, gestion = make_user(db, "gestion")
    r = client.post(f"{API}/learners", json={"first_name": "Léa", "last_name": "Roux", "email": "lea@exemple.fr",
                                              **IDENTITE}, headers=gestion)
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["birth_date"] == "1990-04-12" and created["civility_label"] == "Madame"
    detail = client.get(f"{API}/learners/{created['id']}", headers=gestion).json()
    assert {k: detail[k] for k in IDENTITE} == IDENTITE
    row = next(x for x in client.get(f"{API}/learners", headers=gestion).json() if x["id"] == created["id"])
    assert not set(IDENTITE) & set(row) and row["email"] == "lea@exemple.fr" and "photo_url" in row
    for field, value in (("postal_code", "6900"), ("birth_date", "2999-01-01"), ("civility", "DR")):
        assert client.patch(f"{API}/learners/{created['id']}", json={field: value}, headers=gestion).status_code == 422
    r = client.patch(f"{API}/learners/{created['id']}", json={"city": "Villeurbanne", "usage_name": ""}, headers=gestion)
    assert r.status_code == 200 and r.json()["city"] == "Villeurbanne" and r.json()["usage_name"] is None
    logs = db.scalars(select(ChangeLog.changes).where(ChangeLog.table_name == "formation.learner")).all()
    text = str(logs)
    assert "1990-04-12" not in text and "3 rue des Lilas" not in text and "69003" not in text, "identité masquée au journal"
    assert "Villeurbanne" not in text and "***" in text, "ville et nom d'usage masqués aussi"


def test_fiche_du_personnel_detail_et_modification(client, db: Session) -> None:  # noqa: ANN001
    _, ha = make_user(db, "admin")
    _, hr = make_user(db, "rh")
    _, lecture = make_user(db, "lecture")
    assert client.put(f"{API}/features/hr", json={"enabled": True}, headers=ha).status_code == 200
    r = client.post(f"{API}/rh/personnel", headers=hr, json={"first_name": "Lina", "last_name": "Morel", "kind": "SALARIE"})
    staff_id = r.json()["id"]
    url = f"{API}/rh/personnel/{staff_id}"
    change = {"job_title": "Assistante de formation", "service": "PEDAGOGIE", "email": "lina@exemple.fr",
              "phone": "01 23 45 67 89", "photo_url": "media/avatars/300-21.png", "site_visible": True,
              "site_title": "Assistante pédagogique", "site_bio": "Accueille les stagiaires."}
    assert client.patch(url, json=change, headers=lecture).status_code == 403
    r = client.patch(url, json=change, headers=hr)
    assert r.status_code == 200, r.text
    view = client.get(url, headers=hr).json()
    assert (view["fonction"], view["service"], view["service_libelle"], view["telephone"], view["photo_url"]) == (
        "Assistante de formation", "PEDAGOGIE", "Équipe pédagogique", "01 23 45 67 89", "media/avatars/300-21.png")
    assert view["site"] == {"visible": True, "fonction": "Assistante pédagogique", "bio": "Accueille les stagiaires."}
    for bad in ({"service": "COMPTA"}, {"photo_url": "https://x/y.png"}, {"first_name": None}):
        assert client.patch(url, json=bad, headers=hr).status_code in (409, 422), bad
    refused = client.patch(url, json={"site_title": None}, headers=hr)
    assert refused.status_code == 422 and "fonction affichée" in refused.json()["detail"]
    assert client.patch(f"{API}/rh/personnel/inconnu", json={"phone": "x"}, headers=hr).status_code == 404
