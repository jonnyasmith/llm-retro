FROM node:24-slim AS build

WORKDIR /app/web
RUN corepack enable

COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml web/.npmrc ./
RUN pnpm install --frozen-lockfile

COPY web/ ./
RUN pnpm build && pnpm prune --prod

FROM node:24-slim AS runtime

WORKDIR /app/web
ENV NODE_ENV=production

COPY --from=build /app/web/build ./build
COPY --from=build /app/web/node_modules ./node_modules
COPY --from=build /app/web/package.json ./package.json
COPY web/scripts ./scripts
COPY web/src/lib/server/migrations.ts ./src/lib/server/migrations.ts
COPY db /app/db

EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.ts && node build"]
