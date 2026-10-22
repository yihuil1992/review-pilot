# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates git \
    && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ENV NODE_OPTIONS=--max-old-space-size=768 NEXT_TELEMETRY_DISABLED=1 NEXT_BUILD_CPUS=1
ARG API_PROXY_URL=http://api:4000
ENV API_PROXY_URL=${API_PROXY_URL} NEXT_PUBLIC_API_BASE_URL=/api
RUN pnpm build:api && pnpm build:worker && pnpm build:web

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates git \
    && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY --from=build --chown=node:node /app /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PATH=/app/node_modules/.bin:$PATH
RUN mkdir -p /app/review-pilot-state && chown node:node /app/review-pilot-state
USER node
CMD ["node", "apps/api/dist/apps/api/src/main.js"]
