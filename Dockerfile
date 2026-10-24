# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates git \
    && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY . .
ENV NODE_OPTIONS=--max-old-space-size=768 NEXT_TELEMETRY_DISABLED=1 NEXT_BUILD_CPUS=1
RUN PNPM_MAX_WORKERS=1 NODE_OPTIONS=--max-old-space-size=512 \
    pnpm install --frozen-lockfile --child-concurrency=2 --network-concurrency=4
ENV NEXT_PUBLIC_API_BASE_URL=/api
RUN pnpm build:api && pnpm build:worker && pnpm build:web

FROM node:24.22.1-bookworm-slim AS runtime
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.revision=${SOURCE_REVISION}
LABEL org.opencontainers.image.source=https://github.com/yihuil1992/review-pilot
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates git \
    && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY --from=build --chown=node:node /app /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PATH=/app/node_modules/.bin:$PATH
RUN mkdir -p /app/review-pilot-state && chown node:node /app/review-pilot-state
USER node
CMD ["node", "apps/api/dist/apps/api/src/main.js"]
