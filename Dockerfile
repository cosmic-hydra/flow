FROM node:22.22.0-bookworm-slim AS build

WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build

FROM node:22.22.0-bookworm-slim AS api

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/integrations ./integrations
USER node
EXPOSE 4010
CMD ["node", "apps/api/dist/index.js"]

FROM node:22.22.0-bookworm-slim AS worker

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=node:node /app/integrations ./integrations
USER node
CMD ["node", "apps/worker/dist/index.js"]

FROM nginx:1.29.7-alpine AS web

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
