"""Voix du chat : réglage, relais vers le fournisseur, limites, rien de conservé."""

import json

from app.application.service.ia import voix
from app.config.config import get_settings
from tests.conftest import make_user


def regler(monkeypatch, fournisseur: str = "elevenlabs") -> None:  # noqa: ANN001
    s = get_settings()
    for key, value in {"ia_voix_fournisseur": fournisseur, "ia_voix_cle": "cle-test", "ia_voix_url": "http://voix:8000",
                       "ia_voix_voix": "voix-1", "ia_voix_modele_synthese": "m-synthese",
                       "ia_voix_modele_transcription": "m-transcription"}.items():
        monkeypatch.setattr(s, key, value)


class FakeResponse:
    def __init__(self, body: bytes, kind: str) -> None:
        self.body, self.headers = body, {"Content-Type": kind}

    def read(self) -> bytes:
        return self.body

    def __enter__(self):  # noqa: ANN204
        return self

    def __exit__(self, *a) -> None:  # noqa: ANN002
        return None


def test_etat_et_droits(client, db, monkeypatch) -> None:  # noqa: ANN001
    _, headers = make_user(db, "qualite")
    assert client.get("/api/v1/ia/voix", headers=headers).json()["active"] is False
    regler(monkeypatch)
    assert client.get("/api/v1/ia/voix", headers=headers).json() | {"a_regler": []} == {
        "active": True, "fournisseur": "elevenlabs", "a_regler": [], "audio_max_octets": voix.MAX_AUDIO,
        "texte_max_caracteres": voix.MAX_TEXT}
    _, formateur = make_user(db, "formateur", email="f@test.local")
    assert client.get("/api/v1/ia/voix", headers=formateur).status_code == 403


def test_transcription_et_synthese_elevenlabs(client, db, monkeypatch) -> None:  # noqa: ANN001
    _, headers = make_user(db, "qualite")
    regler(monkeypatch)
    seen = []

    def urlopen(req, timeout=60):  # noqa: ANN001, ANN202, ARG001
        seen.append((req.full_url, req.headers, req.data))
        if req.full_url.endswith("/v1/speech-to-text"):
            return FakeResponse(json.dumps({"text": " Bonjour l'école "}).encode(), "application/json")
        return FakeResponse(b"ID3audio", "audio/mpeg")

    monkeypatch.setattr(voix.urllib.request, "urlopen", urlopen)
    r = client.post("/api/v1/ia/voix/transcription", headers=headers,
                    files={"file": ("d.webm", b"\x1aE\xdf\xa3son", "audio/webm")})
    assert r.status_code == 200 and r.json() == {"texte": "Bonjour l'école"}
    assert seen[0][0] == "https://api.elevenlabs.io/v1/speech-to-text" and seen[0][1]["Xi-api-key"] == "cle-test"
    assert b"m-transcription" in seen[0][2] and b'name="language_code"\r\n\r\nfra' in seen[0][2]
    r = client.post("/api/v1/ia/voix/synthese", headers=headers, json={"texte": "Voici la réponse."})
    assert r.status_code == 200 and r.content == b"ID3audio" and r.headers["content-type"] == "audio/mpeg"
    assert r.headers["cache-control"] == "no-store"
    assert seen[1][0].startswith("https://api.elevenlabs.io/v1/text-to-speech/voix-1")
    assert json.loads(seen[1][2]) == {"text": "Voici la réponse.", "model_id": "m-synthese"}


def test_fournisseur_compatible_openai(monkeypatch) -> None:  # noqa: ANN001
    regler(monkeypatch, "openai")
    urls = []

    def urlopen(req, timeout=60):  # noqa: ANN001, ANN202, ARG001
        urls.append(req.full_url)
        return FakeResponse(b"ID3", "audio/mpeg") if "speech" in req.full_url else \
            FakeResponse(b'{"text": "ok"}', "application/json")

    monkeypatch.setattr(voix.urllib.request, "urlopen", urlopen)
    assert voix.transcribe(b"son", "d.ogg", "audio/ogg") == "ok"
    assert voix.synthesize("texte") == (b"ID3", "audio/mpeg")
    assert urls == ["http://voix:8000/v1/audio/transcriptions", "http://voix:8000/v1/audio/speech"]


def test_limites_et_refus(client, db, monkeypatch) -> None:  # noqa: ANN001
    _, headers = make_user(db, "qualite")
    r = client.post("/api/v1/ia/voix/synthese", headers=headers, json={"texte": "x"})
    assert r.status_code == 503 and "IA_VOIX_FOURNISSEUR" in r.json()["detail"]  # pas réglée
    regler(monkeypatch)
    r = client.post("/api/v1/ia/voix/transcription", headers=headers, files={"file": ("a.exe", b"MZ", "application/x-msdownload")})
    assert r.status_code == 422 and "Format audio" in r.json()["detail"]
    assert client.post("/api/v1/ia/voix/synthese", headers=headers, json={"texte": "x" * 5000}).status_code == 422
