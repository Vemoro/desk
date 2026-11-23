FROM oven/bun:1.4.5 AS build
WORKDIR /desk
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4.5
WORKDIR /desk
COPY --from=build /desk/.output ./.output
COPY --from=build /desk/migrations ./migrations
COPY --from=build /desk/scripts/migrate.ts ./scripts/migrate.ts
COPY --from=build /desk/scripts/admin.ts ./scripts/admin.ts
COPY --from=build /desk/src/server/db.ts ./src/server/db.ts
COPY --from=build /desk/src/server/auth.ts ./src/server/auth.ts
COPY --from=build /desk/src/server/errors.ts ./src/server/errors.ts
COPY --from=build /desk/node_modules/zod ./node_modules/zod
USER bun
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
