# Déployer GSMS Qualiopi sur un serveur

Une commande installe tout sur un VPS : base PostgreSQL, API, worker, front, et HTTPS automatique.
Si Traefik tient déjà les ports 80/443 (autres sites sur le serveur), l'application s'y branche par
étiquettes, sans rien arrêter ; sinon Caddy s'en charge (Let's Encrypt). Seul le front est exposé ;
l'API reste sur le réseau interne.

Installation la plus simple, depuis la console du VPS (root) :

```bash
curl -fsSLO https://raw.githubusercontent.com/samiriggui-code/gsms-qualiopi/claude/publish-gsms-qualiopi-v0ta5n/deploy/install.sh && bash install.sh
```

```
Internet ──443──> Traefik ou Caddy ──> web (Next.js) ──> api (FastAPI) ──> db (PostgreSQL)
                                               worker ─────────┘
```

## Prérequis

- Un VPS Linux (Ubuntu ou Debian), 2 Go de RAM au moins (4 Go conseillés pour construire le front).
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
docker compose exec api python -m app.cli create-admin vous@exemple.fr "Votre nom"
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
