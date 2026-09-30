#!/usr/bin/env bash
# Installation complète de GSMS Qualiopi sur un VPS neuf (Ubuntu / Debian), en root.
#
#   curl -fsSLO https://raw.githubusercontent.com/samiriggui-code/gsms-qualiopi/claude/publish-gsms-qualiopi-v0ta5n/deploy/install.sh
#   bash install.sh
#
# Installe Docker et git si besoin, ouvre les ports 80/443, récupère le code dans /opt/gsms-qualiopi,
# démarre base + API + worker + front + HTTPS (branché sur Traefik s'il est déjà là, sinon Caddy),
# puis crée le compte de direction.
# Relancer le même script met l'application à jour (les données sont conservées).
set -euo pipefail

DOMAIN="${DOMAIN:-formssi.global-it-ss.com}"
BRANCH="${BRANCH:-claude/publish-gsms-qualiopi-v0ta5n}"
REPO="https://github.com/samiriggui-code/gsms-qualiopi.git"
DIR="/opt/gsms-qualiopi"

say() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "À lancer en root." >&2
  exit 1
fi

say "Outils système"
if ! command -v git >/dev/null || ! command -v curl >/dev/null || ! command -v openssl >/dev/null; then
  apt-get update -qq && apt-get install -y -qq git curl openssl ca-certificates
fi
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true

say "Pare-feu : ports 80 et 443"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp && ufw allow 443/tcp
else
  echo "ufw inactif : rien à faire (vérifiez aussi le pare-feu Hostinger dans hPanel)."
fi

say "Code de l'application ($BRANCH)"
if [[ -d "$DIR/.git" ]]; then
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
else
  git clone -q -b "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"

first_install=false
[[ -f .gsms-initialise ]] || first_install=true

say "Construction et démarrage (plusieurs minutes la première fois)"
./deploy/deploy.sh "$DOMAIN"

if $first_install; then
  say "Compte de direction"
  read -rp "E-mail : " email
  read -rp "Nom affiché : " name
  echo "Mot de passe (12 caractères minimum, rien ne s'affiche pendant la saisie) :"
  docker compose exec api python -m app.cli create-admin "$email" "$name"
fi

say "Terminé"
echo "Application : https://$DOMAIN"
echo "E-mails : renseignez SMTP_USER, SMTP_PASSWORD et SMTP_FROM dans $DIR/.env, puis relancez : bash install.sh"
