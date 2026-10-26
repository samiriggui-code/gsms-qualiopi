# Service « web » : une seule origine qui sert la landing (/), le back-office (/app/) et relaie l'API (/api/)
# et le moteur IA (/ia/). Configuration et en-têtes de sécurité : deploy/Caddyfile ; usage : deploy/README.md.
# Contexte de construction : la racine du dépôt (fichiers retenus : deploy/web.Dockerfile.dockerignore).
#
#   docker build -f deploy/web.Dockerfile -t gsms-web .

# Images figées par empreinte : le JavaScript livré ne doit pas changer avec une étiquette flottante.
FROM node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS app
WORKDIR /build/app
ENV NODE_OPTIONS="--max-old-space-size=4096"
# Le lockfile fige aussi l'archive SheetJS distante et son empreinte d'intégrité.
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
ARG VITE_FRONTEND_COMMIT=unknown
ENV VITE_FRONTEND_COMMIT=${VITE_FRONTEND_COMMIT} VITE_BASE_PATH=/app/
RUN npx vite build

FROM node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS landing
WORKDIR /build/landing
COPY landing/package.json landing/package-lock.json ./
RUN npm ci --no-audit --no-fund
# La landing importe les jetons du thème partagé (theme/tokens.css).
COPY theme/ /build/theme/
COPY landing/ ./
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN npx next build

# caddy 2.11.7
FROM caddy:2.11.7-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=app /build/app/dist /srv/app
COPY --from=landing /build/landing/out /srv/landing
