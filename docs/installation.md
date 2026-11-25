# Desk installieren

Desk kann eigenständig arbeiten oder ein Zammad-System für Tickets und Nachrichten nutzen. Dieser Plan beschreibt drei Installationswege und die Prüfungen für ihre Freigabe. Der Stand der Prüfungen ist im Abschnitt [Abnahme und Folgearbeiten](#abnahme-und-folgearbeiten) festgehalten.

| Weg | Geeignet, wenn | Zuständigkeit |
| --- | --- | --- |
| A · Desk mit neuer Zammad-Instanz | Ein neues Ticketsystem zusammen mit Desk bereitgestellt werden soll. | Das betreibende Team verwaltet beide Dienste, ihre E-Mail-Anbindung und die Sicherungen. |
| B · Desk mit bestehender Zammad-Instanz | Tickets, Gruppen und E-Mail-Kanäle bereits in Zammad eingerichtet sind. | Das Desk-Team betreibt Desk. Das Zammad-Team betreut Instanz, Ticketgruppe und Dienstkonto. |
| C · Desk ohne Zammad | Das Team Vorgänge per Link und Notiz dokumentiert oder ein anderes Kommunikationssystem nutzt. | Das Desk-Team betreibt Desk und PostgreSQL. |

## Voraussetzungen für alle Wege

1. Einen Desk-Stand festlegen und dessen Commit oder Release für spätere Updates dokumentieren. Für Desk eine eigene PostgreSQL-Datenbank bereitstellen. Die lokale Compose-Datei verwendet PostgreSQL 17. [Compose-Datei](../compose.yaml)
2. Desk mit dem [Dockerfile](../Dockerfile) oder aus dem Quellcheckout bauen. `DATABASE_URL` für die Desk-Datenbank und `DESK_ORIGIN` auf die tatsächlich verwendete HTTPS-Adresse setzen. `DESK_AUTH_SECRET` mit einem zufälligen Wert aus mindestens 32 Zeichen dauerhaft im Desk-Dienst hinterlegen. Zugangsdaten über die Laufzeitkonfiguration bereitstellen.
3. Vor dem Dienststart die Migration für den gewählten Installationsweg anwenden und das erste Admin-Konto mit der passenden CLI anlegen. Für Proben eine eigene Instanz verwenden. Wer die vorbereiteten Demodaten lädt, braucht eine Datenbank mit dem Suffix `_demo`. Für die Probe des eigenständigen Compose-Beispiels ein eigenes Compose-Projekt mit neuem Volume und freiem `DESK_PORT` verwenden und die Testdaten dort von Hand anlegen. [Lokaler Einstieg](../README.md) · [Betrieb](desk.md#betrieb) · [Admin-CLI](desk.md#update-auf-better-auth) · [Demo-Daten](entwicklung.md#befehle-und-screenshot-workflow)

## A · Neue Zammad-Instanz einbinden

Betreibe Desk und Zammad als getrennte Compose-Projekte. Zammad behält seine eigene Datenbank, seine Volumes und seine Sicherungen. Für Desk 0.1.0.0 wurde der offizielle Compose-Stand `v17.6.0` mit `ghcr.io/zammad/zammad:7.3.0-0001` geprüft. Dieser Zammad-Stack benötigt Docker Compose ab Version 2.23.1. Prüfe vor der Installation Zammads Ressourcenanforderungen und die Hinweise zum gewählten Stand. [Geprüfter Compose-Stand](https://github.com/zammad/zammad-docker-compose/tree/v17.6.0) · [Offizielle Docker-Installation von Zammad](https://docs.zammad.org/en/latest/install/docker-compose.html)

1. Den geprüften Compose-Stand abrufen. Die Zammad-Datenbankrolle und den PostgreSQL-Superuser über `POSTGRES_PASS` und `POSTGRES_SUPERUSER_PASS` in der Zammad-`.env` mit getrennten Passwörtern konfigurieren. Die Datei außerhalb der Versionsverwaltung halten. [Zammad-Umgebungsvariablen](https://github.com/zammad/zammad-docker-compose/blob/v17.6.0/.env.dist)
2. Eine HTTPS-Adresse mit einem für den Desk-Prozess vertrauenswürdigen Zertifikat bereitstellen. Läuft der Reverse Proxy direkt auf dem Docker-Host, kann er TLS terminieren und Anfragen an `http://127.0.0.1:8080` weiterleiten. Setze dafür `NGINX_EXPOSE_PORT=127.0.0.1:8080` und `NGINX_SERVER_SCHEME=https`. Der Proxy reicht den externen Host weiter. Für einen containerisierten Proxy das dazu passende Zammad-Szenario nutzen. `ZAMMAD_FQDN` und `ZAMMAD_HTTP_TYPE=https` an die externe Adresse anpassen. [Zammad-Compose-Szenarien](https://docs.zammad.org/en/latest/install/docker-compose/docker-compose-scenarios.html)
3. Zammad per `docker compose up -d` starten und eine Gruppe für Desk sowie ein Agentenkonto dafür einrichten. Für E-Mail-Antworten einen Mailkanal konfigurieren und in der Gruppe die passende Absenderadresse wählen. In einer Testumgebung ein isoliertes Postfach verwenden. [Zammad-Gruppeneinstellungen](https://admin-docs.zammad.org/en/latest/manage/groups/settings.html)
4. Desk mit eigener PostgreSQL-Datenbank starten und wie in Weg B anbinden. Ein vorbereitetes Ticket verknüpfen und den gelesenen Verlauf prüfen. In einem zweiten Musterprojekt ein Ticket anlegen und in Zammad Gruppe und interne Notiz abgleichen.

Vor einem Update die Desk-Datenbank und den Zammad-Stack getrennt sichern. Für eine Restore-Probe den Zammad-Datenbankdump und die Speicherdateien in eine separate Instanz einspielen. Vor dem Start der Prüfkopie den Zugriff auf die produktiven Mailkanäle sperren, da der Restore deren Einstellungen übernimmt. Für eine Zustellprobe einen lokalen Testkanal verwenden. Danach den Suchindex neu aufbauen. Danach die bisherigen Ticket-IDs, den Nachrichtenverlauf und einen Beispielanhang prüfen. [Zammad-Backup und Restore](https://docs.zammad.org/en/latest/appendix/backup-and-restore/docker-compose.html)

## B · Bestehende Zammad-Instanz anbinden

1. Mit dem Zammad-Team eine Testgruppe, ein vorhandenes Testticket und ein Agentenkonto mit Token und Berechtigung `ticket.agent` abstimmen. In der jeweiligen Gruppe braucht das Konto `read` für Ticket und Verlauf, `create` für die Anlage und `change` für Antworten. Lesezugriff zuerst prüfen. Anlage und Antworten anschließend testen, wenn sie benötigt werden. Für E-Mail-Antworten die Absenderadresse der Ticketgruppe prüfen. [Ticket-Berechtigungen](https://github.com/zammad/zammad/blob/stable/app/policies/ticket_policy.rb) · [Artikel-Berechtigungen](https://github.com/zammad/zammad/blob/stable/app/policies/ticket/article_policy.rb) · [Zammad-Gruppeneinstellungen](https://admin-docs.zammad.org/en/latest/manage/groups/settings.html)
2. In Zammad den Zugriff per API-Token aktivieren. In Desk für `ZAMMAD_URL` die vom Desk-Prozess erreichbare HTTPS-Basisadresse verwenden, etwa `https://zammad.example.test`. Desk erwartet die Basisadresse ohne Pfad, Abfrageparameter, Fragment oder Zugangsdaten. `ZAMMAD_TOKEN` enthält das Zugriffstoken des Agentenkontos. Mit `ZAMMAD_GROUP` die Zielgruppe für **neu angelegte** Tickets setzen. Bei vorhandenen Tickets gelten Rechte und Gruppe in Zammad. Anschließend Desk mit der neuen Konfiguration starten. [API-Zugriffstoken in Zammad](https://admin-docs.zammad.org/en/latest/system/api.html#token-access)
3. Im Musterprojekt unter **Kommunikation** das Testticket anhand seiner ID verknüpfen. Ticketnummer und Artikel mit dem Zammad-Verlauf vergleichen. Wenn E-Mail-Versand zum vorgesehenen Betrieb gehört, in der isolierten Umgebung eine Antwort an das Testpostfach schicken und Artikel, zugestellte Nachricht und Desk-Sendestatus prüfen. Bei unklarem Ergebnis zuerst den Sendeversuch und das Ticket prüfen. [Zammad in Desk](desk.md#zammad)

## C · Ohne Zammad betreiben

`ZAMMAD_URL` und `ZAMMAD_TOKEN` bleiben ungesetzt. Nach dem Start in **Kommunikation** einen Vorgangslink und eine kurze Notiz im Musterprojekt speichern. Nach dem Neuladen müssen beide Angaben sichtbar sein. Der Desk-Projektablauf einschließlich Planung und Lager läuft eigenständig. [Auftragsablauf in Desk](desk.md#ein-auftrag)

### Eigenständiger Start mit Docker Compose

Vorausgesetzt sind Docker Engine ab Version 28, das Compose-Plugin ab Version 2.20, eine Shell mit OpenSSL und ein Reverse Proxy auf dem Compose-Host oder im Docker-Netz. Das Beispiel verwendet PostgreSQL 17 und baut Desk mit der im Dockerfile festgelegten Bun-Version aus einem Git-Checkout oder einem entpackten Quellpaket. Desk verbindet sich im Compose-Netz mit PostgreSQL. PostgreSQL veröffentlicht keinen Hostport. [Docker-Portfreigaben](https://docs.docker.com/engine/network/port-publishing/) · [Compose für den Betrieb](../compose.selfhost.yaml) · [Dockerfile](../Dockerfile)

Kopiere die [Vorlage](../.env.selfhost.example) bei der Erstinstallation nach `.env.selfhost`. `umask 077` beschränkt den Zugriff auf die neu angelegte Datei. Erzeuge mit `openssl rand -hex 32` zwei unabhängige Werte und trage sie als `DESK_DB_PASSWORD` und `DESK_AUTH_SECRET` ein. Das Hex-Format lässt sich direkt in der Datenbank-URL verwenden. Bewahre das Auth-Secret für Neustarts und Updates auf.

```sh
umask 077
cp -i .env.selfhost.example .env.selfhost
openssl rand -hex 32
openssl rand -hex 32
```

Trage als `DESK_ORIGIN` die öffentliche HTTPS-Adresse ohne Pfad, Zugangsdaten, Query oder Fragment ein. Ein abschließender Schrägstrich ist zulässig. Für lokale Tests ist HTTP mit `localhost`, `127.0.0.1` oder `[::1]` möglich. Bei einer ungültigen Adresse bricht Desk den Dienststart mit einem Konfigurationshinweis ab. Der Proxy terminiert TLS und reicht den öffentlichen Host und das ursprüngliche HTTPS-Protokoll weiter. Die Adresse im Browser muss mit `DESK_ORIGIN` übereinstimmen.

Führe die Befehle in Bash im Ordner mit `compose.selfhost.yaml` aus. Läuft der Proxy auf dem Host, leite die öffentliche Adresse an `http://127.0.0.1:3000` oder den in `DESK_PORT` gewählten Port weiter und verwende diese Compose-Funktion. Läuft der Proxy als Container, definiere stattdessen die [Compose-Funktion für das Docker-Netz](#vorhandenen-reverse-proxy-im-docker-netz-anschließen).

```bash
desk_compose() {
  docker compose --env-file .env.selfhost -f compose.selfhost.yaml -p desk-selfhost "$@"
}
```

Führe die Erstinstallation in derselben Bash aus. Im Git-Checkout ermittelt der Block den Commit aus `HEAD`, falls `DESK_BUILD_COMMIT` leer oder ungesetzt ist. Bei einem Quellpaket prüfe zuerst die mitgelieferte Prüfsumme und entpacke das Archiv. Setze dann `DESK_BUILD_COMMIT` in der markierten Zeile innerhalb des Blocks auf die vollständige Commit-ID aus dem Archivnamen. Desk zeigt diesen Commit unter **Mein Konto → Desk-Version** an. [Quellpaket prüfen](release-abnahme.md#quellpaket-des-kandidaten)

Nach dem Datenbankstart wendet der erste einmalige Desk-Container die Migration an. Der zweite legt das erste Administrationskonto an. Ersetze die Beispieladresse und verwende ein eigenes starkes Passwort, das bei der Eingabe nicht angezeigt wird. Der Block bricht bei einem Fehler vor dem Dienststart ab. Die Passwortvariable des Administrationskontos endet mit der Subshell.

```bash
(
  set -e
  # Beim Quellpaket das Kommentarzeichen entfernen und die Commit-ID einsetzen.
  # DESK_BUILD_COMMIT=VOLLSTAENDIGE_COMMIT_ID_AUS_DEM_ARCHIVNAMEN
  build_commit="${DESK_BUILD_COMMIT:-$(git rev-parse --verify HEAD)}"
  DESK_BUILD_COMMIT="$build_commit" desk_compose build desk
  desk_compose up -d --wait db
  desk_compose run --rm desk bun scripts/migrate.ts
  read -rsp 'Passwort für das Desk-Administrationskonto: ' DESK_ADMIN_PASSWORD
  printf '\n'
  export DESK_ADMIN_PASSWORD
  desk_compose run --rm -e DESK_ADMIN_PASSWORD desk bun scripts/admin.ts admin@example.test 'Desk Administration'
  unset DESK_ADMIN_PASSWORD
  desk_compose up -d --wait --wait-timeout 60 desk
)
```

Nach dem Start der Container wartet Compose bis zu 60 Sekunden auf die Bereitschaft von Desk. Wenn PostgreSQL erst starten muss, kommt dessen Startzeit hinzu. Die Prüfung im Desk-Container ruft `/api/v1/ready` auf und setzt eine erreichbare Datenbank mit allen erwarteten Migrationen voraus. [Desk-Bereitschaft](desk.md#betrieb)

Bei einem Startfehler zeigt `desk_compose ps -a` auch beendete und noch nicht gestartete Container. Die Dienstmeldungen zeigt `desk_compose logs desk db`. Definiere in einer neuen Bash die Funktion für deinen Proxy-Weg erneut.

Melde dich danach über die HTTPS-Adresse an. Unter **Einstellungen → Integrationen** stehen **Haben optional** und **Zammad optional**. Für einen späteren Start desselben Versionsstands genügt der letzte Startbefehl. Verwende denselben Compose-Projektnamen, dieselbe Konfiguration und dasselbe Datenbankvolume. Das Volume enthält Konten und Projekte. Beim Wechsel des Desk-Stands Datenbank und Konfiguration sichern, den bisherigen Desk-Dienst anhalten, die Migration mit dem neuen Image ausführen und den Dienst aktualisieren. [Betrieb und Versionswechsel](desk.md#betrieb)

### Vorhandenen Reverse Proxy im Docker-Netz anschließen

Wenn der Reverse Proxy ebenfalls als Container läuft, kann Desk dasselbe externe Docker-Netz nutzen. Verwende dazu das [Compose-Override](../compose.selfhost.proxy.yaml) mit Docker Compose ab Version 2.24.4. Es entfernt die Host-Portfreigabe und verbindet nur den Desk-Dienst mit dem Proxy-Netz. PostgreSQL bleibt im eigenen Compose-Netz. [Compose-Netze](https://docs.docker.com/compose/how-tos/networking/) · [Compose-Override](https://docs.docker.com/reference/compose-file/merge/#replace-value)

Setze in `.env.selfhost` die öffentliche HTTPS-Adresse wie zuvor. Trage für `DESK_PROXY_NETWORK` den Namen des vorhandenen Docker-Netzes des Proxys ein. Verwende als `DESK_PROXY_ALIAS` pro Desk-Instanz einen eigenen Namen in diesem Netz, zum Beispiel `desk-selfhost`. Der Proxy leitet an `http://desk-selfhost:3000` oder an den gewählten Alias auf Port 3000 weiter.

Definiere diese Variante von `desk_compose` im Ordner mit beiden Compose-Dateien. Führe danach den gemeinsamen Installationsblock aus. Verwende die Funktion auch für spätere Starts und bei Updates. Behalte bei einem Wechsel des Proxy-Wegs den Compose-Projektnamen bei, damit Desk dasselbe Datenbankvolume verwendet.

```bash
desk_compose() {
  docker compose --env-file .env.selfhost \
    -f compose.selfhost.yaml -f compose.selfhost.proxy.yaml -p desk-selfhost "$@"
}

desk_compose config --quiet
```

Der Proxy terminiert TLS und reicht den öffentlichen Host und das HTTPS-Protokoll weiter. In NGINX in einem vorhandenen HTTPS-Serverblock kannst du die Weiterleitung so einrichten:

```nginx
location / {
    client_max_body_size 8m;
    resolver 127.0.0.11 valid=30s;
    set $desk_upstream desk-selfhost:3000;
    proxy_pass http://$desk_upstream;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Der NGINX-Container nutzt Docker-DNS zur Auflösung des Desk-Alias. Die Größenbegrenzung von 8 MiB lässt die von Desk unterstützten PDF-Anhänge für Zammad einschließlich JSON-Kodierung durch. Melde dich über die öffentliche HTTPS-Adresse an und öffne die Projektliste. `desk_compose ps` darf für Desk und PostgreSQL nur Containerports anzeigen. [NGINX-Weiterleitung](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass) · [NGINX-Größenbegrenzung](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size)

## Updates und Rückkehr zum letzten funktionierenden Stand

| Weg | Vor dem Update | Rückkehr bei Problemen |
| --- | --- | --- |
| A | Desk-Datenbank und Zammad getrennt sichern, Konfigurationen und beide Versionen festhalten. Änderungen zuerst in einer Kopie prüfen und die Hinweise zum gewählten Zammad-Release lesen. | Für den betroffenen Dienst den vorherigen Anwendungsstand und die dazu passende Sicherung in einer getrennten Umgebung wiederherstellen. Bei gemeinsamem Datenstand zusätzlich Ticketverknüpfungen und noch offene Sendeversuche abgleichen. |
| B | Desk-Datenbank und Laufzeitkonfiguration sichern. Die Wiederherstellung in einer getrennten Instanz proben, dort das Desk-Update mit Migration anwenden und das Testticket prüfen. Änderungen an Zammad mit dessen Betriebsteam abstimmen. | Bei einem fehlgeschlagenen Desk-Upgrade mit Migration den vorherigen Desk-Anwendungsstand mit der passenden Vorab-Sicherung und Konfiguration in einer getrennten Umgebung wiederherstellen. Bei einer reinen Fehlkonfiguration der Anbindung die vorherigen Einstellungen zurückspielen oder die Verbindung vorübergehend deaktivieren. Eine Wiederherstellung von Zammad führt sein Betriebsteam durch. |
| C | Desk-Datenbank sichern und Migration in einer Wiederherstellung testen. | Den vorherigen Desk-Stand mit passender Konfiguration und Vorab-Sicherung wiederherstellen und den Ablauf mit Vorgangslink und Notiz prüfen. |

Bei einem Wechsel auf eine andere Zammad-Instanz die gespeicherten Ticket-IDs vor erneuter Nutzung prüfen. Dieselbe ID kann dort zu einem anderen Ticket gehören. Vor der Rückkehr nach einer Datenwiederherstellung klären, welche Vorgänge seit der Sicherung hinzugekommen sind und welche Nachrichten Zammad bereits übernommen hat. [Zammad aktualisieren](https://docs.zammad.org/en/latest/install/update.html) · [Zammad sichern und wiederherstellen](https://docs.zammad.org/en/latest/appendix/backup-and-restore/docker-compose.html)

Vor der Freigabe einer wiederhergestellten Desk-Datenbank alle vorhandenen Desk-Sitzungstabellen gemäß der Betriebsdoku leeren. Das Team meldet sich danach neu an. [Sitzungen nach der Wiederherstellung](desk.md#update-auf-better-auth)

## Abnahme und Folgearbeiten

- **A.** Installation, Ticketanlage, Verknüpfung und PDF-Zustellung an ein lokales SMTP-Testpostfach wurden mit dem geprüften Compose-Stand abgenommen. Nach dem Restore in einer getrennten Zammad-Instanz konnte Desk beide Ticketverläufe erneut lesen. Die Prüfsumme des Zammad-Anhangs stimmte mit dem versendeten PDF überein. [Abnahmeprotokoll](https://github.com/Vemoro/desk/issues/204)
- **B.** Auf der vorgesehenen Testinstanz wurden Ticketanlage, Verknüpfung und Verlauf geprüft. Der bestätigte PDF-Empfang in einem separaten Postfach über deren eingerichteten Mailkanal steht aus. [Abnahmeprotokoll](https://github.com/Vemoro/desk/issues/204)
- **C.** Aufbau mit leerer PostgreSQL-Datenbank, Anmeldung und deaktivierte Integrationen wurden geprüft. Vorgangslink und Kommunikationsnotiz blieben nach einem Neustart von Desk und PostgreSQL erhalten. [Abnahmeprotokoll](https://github.com/Vemoro/desk/issues/204)
