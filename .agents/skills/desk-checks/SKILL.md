---
name: desk-checks
description: Plant und führt Desk-Prüfungen gegen den vorgesehenen Git-Stand mit isolierten Datenbanken, freien Ports und nachvollziehbaren Ergebnissen aus.
---

# Desk-Prüfungen ausführen

Verwende die [Prüfregeln](../../../docs/entwicklung.md#prüfungen-und-dokumentation) und die Befehle des konkreten Zielstands. Lies `package.json` und die GitHub-Workflows, falls vorhanden. Ein reiner Doku-Stand verlangt Quellen, ausführbare Beispiele, relative Links und eine saubere Git-Änderung.

Bei einem Anwendungsstand verwende die dort festgelegte Bun-Version. Gewöhnliche Prüfungen sind `bun install --frozen-lockfile`, `bun run build`, `bun run check`, `bun run migrate` und `bun run test`. Verwende für Fachdaten eine eigene Testdatenbank mit Endung `_test`. Wähle bei einem gezielten Review den betroffenen Test zusätzlich einzeln.

Für Browserprüfungen nutze eine getrennte `_demo`-Datenbank, feste lokale Adressen und synthetische Demo-Daten. Prüfe vorher laufende Container und lokale Listener. Ein anderer Compose-Projektname ändert den veröffentlichten Host-Port alleine nicht. Wenn Fremdintegrationen deaktiviert sein sollen, setze ihre Zugangsumgebungsvariablen im Testprozess ausdrücklich leer, falls Bun lokale `.env`-Werte nachladen kann. Nutze `DESK_E2E_URL` für eine bereits gestartete Instanz. Der [Screenshot-Skill](../desk-pr-screenshots/SKILL.md) beschreibt die Bildaufnahme.

Beende nach der Prüfung nur die eigens gestarteten Testdienste. Notiere Befehle, Stand, Resultate und Gründe für ausgelassene Prüfungen im PR.

## Beispiel mit PostgreSQL und Chromium

Führe das Beispiel in Bash im getrennten Worktree aus. Es benötigt Docker, die Bun-Version aus `package.json`, curl und die Chromium-Systembibliotheken für Playwright. Auf einem frischen Linux-System kannst du Chromium und seine Systembibliotheken mit `bun x playwright install --with-deps chromium` installieren. Docker vergibt einen eigenen PostgreSQL-Port auf Loopback. Der Desk-Browserport ist standardmäßig 4280 und lässt sich mit `DESK_CHECK_BROWSER_PORT` ändern.

```bash
(
  set -euo pipefail
  random_hex() { bun -e 'console.log(crypto.randomUUID().replaceAll("-", ""))'; }
  database="desk-checks-$(random_hex)"
  password=$(random_hex)
  browser_port=${DESK_CHECK_BROWSER_PORT:-4280}
  server_pid=
  log=$(mktemp)
  cleanup() {
    if [[ -n "$server_pid" ]]; then
      kill "$server_pid" 2>/dev/null || true
      wait "$server_pid" 2>/dev/null || true
    fi
    if docker container inspect "$database" >/dev/null 2>&1; then
      docker rm -fv "$database" >/dev/null
    fi
    rm -f "$log"
  }
  trap cleanup EXIT
  docker run --detach --name "$database" --publish 127.0.0.1::5432 \
    --env POSTGRES_USER=desk --env "POSTGRES_PASSWORD=$password" \
    --env POSTGRES_DB=desk_checks_test postgres:17 >/dev/null
  for ((attempt=0; attempt<30; attempt++)); do
    if docker exec "$database" pg_isready -h 127.0.0.1 -U desk -d desk_checks_test >/dev/null; then break; fi
    sleep 1
  done
  docker exec "$database" pg_isready -h 127.0.0.1 -U desk -d desk_checks_test
  database_address=$(docker port "$database" 5432/tcp)
  database_base="postgres://desk:$password@$database_address"
  export DATABASE_URL="$database_base/desk_checks_test"
  export DESK_ORIGIN="http://127.0.0.1:$browser_port"
  export DESK_AUTH_SECRET="$(random_hex)$(random_hex)"
  export HABEN_URL= HABEN_TOKEN= ZAMMAD_URL= ZAMMAD_TOKEN=
  bun install --frozen-lockfile
  bun run build
  bun run check
  bun run migrate
  bun run test

  docker exec "$database" createdb -U desk desk_checks_demo
  export DATABASE_URL="$database_base/desk_checks_demo"
  export DESK_DEMO_PASSWORD="$(random_hex)"
  export DESK_E2E_URL="$DESK_ORIGIN"
  bun run migrate
  bun run demo
  bun x playwright install chromium
  bun -e 'Bun.listen({hostname:"127.0.0.1",port:Number(process.argv[1]),socket:{data(){}}}).stop(true)' "$browser_port"
  NITRO_HOST=127.0.0.1 NITRO_PORT="$browser_port" bun .output/server/index.mjs >"$log" 2>&1 &
  server_pid=$!
  for ((attempt=0; attempt<30; attempt++)); do
    if ! kill -0 "$server_pid" 2>/dev/null; then cat "$log" >&2; exit 1; fi
    if curl -fs --max-time 2 "$DESK_E2E_URL/api/v1/ready" >/dev/null; then break; fi
    sleep 1
  done
  curl -fsS --max-time 2 "$DESK_E2E_URL/api/v1/ready"
  bun x playwright test --project=core e2e/core.spec.ts
)
```

Der Browserlauf prüft beide Musteraufträge über die zuvor gebaute Anwendung. Für weitere UI-Prüfungen nutze dieselbe Demo-Instanz. Baue sie nach Änderungen am Anwendungscode erneut. Der [Screenshot-Skill](../desk-pr-screenshots/SKILL.md) beschreibt, wie du Basis und Änderung vergleichst.
