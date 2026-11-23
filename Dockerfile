# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS manifests
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json

FROM manifests AS dependencies
RUN npm ci

FROM dependencies AS source
COPY . .
RUN npm run build -w @stockflow/shared

FROM source AS api-build
RUN npm run build -w @stockflow/api

FROM manifests AS api-dependencies
RUN npm ci --omit=dev --workspace=@stockflow/api --workspace=@stockflow/shared --include-workspace-root=false

FROM base AS api
ENV NODE_ENV=production API_HOST=0.0.0.0 PORT=4000
COPY --from=api-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=api-build --chown=node:node /app/apps/api/dist ./apps/api/dist
# npm workspaces may install runtime packages locally instead of hoisting them.
COPY --from=api-dependencies --chown=node:node /app/apps/api ./apps/api
COPY --from=api-build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=api-build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]

FROM source AS web-build
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api
ENV BUILD_STANDALONE=1 NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN npm run build -w @stockflow/web

FROM base AS web
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
