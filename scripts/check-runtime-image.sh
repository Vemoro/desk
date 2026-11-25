#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
commit="$(git rev-parse HEAD)"
project="desk-runtime-$(openssl rand -hex 8)"
image="${DESK_RUNTIME_IMAGE:-$project}"
port="${DESK_RUNTIME_TEST_PORT:-4180}"
db_password="$(openssl rand -hex 24)"
auth_secret="$(openssl rand -hex 32)"
DESK_RUNTIME_TEST_PASSWORD="$(openssl rand -hex 24)"
export DESK_RUNTIME_TEST_PASSWORD
export DESK_RUNTIME_TEST_COMMIT="$commit"
export DESK_E2E_URL="http://127.0.0.1:$port"
export DATABASE_URL="postgres://desk:$db_password@$project-db:5432/desk"

db_container=
db_volume=
desk_container=
network=
cleanup() {
  if [[ -n "$desk_container" ]]; then docker rm -fv "$desk_container" >/dev/null || true; fi
  if [[ -n "$db_container" ]]; then docker rm -fv "$db_container" >/dev/null || true; fi
  if [[ -n "$db_volume" ]]; then docker volume rm "$db_volume" >/dev/null || true; fi
  if [[ -n "$network" ]]; then docker network rm "$network" >/dev/null || true; fi
  if [[ -z "${DESK_RUNTIME_IMAGE:-}" ]]; then docker image rm "$image" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ -z "${DESK_RUNTIME_IMAGE:-}" ]]; then
  git archive --format=tar "$commit" | docker build --build-arg "DESK_BUILD_COMMIT=$commit" --tag "$image" -
fi

echo "Runtime-Prüfung $project"
network="$(docker network create "$project")"
db_volume="$(docker volume create "$project-db")"
db_container="$(MSYS2_ARG_CONV_EXCL='type=volume,' docker create --name "$project-db" --network "$network" \
  --mount "type=volume,source=$db_volume,target=/var/lib/postgresql/data" \
  -e POSTGRES_USER=desk -e POSTGRES_DB=desk -e "POSTGRES_PASSWORD=$db_password" postgres:17)"
docker start "$db_container" >/dev/null
for ((attempt=0; attempt<30; attempt++)); do
  if docker exec "$db_container" pg_isready -h 127.0.0.1 -U desk -d desk >/dev/null; then break; fi
  sleep 1
done
if ((attempt==30)); then
  echo "PostgreSQL wurde nicht innerhalb von 30 Versuchen bereit." >&2
  exit 1
fi

echo "Migration im Runtime-Image"
docker run --rm --network "$network" -e DATABASE_URL "$image" bun scripts/migrate.ts
DESK_ADMIN_PASSWORD="$DESK_RUNTIME_TEST_PASSWORD" \
  docker run --rm --network "$network" -e DATABASE_URL -e DESK_ADMIN_PASSWORD \
  "$image" bun scripts/admin.ts runtime@example.test 'Muster Runtime'
desk_container="$(DESK_AUTH_SECRET="$auth_secret" docker create --name "$project-desk" --network "$network" \
  -p "127.0.0.1:$port:3000" -e DATABASE_URL -e DESK_AUTH_SECRET -e "DESK_ORIGIN=$DESK_E2E_URL" "$image")"
docker start "$desk_container" >/dev/null
for ((attempt=0; attempt<30; attempt++)); do
  if curl -fs --max-time 3 "$DESK_E2E_URL/api/v1/ready" >/dev/null; then break; fi
  sleep 1
done
if ((attempt==30)); then
  echo "Desk wurde im Runtime-Image nicht innerhalb von 30 Versuchen bereit." >&2
  exit 1
fi

bunx playwright test --project runtime-image
