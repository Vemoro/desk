# Lizenzinventar der Desk-Auslieferung

Desk verwendet AGPL-3.0-only. Dieses Inventar behandelt die Drittanbieterdateien in der Anwendungsausgabe. Die Lizenzentscheidung und die offenen Schritte zur öffentlichen Auslieferung stehen in [Issue #50](https://github.com/Vemoro/desk/issues/50). Die Bedingungen für den entsprechenden Quellcode ergeben sich aus der [GNU AGPLv3](https://www.gnu.org/licenses/agpl-3.0.html).

## Geprüfter Stand

Am 25. November 2026 wurde [`21813b3377ccebcf90b653b499e6eef6876a666a`](https://github.com/Vemoro/desk/commit/21813b3377ccebcf90b653b499e6eef6876a666a) aus einem Git-Archiv als Linux/amd64-Image gebaut. Das verwendete Bun-Basisimage `oven/bun:1.4.5` wurde als `sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18` aufgelöst. Bewertet wurden Browserdateien unter `.output/public`, gebündelte Serverdateien unter `.output/server`, von Nitro kopierte Module und die für die Betriebs-CLI kopierte Zod-Installation. Anwendungs-CI des Standes

Ein zweiter Build zeichnete über den Rolldown-Hook `generateBundle` je Umgebung die Module mit positivem Ausgabeumfang auf. Die Paketnamen und Versionen stammen aus den zugehörigen installierten Manifesten. Unter den 40 verglichenen Browser- und Serverdateien außerhalb von `node_modules` hatten 39 identische Hashes. Im Server-Einstieg unterschieden sich ausschließlich drei Änderungszeitpunkte der statischen Dateien. Die acht von Nitro kopierten Moduldateien stimmten bytegenau überein. [Rolldown-Hook `generateBundle`](https://rolldown.rs/reference/Interface.FunctionPluginHooks#generatebundle)

Für die Aktualisierung von Better Auth und Better Call wurde der Lizenzwortlaut der sieben geänderten Paketversionen erneut mit den installierten Paketen abgeglichen. [OIDC-Änderung](https://github.com/Vemoro/desk/pull/215)

## Paketversionen in der Anwendungsausgabe

Das Verzeichnis der installierten Abhängigkeiten ist größer als die Auslieferung. Die Tabelle enthält 78 unterschiedliche Paketversionen aus den Build-Ausgaben und Kopierschritten. Die Spalte „Quelle für den Lizenztext“ bezeichnet die Datei im ursprünglichen Installationspaket oder die dort belegte Alternative. Die Spalte sagt nichts über die Vollständigkeit der Hinweise im Laufzeit-Image aus.

- **Browser** bezeichnet das Client-Bundle. **Server** bezeichnet das Nitro-Bundle. **SSR** bezeichnet die Vite-Vorstufe der Serverausgabe und wird als zusätzliche Herkunftsspur geführt. **Kopie** bezeichnet Dateien, die physisch im Image liegen.

| Paket | Version | Lizenz laut Paket | Ausgabe | Quelle für den Lizenztext |
| --- | --- | --- | --- | --- |
| `@better-auth/core` | 1.7.16 | MIT | Browser, Server | `LICENSE.md` |
| `@better-auth/kysely-adapter` | 1.7.16 | MIT | Server | `LICENSE.md` |
| `@better-auth/memory-adapter` | 1.7.16 | MIT | Server | `LICENSE.md` |
| `@better-auth/passkey` | 1.7.16 | MIT | Browser, Server | `LICENSE.md` |
| `@better-auth/telemetry` | 1.7.16 | MIT | Server | `LICENSE.md` |
| `@better-auth/utils` | 0.5.1 | MIT | Server | `LICENSE` |
| `@better-fetch/fetch` | 1.3.3 | MIT | Browser, Server | `LICENSE` |
| `@hexagon/base64` | 1.1.28 | MIT | Server | `LICENSE` |
| `@levischuck/tiny-cbor` | 0.2.11 | MIT | Server | `LICENSE` |
| `@noble/ciphers` | 2.4.0 | MIT | Server | `LICENSE` |
| `@noble/hashes` | 2.4.0 | MIT | Server | `LICENSE` |
| `@peculiar/asn1-android` | 2.11.1 | MIT | Server | `LICENSE` |
| `@peculiar/asn1-cms` | 2.11.1 | MIT | Server | `LICENSE` |
| `@peculiar/asn1-csr` | 2.11.1 | MIT | Server | `LICENSE` |
| `@peculiar/asn1-ecc` | 2.11.1 | MIT | Server | `LICENSE` |
| `@peculiar/asn1-pfx` | 2.11.1 | MIT | Server | `LICENSE` |
| `@peculiar/asn1-pkcs8` | 2.11.1 | MIT | Server | `LICENSE` |
| `@peculiar/asn1-pkcs9` | 2.11.1 | MIT | Server | `LICENSE` |
| `@peculiar/asn1-rsa` | 2.11.1 | MIT | Server | `LICENSE` |
| `@peculiar/asn1-schema` | 2.11.1 | MIT | Server | `LICENSE` |
| `@peculiar/asn1-x509` | 2.11.1 | MIT | Server | `LICENSE` |
| `@peculiar/asn1-x509-attr` | 2.11.1 | MIT | Server | `LICENSE` |
| `@peculiar/utils` | 2.0.3 | MIT | Server | `LICENSE` |
| `@peculiar/x509` | 1.14.3 | MIT | Server | `LICENSE` |
| `@simplewebauthn/browser` | 13.3.0 | MIT | Browser, Server | `LICENSE.md` |
| `@simplewebauthn/server` | 13.3.3 | MIT | Server | `LICENSE.md` |
| `@tanstack/history` | 1.162.5 | MIT | Browser, Server | `LICENSE` |
| `@tanstack/react-router` | 1.170.46 | MIT | Browser, Server | `LICENSE` |
| `@tanstack/react-start` | 1.169.7 | MIT | Browser, SSR | `LICENSE` |
| `@tanstack/react-start-client` | 1.168.45 | MIT | Browser | `LICENSE` |
| `@tanstack/react-start-server` | 1.167.52 | MIT | SSR | `LICENSE` |
| `@tanstack/react-store` | 0.11.4 | MIT | Browser, Server | `LICENSE` |
| `@tanstack/router-core` | 1.171.39 | MIT | Browser, Server | `LICENSE` |
| `@tanstack/start-client-core` | 1.170.39 | MIT | Browser, SSR | `LICENSE` |
| `@tanstack/start-server-core` | 1.169.45 | MIT | SSR | `LICENSE` |
| `@tanstack/start-storage-context` | 1.167.41 | MIT | SSR | `LICENSE` |
| `@tanstack/store` | 0.11.3 | MIT | Browser, Server | `LICENSE` |
| `asn1js` | 3.1.0 | BSD-3-Clause | Server | `LICENSE` |
| `better-auth` | 1.7.16 | MIT | Browser, Server, SSR | `LICENSE.md` |
| `better-call` | 1.4.5 | MIT | Browser, Server | `LICENSE` |
| `cookie-es` | 3.1.1 | MIT | Server | `LICENSE` |
| `defu` | 6.1.7 | MIT | Browser, Server | `LICENSE` |
| `h3` | 2.0.8 | MIT | Server | `LICENSE` |
| `isbot` | 5.2.3 | Unlicense | Server | `LICENSE` |
| `jose` | 6.2.18 | MIT | Server | `LICENSE.md` |
| `kysely` | 0.29.9 | MIT | Server | `LICENSE` |
| `nanostores` | 1.5.5 | MIT | Browser, Server | `LICENSE` |
| `nitro` | 3.0.261103-rc | MIT | Server | `LICENSE` |
| `pg` | 8.23.1 | MIT | Server | `LICENSE` |
| `pg-cloudflare` | 1.4.1 | MIT | Server | `LICENSE` |
| `pg-connection-string` | 2.14.1 | MIT | Server | `LICENSE` |
| `pg-int8` | 1.0.1 | ISC | Server | `LICENSE` |
| `pg-pool` | 3.14.0 | MIT | Server | `LICENSE` |
| `pg-protocol` | 1.16.1 | MIT | Server | `LICENSE` |
| `pg-types` | 2.2.0 | MIT | Server | `README.md` |
| `pgpass` | 1.0.5 | MIT | Server | `README.md` |
| `postgres-array` | 2.0.0 | MIT | Server | `license` |
| `postgres-bytea` | 1.0.1 | MIT | Server | `license` |
| `postgres-date` | 1.0.7 | MIT | Server | `license` |
| `postgres-interval` | 1.2.0 | MIT | Server | `license` |
| `pvtsutils` | 1.3.6 | MIT | Server | `LICENSE` |
| `pvutils` | 1.2.0 | MIT | Server | `LICENSE` |
| `react` | 19.3.1 | MIT | Browser, Server | `LICENSE` |
| `react-dom` | 19.3.1 | MIT | Browser, Server | `LICENSE` |
| `reflect-metadata` | 0.2.2 | Apache-2.0 | Server | `LICENSE`, `CopyrightNotice.txt` |
| `rou3` | 0.9.2 | MIT | Server | `LICENSE` |
| `rou3` | 1.0.0 | MIT | Server | `LICENSE` |
| `scheduler` | 0.28.0 | MIT | Browser | `LICENSE` |
| `seroval` | 1.8.2 | MIT | Browser, Server | `LICENSE` |
| `seroval-plugins` | 1.8.0 | MIT | Browser, Server | `LICENSE` |
| `split2` | 4.2.0 | ISC | Server | `LICENSE` |
| `srvx` | 1.0.8 | MIT | Server | `LICENSE` |
| `tslib` | 1.14.1 | 0BSD | Kopie | `LICENSE.txt`, `CopyrightNotice.txt` |
| `tslib` | 2.9.1 | 0BSD | Kopie | `LICENSE.txt`, `CopyrightNotice.txt` |
| `tsyringe` | 4.10.0 | MIT | Server | `LICENSE` |
| `use-sync-external-store` | 1.7.0 | MIT | Browser, Server | `LICENSE` |
| `xtend` | 4.0.2 | MIT | Server | `LICENSE` |
| `zod` | 4.6.7 | MIT | Server, Kopie | `LICENSE` |

## Mitgelieferter und generierter Code außerhalb der Tabelle

- Nitro enthält bereits vorgebündelten Code aus `hookable` und `ufo`. Die beim Build verwendeten Module heißen `hookable.mjs` und `ufo.mjs`. Das Lockfile des Nitro-Quellstands ordnet sie `hookable 6.1.2` und `ufo 1.6.4` zu. [Nitro-Quellstand und Lockfile](https://github.com/nitrojs/nitro/blob/c7cf4fe9cc3b0f5a05ca4e48d0ad6d533b03e939/pnpm-lock.yaml)
- Die Build-Ausgaben enthalten virtuelle Module mit Laufzeitcode von Vite 8.3.8 und Rolldown 1.2.19, darunter die Vorladehilfe von Vite und die Modulhelfer von Rolldown. Für deren Zuordnung sind `LICENSE.md` im Vite-Paket sowie `LICENSE` und `THIRD-PARTY-LICENSE` im Rolldown-Paket maßgebliche Quellen.
- Das Basisimage enthält Bun und 80 Debian-Pakete. Diese Komponenten gehören in eine eigene Prüfung des vollständigen Container-Images. [Bun-Quellstand](https://github.com/oven-sh/bun/tree/a7733435cf40429e3b35c36072769df2052b80f1)

## Befunde für die Auslieferung

- Das Image des geprüften Ausgangsstands enthielt keine Desk-`LICENSE` unter `/desk`. Das Dockerfile kopiert sie jetzt aus demselben Checkout ins Laufzeit-Image. Der Image-Test vergleicht den Lizenzinhalt nach Vereinheitlichung der Zeilenenden.
- Das Image des geprüften Ausgangsstands enthielt `tslib` 1.14.1 und 2.9.1. Nitro übernahm bei beiden Versionen die JavaScript-Dateien und Paketmanifeste. Die Originalpakete enthalten außerdem `LICENSE.txt` und `CopyrightNotice.txt`.
- Bei `pg-types` und `pgpass` steht der MIT-Text mit Urheberhinweis in der jeweiligen `README.md` des installierten Pakets. Berücksichtige diese Texte beim Zusammenstellen der Hinweise. Eine Suche im ausgelieferten PostgreSQL-Bundle fand die beiden Urheberhinweise nicht.
- Die [Drittanbieterhinweise der Anwendung](../public/third-party-notices.txt) enthalten die Texte der 78 inventarisierten Paketversionen und die Hinweise zu Hookable, UFO, Vite und Rolldown. Der Text enthält auch die Copyright-Hinweise von `tslib` und `reflect-metadata` sowie die Lizenzabschnitte aus den READMEs von `pg-types` und `pgpass`. Für `hookable` stammt der Text aus dem npm-Paket, dessen Prüfsumme das verlinkte Nitro-Lockfile enthält.
- Die laufende Desk-Instanz liefert dieselbe Datei ohne Anmeldung unter `/third-party-notices.txt` aus. Das Laufzeit-Image enthält sie unter `/desk/.output/public/third-party-notices.txt`. Der Image-Test vergleicht die HTTP-Ausgabe mit der Datei im gebauten Git-Stand.
- Der [Desk-Urheberhinweis](../public/desk-notice.txt) liegt im Quellpaket und wird im laufenden Dienst unter `/desk-notice.txt` ausgeliefert. Vor einer öffentlichen Auslieferung steht die Bereitstellung des entsprechenden Quellcodes offen. Beim Build lässt sich der Quellstand über `DESK_SOURCE_URL` verlinken. Für ein öffentlich ausgeliefertes Image steht die Prüfung des Basisimages separat aus. Vergleiche die Anwendungsausgabe und die dazugehörigen Hinweise erneut, wenn sich Abhängigkeiten oder der Build ändern. [Quellcode-Link im Betrieb](desk.md#quellcode-für-den-ausgelieferten-stand) · [Issue #50](https://github.com/Vemoro/desk/issues/50)
