#!/usr/bin/env bash
# Installe ou met à jour GSMS Qualiopi sur un serveur (Docker + HTTPS automatique).
#
#   ./deploy/deploy.sh formssi.global-it-ss.com            installe ou met à jour
#   ./deploy/deploy.sh formssi.global-it-ss.com --demo     première installation avec l'organisme de démonstration
#
# À lancer depuis la racine du dépôt cloné. Le premier lancement crée .env avec des secrets tirés au hasard
# (jamais committé) ; les lancements suivants le conservent et ne font que reconstruire et redémarrer.
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

first_install=false
if [[ ! -f .env ]]; then
  first_install=true
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
else
  sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" .env
fi

compose=(docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml)
"${compose[@]}" up -d --build --remove-orphans

echo "Attente de l'API (migrations)…"
for _ in $(seq 1 60); do
  if "${compose[@]}" exec -T api python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" 2>/dev/null; then
    break
  fi
  sleep 2
done

if $first_install; then
  if [[ "$DEMO" == "--demo" ]]; then
    "${compose[@]}" exec -T api python -m app.cli seed-demo
  else
    "${compose[@]}" exec -T api python -m app.cli import-referential qualiopi/v9
    "${compose[@]}" exec -T api python -m app.cli import-referential qualiopi/v10
  fi
  echo
  echo "Créez maintenant le compte de direction (mot de passe demandé, 12 caractères minimum) :"
  echo "  ${compose[*]} exec api python -m app.cli create-admin vous@exemple.fr \"Votre nom\""
fi

echo
echo "GSMS Qualiopi : https://$DOMAIN (le certificat HTTPS peut prendre une minute la première fois)."
