# Code tiers repris dans GSMS

## Mizan — licence MIT

Source : https://github.com/simoderyouch/Mizan (commit `26d2163`)

Éléments repris ou adaptés :

| Fichier GSMS | Origine Mizan | Nature |
| --- | --- | --- |
| `backend/app/core/config.py` (`refuse_unsafe_production`, `WEAK_SECRETS`) | `mizan-backend/app/core/config.py` (`validate_production_safety`) | Adapté |

```
MIT License

Copyright (c) 2026 Mizan contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Référentiel national qualité — Licence Ouverte Etalab 2.0

`backend/referentials/qualiopi/v9/source/` : texte du guide de lecture V9 (DGEFP, 8 janvier 2024),
mis en Markdown par Levier-IA/qualiopi-markdown (commit figé dans `UPSTREAM_COMMIT`).
Seul le PDF officiel du ministère du Travail fait foi.
