"""Voix du chat de l'assistant : transcription (dictée) et synthèse (lecture des réponses), chez le fournisseur réglé.

Fournisseurs (`IA_VOIX_FOURNISSEUR`) :
- `elevenlabs` : API ElevenLabs (`/v1/speech-to-text`, `/v1/text-to-speech/{voix}`), clé dans `IA_VOIX_CLE` ;
- `openai` : toute API compatible OpenAI (`/v1/audio/transcriptions`, `/v1/audio/speech`) à l'adresse `IA_VOIX_URL`
  (OpenAI, ou un serveur local de reconnaissance et de synthèse vocales).
Modèles et voix viennent du réglage, jamais du code. GSMS ne garde ni l'audio ni le texte : il relaie et répond.
"""

from __future__ import annotations

import http.client
import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from app.config.config import get_settings

ELEVENLABS_URL = "https://api.elevenlabs.io"
MAX_AUDIO = 10 * 1024 * 1024  # octets d'un enregistrement envoyé à la transcription
MAX_TEXT = 4000  # caractères lus à voix haute en une fois
AUDIO_TYPES = ("audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/aac")


class VoiceUnavailable(Exception):
    """Voix non réglée, fournisseur injoignable ou refus du fournisseur (message lisible)."""


@dataclass(frozen=True)
class VoiceConfig:
    provider: str
    key: str
    url: str
    voice: str
    tts_model: str
    stt_model: str


def config() -> VoiceConfig:
    s = get_settings()
    return VoiceConfig(s.ia_voix_fournisseur.strip().lower(), s.ia_voix_cle.strip(), s.ia_voix_url.strip().rstrip("/"),
                       s.ia_voix_voix.strip(), s.ia_voix_modele_synthese.strip(), s.ia_voix_modele_transcription.strip())


def missing(cfg: VoiceConfig) -> list[str]:
    """Réglages manquants pour que la voix fonctionne (liste vide : tout est réglé)."""
    if cfg.provider not in ("elevenlabs", "openai"):
        return ["IA_VOIX_FOURNISSEUR (elevenlabs ou openai)"]
    needed = {"IA_VOIX_VOIX": cfg.voice, "IA_VOIX_MODELE_SYNTHESE": cfg.tts_model,
              "IA_VOIX_MODELE_TRANSCRIPTION": cfg.stt_model}
    if cfg.provider == "elevenlabs":
        needed["IA_VOIX_CLE"] = cfg.key
    else:
        needed["IA_VOIX_URL"] = cfg.url
    return [name for name, value in needed.items() if not value]


def status() -> dict:
    cfg = config()
    absent = missing(cfg)
    return {"active": not absent, "fournisseur": cfg.provider or None, "a_regler": absent,
            "audio_max_octets": MAX_AUDIO, "texte_max_caracteres": MAX_TEXT}


def _ready() -> VoiceConfig:
    cfg = config()
    absent = missing(cfg)
    if absent:
        raise VoiceUnavailable("Voix de l'assistant non réglée : " + ", ".join(absent))
    return cfg


def _send(req: urllib.request.Request, timeout: float = 60) -> tuple[bytes, str]:
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (adresse fixée par la configuration)
            return resp.read(), resp.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        detail = e.read()[:300].decode("utf-8", "replace")
        raise VoiceUnavailable(f"Refus du fournisseur de voix (HTTP {e.code}) : {detail}") from e
    except (OSError, http.client.HTTPException) as e:
        raise VoiceUnavailable(f"Fournisseur de voix injoignable : {e}") from e


def _headers(cfg: VoiceConfig, **extra: str) -> dict[str, str]:
    if cfg.provider == "elevenlabs":
        return {"xi-api-key": cfg.key, **extra}
    return ({"Authorization": f"Bearer {cfg.key}"} if cfg.key else {}) | extra


def transcribe(audio: bytes, filename: str, mime: str, language: str = "fr") -> str:
    """Texte dit dans un enregistrement."""
    cfg = _ready()
    if not audio:
        raise VoiceUnavailable("Enregistrement vide")
    if len(audio) > MAX_AUDIO:
        raise VoiceUnavailable(f"Enregistrement trop long (plus de {MAX_AUDIO // (1024 * 1024)} Mo)")
    if mime.split(";")[0].strip().lower() not in AUDIO_TYPES:
        raise VoiceUnavailable(f"Format audio non pris en charge : {mime or 'inconnu'}")
    if cfg.provider == "elevenlabs":
        url = f"{ELEVENLABS_URL}/v1/speech-to-text"
        fields = {"model_id": cfg.stt_model, "language_code": "fra" if language == "fr" else language}
    else:
        url = f"{cfg.url}/v1/audio/transcriptions"
        fields = {"model": cfg.stt_model, "language": language, "response_format": "json"}
    boundary = "gsms-" + secrets.token_hex(16)
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()]
    safe = (filename or "dictee.webm").replace('"', "'").replace("\r", " ").replace("\n", " ")
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{safe}"\r\n'
                 f"Content-Type: {mime}\r\n\r\n".encode() + audio + b"\r\n")
    body = b"".join(parts) + f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers=_headers(cfg, **{"Content-Type": f"multipart/form-data; boundary={boundary}"}))
    raw, _ = _send(req, timeout=120)
    try:
        text = json.loads(raw or b"{}").get("text")
    except (ValueError, AttributeError):
        text = None
    if not isinstance(text, str):
        raise VoiceUnavailable("Réponse de transcription illisible")
    return text.strip()


def synthesize(text: str) -> tuple[bytes, str]:
    """Audio (MP3) d'un texte lu à voix haute, et son type."""
    cfg = _ready()
    text = (text or "").strip()
    if not text:
        raise VoiceUnavailable("Texte vide")
    if len(text) > MAX_TEXT:
        raise VoiceUnavailable(f"Texte trop long pour être lu en une fois (plus de {MAX_TEXT} caractères)")
    if cfg.provider == "elevenlabs":
        url = f"{ELEVENLABS_URL}/v1/text-to-speech/{urllib.parse.quote(cfg.voice, safe='')}?output_format=mp3_44100_128"
        payload = {"text": text, "model_id": cfg.tts_model}
    else:
        url = f"{cfg.url}/v1/audio/speech"
        payload = {"input": text, "model": cfg.tts_model, "voice": cfg.voice, "response_format": "mp3"}
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                 headers=_headers(cfg, **{"Content-Type": "application/json", "Accept": "audio/mpeg"}))
    audio, kind = _send(req)
    if not audio or not kind.startswith("audio/"):
        raise VoiceUnavailable("Le fournisseur de voix n'a pas rendu d'audio")
    return audio, kind.split(";")[0]
