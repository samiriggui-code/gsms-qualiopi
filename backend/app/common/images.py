"""Contrôle et nettoyage des photos téléversées (JPEG, PNG, WebP), sans bibliothèque d'images.

Le type est reconnu à ses premiers octets (jamais au nom ni au type annoncé), les dimensions sont lues dans l'en-tête
et bornées, et les métadonnées sont retirées en recopiant le fichier sans elles : EXIF (dont la position GPS), XMP,
IPTC, commentaires et textes. L'image n'est pas ré-encodée (aucune bibliothèque d'images dans l'API) : les pixels
restent ceux du fichier envoyé. Conséquence : l'orientation EXIF disparaît, une photo de téléphone peut apparaître
tournée (à redresser avant l'envoi). Un fichier mal formé est refusé.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

MAX_BYTES = 2 * 1024 * 1024
MIN_SIDE, MAX_SIDE = 16, 4096


class ImageRefusee(ValueError):
    """Fichier refusé : le message dit pourquoi."""


@dataclass(frozen=True)
class Image:
    content: bytes
    extension: str
    mime: str
    width: int
    height: int


def clean_image(data: bytes) -> Image:
    """Rend l'image sans métadonnées, ou lève ImageRefusee."""
    if len(data) > MAX_BYTES:
        raise ImageRefusee("Image trop lourde : 2 Mo au plus")
    try:
        if data[:3] == b"\xff\xd8\xff":
            content, (w, h) = _jpeg(data)
            image = Image(content, "jpg", "image/jpeg", w, h)
        elif data[:8] == b"\x89PNG\r\n\x1a\n":
            content, (w, h) = _png(data)
            image = Image(content, "png", "image/png", w, h)
        elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            content, (w, h) = _webp(data)
            image = Image(content, "webp", "image/webp", w, h)
        else:
            raise ImageRefusee("Format refusé : JPEG, PNG ou WebP seulement")
    except (IndexError, struct.error):
        raise ImageRefusee("Image illisible ou incomplète") from None
    if not (MIN_SIDE <= image.width <= MAX_SIDE and MIN_SIDE <= image.height <= MAX_SIDE):
        raise ImageRefusee(f"Dimensions refusées : de {MIN_SIDE} à {MAX_SIDE} pixels de côté")
    return image


# ── JPEG ────────────────────────────────────────────────────────────────────────────────────────────────────
# Gardés : APP0 (JFIF), APP2 (profil ICC), APP14 (Adobe, couleurs) ; retirés : APP1 (EXIF, XMP), APP13 (IPTC),
# les autres APPn et les commentaires (COM).
_JPEG_KEEP_APP = {0xE0, 0xE2, 0xEE}
_SOF = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


def _jpeg(data: bytes) -> tuple[bytes, tuple[int, int]]:
    out, pos, size = bytearray(b"\xff\xd8"), 2, None
    while True:
        if data[pos] != 0xFF:
            raise ImageRefusee("JPEG mal formé")
        marker = data[pos + 1]
        if marker == 0xFF:  # octet de remplissage
            pos += 1
            continue
        if marker == 0xD9:
            raise ImageRefusee("JPEG sans image")
        if 0xD0 <= marker <= 0xD7 or marker == 0x01:
            out += data[pos:pos + 2]
            pos += 2
            continue
        length = struct.unpack(">H", data[pos + 2:pos + 4])[0]
        segment = data[pos:pos + 2 + length]
        if len(segment) < 2 + length or length < 2:
            raise ImageRefusee("JPEG incomplet")
        if marker in _SOF:
            height, width = struct.unpack(">HH", data[pos + 5:pos + 9])
            size = (width, height)
        if marker == 0xDA:  # données compressées : recopiées jusqu'à la fin d'image (FF D9), rien au-delà
            if size is None:
                raise ImageRefusee("JPEG sans dimensions")
            end = data.find(b"\xff\xd9", pos + 2 + length)  # FF est doublé (FF 00) dans les données compressées
            if end == -1:
                raise ImageRefusee("JPEG incomplet")
            out += data[pos:end + 2]  # sans ce qui suit la fin d'image (blocs ajoutés par certains téléphones)
            return bytes(out), size
        if not (0xE0 <= marker <= 0xEF and marker not in _JPEG_KEEP_APP) and marker != 0xFE:
            out += segment
        pos += 2 + length


# ── PNG ─────────────────────────────────────────────────────────────────────────────────────────────────────
# Seuls les blocs d'image et de couleur sont gardés ; eXIf, tEXt, zTXt, iTXt, tIME et les autres sont retirés.
_PNG_KEEP = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS", b"gAMA", b"cHRM", b"sRGB", b"iCCP", b"sBIT", b"bKGD", b"pHYs"}


def _png(data: bytes) -> tuple[bytes, tuple[int, int]]:
    out, pos, size = bytearray(data[:8]), 8, None
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        chunk = data[pos:pos + 12 + length]
        if len(chunk) < 12 + length:
            raise ImageRefusee("PNG incomplet")
        if kind == b"IHDR":
            size = struct.unpack(">II", data[pos + 8:pos + 16])
        if kind in _PNG_KEEP:
            out += chunk
        pos += 12 + length
        if kind == b"IEND":
            break
    if size is None or not out.endswith(b"IEND\xaeB`\x82"):
        raise ImageRefusee("PNG mal formé")
    return bytes(out), size


# ── WebP ────────────────────────────────────────────────────────────────────────────────────────────────────
def _webp(data: bytes) -> tuple[bytes, tuple[int, int]]:
    chunks, pos, size = [], 12, None
    while pos + 8 <= len(data):
        kind, length = data[pos:pos + 4], struct.unpack("<I", data[pos + 4:pos + 8])[0]
        body = data[pos + 8:pos + 8 + length]
        if len(body) < length:
            raise ImageRefusee("WebP incomplet")
        if kind == b"VP8X":
            size = (int.from_bytes(body[4:7], "little") + 1, int.from_bytes(body[7:10], "little") + 1)
            body = bytes([body[0] & ~0x0C]) + body[1:]  # indicateurs EXIF (0x08) et XMP (0x04) retirés
        elif kind == b"VP8 " and size is None:
            w, h = struct.unpack("<HH", body[6:10])
            size = (w & 0x3FFF, h & 0x3FFF)
        elif kind == b"VP8L" and size is None:
            bits = int.from_bytes(body[1:5], "little")
            size = ((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1)
        if kind not in (b"EXIF", b"XMP "):
            chunks.append(kind + struct.pack("<I", length) + body + (b"\x00" if length % 2 else b""))
        pos += 8 + length + (length % 2)
    if size is None:
        raise ImageRefusee("WebP mal formé")
    payload = b"WEBP" + b"".join(chunks)
    return b"RIFF" + struct.pack("<I", len(payload)) + payload, size
