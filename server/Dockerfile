# syntax=docker/dockerfile:1

# ============================================================================
#  Iqtibosim backend — multi-stage production image (Node 22, Alpine/musl)
#
#  Stage  "deps"   : installs ALL deps (incl. dev) with scripts disabled —
#                    prisma generate needs the schema, not yet copied.
#  Stage  "build"  : generates the Prisma client, then compiles TS -> dist/.
#  Stage  "runtime": production deps only + generated Prisma client + dist.
#
#  Database migrations are applied separately via the `migrate` service in
#  docker-compose.prod.yml (uses the "build" target so the prisma CLI is
#  available). See deploy/DOCKER_DEPLOY.md.
# ============================================================================

FROM node:22-alpine AS base
WORKDIR /app

# ---------------------------------------------------------------- deps ------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# --------------------------------------------------------------- build ------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ------------------------------------------------------------- runtime ------
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# --ignore-scripts: the prisma CLI (devDependency) is not installed here, so
# the postinstall "prisma generate" would otherwise fail.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
# The generated client (incl. musl engine binaries) comes from the build stage.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY prisma ./prisma
COPY --from=build /app/dist ./dist
# Uploaded images (R2 not configured) are stored here; mount a volume.
RUN mkdir -p uploads

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "dist/index.js"]
