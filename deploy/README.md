# Déployer GSMS Qualiopi sur un serveur

Une commande installe tout sur un VPS : base PostgreSQL, API, worker, site public, back-office et HTTPS
automatique. Si Traefik tient déjà les ports 80/443 (autres sites sur le serveur), l'application s'y branche par
étiquettes, sans rien arrêter ; sinon le service `web` (Caddy) s'en charge (Let's Encrypt).

Installation la plus simple, depuis la console du VPS (root) :

```bash
curl -fsSLO https://raw.githubusercontent.com/samiriggui-code/gsms-qualiopi/claude/publish-gsms-qualiopi-v0ta5n/deploy/install.sh && bash install.sh
```

```
Internet ──443──> [Traefik] ──> web (Caddy) ─┬─ /        site public (landing/, export statique)
                                             ├─ /app/    back-office (app/, build Vite)
                                             ├─ /api/    api (FastAPI) ──> db (PostgreSQL)
                                             │                worker ───┘
                                             └─ /ia/     ia-app (moteur IA), préfixe /ia retiré
```

## Publication : le service `web`

`deploy/web.Dockerfile` construit la landing et le back-office (`VITE_BASE_PATH=/app/`), puis les sert avec Caddy
(version et images figées par empreinte), configuré par `deploy/Caddyfile`. Une seule origine : pas de CORS, et le
back-office appelle `/api/v1` et `/ia` en relatif.

- **Sans Traefik** (`docker-compose.caddy.yml`) : `web` prend les ports 80/443, `SITE_ADDRESS` = le domaine, Caddy
  obtient le certificat. **Avec Traefik** (`docker-compose.traefik*.yml`) : `web` écoute en HTTP sur `:80`
  (`SITE_ADDRESS=:80`) et Traefik termine le HTTPS.
- **Jamais publiés** (404) : `/api/v1/mcp` (serveur MCP réservé au moteur IA, sur le réseau interne),
  `/ia/mcp`, `/ia/api/v1/local-browser/internal`, et le canal d'intégration WeKnora (`/app/embed*`,
  `embed.html`, `weknora-widget.js`) : GSMS ne propose pas de chat intégrable dans un site tiers.
- **Liens envoyés par e-mail ou QR code** : `/q/{jeton}`, `/espace/{jeton}` et `/emarger` sont servis par la page du
  back-office (même CSP) ; `/api/public/documents/{jeton}` est réécrit vers `/api/v1/public/documents/{jeton}`.
- **Moteur IA** : `/ia/*` vers `ia-app:8080` sans le préfixe ; réponses SSE transmises au fil de l'eau
  (`flush_interval -1`), WebSocket relayé. Corps limités : 20 Mo vers l'API, 50 Mo vers le moteur IA.
- **Adresse du client** : Caddy fait confiance aux relais d'adresse privée (Traefik) et transmet l'adresse réelle
  dans `X-Forwarded-For`, que l'API utilise pour ses limites de débit.

### En-têtes de sécurité

Partout : `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`,
`Permissions-Policy`, `Cross-Origin-Opener-Policy`, sans en-tête `Server`. Content-Security-Policy par zone :

| Zone | Politique | Pourquoi pas plus strict |
|---|---|---|
| `/app/` | `script-src 'self' 'wasm-unsafe-eval'`, aucun script en ligne ni `eval`, `connect-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'` | `style-src 'unsafe-inline'` : TDesign, Vue et mermaid posent des styles à l'exécution ; `'wasm-unsafe-eval'` : décodeurs de pdf.js ; `blob:` (images, cadres, workers) : aperçus de documents |
| `/api/`, `/ia/` | `default-src 'none'` (l'API garde les styles en ligne de ses documents HTML, sans script) | — |
| `/` (landing) | `script-src 'self' 'unsafe-inline'` | l'export statique de Next.js écrit ses données de page en scripts en ligne |

Le back-office ne contient aucun script en ligne : `app/index.html` charge `boot.js` (thème) et `config.js`. Un
aperçu HTML ouvert depuis un Blob hérite de cette politique : ses scripts en ligne ne s’exécutent pas (seuls des fichiers servis par l’application le pourraient).

Essai local de la configuration (sans HTTPS), avec l'API et le moteur IA de `docker compose` :

```bash
docker build -f deploy/web.Dockerfile -t gsms-web .
docker run --rm --network host -e SITE_ADDRESS=:4190 -e API_UPSTREAM=127.0.0.1:8000 \
  -e IA_UPSTREAM=127.0.0.1:4103 gsms-web          # puis http://127.0.0.1:4190/app/ ; Ctrl-C pour arrêter
```

## Prérequis

- Un VPS Linux (Ubuntu ou Debian), 2 Go de RAM au moins.
- Docker et son extension compose : `curl -fsSL https://get.docker.com | sh`.
- Un nom de domaine (enregistrement DNS **A**) qui pointe vers l'adresse IP du VPS.
- Ports 80 et 443 ouverts (par exemple `ufw allow 80,443/tcp`).

## Première installation

```bash
git clone https://github.com/samiriggui-code/gsms-qualiopi.git
cd gsms-qualiopi
./deploy/deploy.sh formssi.global-it-ss.com            # base vide, référentiels Qualiopi V9 et V10 importés
# ou : ./deploy/deploy.sh formssi.global-it-ss.com --demo   (organisme de démonstration, pour essayer)
```

Le script :

1. vérifie que le domaine pointe bien vers ce serveur ;
2. crée `.env` avec des secrets tirés au hasard (lisible par vous seul, jamais committé) ;
3. construit et démarre les services, applique les migrations ;
4. importe les référentiels (ou installe la démo) ;
5. affiche la commande pour créer le compte de direction :

```bash
docker compose exec api python -m app.cmd.cli create-admin vous@exemple.fr "Votre nom"
```

## Mettre à jour

```bash
cd gsms-qualiopi && git pull && ./deploy/deploy.sh formssi.global-it-ss.com
```

Les données (base, documents, certificats) sont dans des volumes Docker et survivent aux mises à jour.

## E-mails

Les relances sont désactivées par défaut. Avant de les activer, renseignez le serveur SMTP de
l'organisme dans `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`), puis
relancez `./deploy/deploy.sh formssi.global-it-ss.com`. Hostinger : `smtp.hostinger.com`, port 465, SSL (déjà renseignés).

## Exploitation

```bash
# Depuis le dossier de l'application (.env indique à Docker les fichiers à utiliser)
docker compose ps                      # état des services
docker compose logs -f api worker      # journaux
docker compose exec db pg_dump -U gsms gsms | gzip > sauvegarde-$(date +%F).sql.gz   # sauvegarde de la base
```

Sauvegardez aussi le volume des documents (`gsms-qualiopi_gsms-documents`) et gardez une copie de
`.env` en lieu sûr : sans `JWT_SECRET`, les liens signés déjà envoyés ne sont plus valides.
