FROM oven/bun:1.4.5 AS build
WORKDIR /desk
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4.5
WORKDIR /desk
COPY --from=build --chown=bun:bun /desk/.output ./.output
COPY --from=build --chown=bun:bun /desk/migrations ./migrations
COPY --from=build --chown=bun:bun /desk/scripts/migrate.ts ./scripts/migrate.ts
COPY --from=build --chown=bun:bun /desk/scripts/admin.ts ./scripts/admin.ts
COPY --from=build --chown=bun:bun /desk/src/server/db.ts ./src/server/db.ts
COPY --from=build --chown=bun:bun /desk/src/server/accounts.ts ./src/server/accounts.ts
COPY --from=build --chown=bun:bun /desk/node_modules/zod ./node_modules/zod
USER bun
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
