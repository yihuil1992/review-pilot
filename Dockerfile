# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates git \
    && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY . .
ENV NODE_OPTIONS=--max-old-space-size=768 NEXT_TELEMETRY_DISABLED=1 NEXT_BUILD_CPUS=1
RUN PNPM_MAX_WORKERS=1 NODE_OPTIONS=--max-old-space-size=512 \
    pnpm install --frozen-lockfile --child-concurrency=2 --network-concurrency=4
ARG API_PROXY_URL=http://api:4000
ARG PUBLIC_WEB_ORIGIN=
ARG REVIEW_PILOT_TRIAL_MODE=false
ENV API_PROXY_URL=${API_PROXY_URL} NEXT_PUBLIC_API_BASE_URL=/api PUBLIC_WEB_ORIGIN=${PUBLIC_WEB_ORIGIN} REVIEW_PILOT_TRIAL_MODE=${REVIEW_PILOT_TRIAL_MODE}
RUN pnpm build:api && pnpm build:worker && pnpm build:web

FROM node:24.22.1-bookworm-slim AS runtime
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.revision=${SOURCE_REVISION}
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates git \
    && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY --from=build --chown=node:node /app /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PATH=/app/node_modules/.bin:$PATH
RUN mkdir -p /app/review-pilot-state && chown node:node /app/review-pilot-state
USER node
CMD ["node", "apps/api/dist/apps/api/src/main.js"]
