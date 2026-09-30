#!/usr/bin/env bash
# Installe ou met à jour GSMS Qualiopi sur un serveur (Docker + HTTPS automatique).
#
#   ./deploy/deploy.sh formssi.global-it-ss.com            installe ou met à jour
#   ./deploy/deploy.sh formssi.global-it-ss.com --demo     première installation avec l'organisme de démonstration
#
# À lancer depuis la racine du dépôt cloné. Le premier lancement crée .env avec des secrets tirés au hasard
# (jamais committé) ; les lancements suivants le conservent et ne font que reconstruire et redémarrer.
#
# HTTPS : si Traefik tient déjà les ports 80/443 (autres sites sur le serveur), l'application s'y branche ;
# sinon Caddy s'en charge. Rien d'existant n'est arrêté.
set -euo pipefail

DOMAIN="${1:-}"
DEMO="${2:-}"
if [[ -z "$DOMAIN" || "$DOMAIN" == -* ]]; then
  echo "Usage : $0 <nom-de-domaine> [--demo]" >&2
  exit 1
fi
cd "$(dirname "$0")/.."

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker (avec « docker compose ») est requis : https://docs.docker.com/engine/install/" >&2
  exit 1
fi

# Le nom de domaine doit pointer vers ce serveur, sinon le certificat HTTPS ne peut pas être obtenu.
server_ip="$(curl -fsS4 https://api.ipify.org 2>/dev/null || true)"
domain_ip="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}' || true)"
if [[ -n "$server_ip" && "$domain_ip" != "$server_ip" ]]; then
  echo "Attention : $DOMAIN pointe vers « ${domain_ip:-rien} », ce serveur est $server_ip." >&2
  echo "Créez l'enregistrement DNS A (ou attendez sa propagation) avant de continuer." >&2
  exit 1
fi

secret() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-48; }

# Écrit ou remplace une variable dans .env.
set_env() {
  if grep -q "^$1=" .env; then
    sed -i "s|^$1=.*|$1=$2|" .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}

if [[ ! -f .env ]]; then
  umask 077
  cat > .env <<ENV
# Généré par deploy/deploy.sh le $(date -u +%Y-%m-%d). Ne jamais committer ce fichier.
DOMAIN=$DOMAIN
APP_ENV=production
POSTGRES_PASSWORD=$(secret)
JWT_SECRET=$(secret)
# Envoi des e-mails (relances, désactivées par défaut) : SMTP Hostinger. Renseigner la boîte et son mot de passe.
# 587 + SMTP_STARTTLS=true, ou 465 + SMTP_SSL=true.
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASSWORD=
SMTP_STARTTLS=false
SMTP_SSL=true
# Adresse d'expédition = la boîte Hostinger (SMTP_USER).
SMTP_FROM=
ENV
  echo ".env créé (secrets générés, lisible par vous seul)."
fi
set_env DOMAIN "$DOMAIN"

# ── Publication HTTPS : Traefik déjà présent, ou Caddy ────────────────────────────────────────────────
traefik="$(docker ps --format '{{.Names}} {{.Image}}' | awk 'tolower($2) ~ /traefik/ {print $1; exit}')"
if [[ -n "$traefik" ]]; then
  # Configuration de Traefik : arguments de lancement, sinon son fichier de configuration.
  conf="$(docker inspect -f '{{join .Args "\n"}}' "$traefik")"
  conf+=$'\n'"$(docker exec "$traefik" sh -c 'cat /etc/traefik/traefik.y*ml /traefik.y*ml 2>/dev/null' || true)"
  network="${TRAEFIK_NETWORK:-$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' "$traefik" \
    | grep -vxE 'bridge|host|none' | head -1)}"
  entrypoint="${TRAEFIK_ENTRYPOINT:-$(printf '%s\n' "$conf" | sed -nE 's/.*--entrypoints\.([^.=]+)\.address=:?443.*/\1/Ip' | head -1)}"
  if [[ -z "$entrypoint" ]]; then  # traefik.yml : « entryPoints: <nom>: address: ":443" »
    entrypoint="$(printf '%s\n' "$conf" | awk '/^  [A-Za-z0-9_-]+:[ \t]*$/ {n=$1} /address:.*:443/ {sub(":","",n); print n; exit}')"
  fi
  resolver="${TRAEFIK_CERTRESOLVER:-$(printf '%s\n' "$conf" | sed -nE 's/.*--certificatesresolvers\.([^.=]+)\..*/\1/Ip' | head -1)}"
  if [[ -z "$resolver" ]]; then  # traefik.yml : « certificatesResolvers: <nom>: »
    resolver="$(printf '%s\n' "$conf" | awk '/^certificatesResolvers:/ {f=1; next} f && /^[ \t]+[A-Za-z0-9_-]+:/ {sub(":","",$1); print $1; exit}')"
  fi
  traefik_file=deploy/docker-compose.traefik.yml
  if [[ -z "$network" && "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$traefik")" == "host" ]]; then
    # Traefik en mode host : il joint le réseau propre à l'application, sans réseau partagé.
    network="$(basename "$PWD")_default"
    traefik_file=deploy/docker-compose.traefik-host.yml
  fi
  if [[ -z "$network" || -z "$entrypoint" || -z "$resolver" ]]; then
    echo "Traefik ($traefik) détecté, mais sa configuration n'a pas pu être lue entièrement :" >&2
    echo "  réseau=${network:-?} entrée 443=${entrypoint:-?} résolveur de certificats=${resolver:-?}" >&2
    echo "Relancez en précisant les valeurs manquantes, par exemple :" >&2
    echo "  TRAEFIK_ENTRYPOINT=websecure TRAEFIK_CERTRESOLVER=letsencrypt $0 $DOMAIN" >&2
    exit 1
  fi
  echo "HTTPS par le Traefik existant ($traefik) : réseau $network, entrée $entrypoint, certificats $resolver."
  set_env TRAEFIK_NETWORK "$network"
  set_env TRAEFIK_ENTRYPOINT "$entrypoint"
  set_env TRAEFIK_CERTRESOLVER "$resolver"
  set_env COMPOSE_FILE "docker-compose.yml:deploy/docker-compose.prod.yml:$traefik_file"
else
  if ss -ltn 2>/dev/null | grep -qE '[:.]80[[:space:]]' && ! docker ps --format '{{.Names}}' | grep -q 'caddy'; then
    echo "Le port 80 est déjà utilisé par un programme autre que Traefik :" >&2
    ss -ltnp 2>/dev/null | grep -E '[:.](80|443)[[:space:]]' >&2 || true
    echo "Rien n'a été arrêté. Libérez les ports 80/443 ou demandez un branchement sur ce programme." >&2
    exit 1
  fi
  echo "HTTPS par Caddy (ports 80 et 443)."
  set_env COMPOSE_FILE "docker-compose.yml:deploy/docker-compose.prod.yml:deploy/docker-compose.caddy.yml"
fi

docker compose up -d --build --remove-orphans

echo "Attente de l'API (migrations)…"
for _ in $(seq 1 60); do
  if docker compose exec -T api python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" 2>/dev/null; then
    break
  fi
  sleep 2
done

# Première mise en service (une seule fois) : référentiels Qualiopi, ou organisme de démonstration.
if [[ ! -f .gsms-initialise ]]; then
  if [[ "$DEMO" == "--demo" ]]; then
    docker compose exec -T api python -m app.cli seed-demo
  else
    docker compose exec -T api python -m app.cli import-referential qualiopi/v9
    docker compose exec -T api python -m app.cli import-referential qualiopi/v10
  fi
  date -u +%FT%TZ > .gsms-initialise
  echo
  echo "Créez maintenant le compte de direction (mot de passe demandé, 12 caractères minimum) :"
  echo "  docker compose exec api python -m app.cli create-admin vous@exemple.fr \"Votre nom\""
fi

echo
echo "GSMS Qualiopi : https://$DOMAIN (le certificat HTTPS peut prendre une minute la première fois)."
