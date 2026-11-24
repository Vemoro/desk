# Desk installieren

Desk kann eigenständig arbeiten oder ein Zammad-System für Tickets und Nachrichten nutzen. Dieser Plan beschreibt drei Installationswege und die Abnahme vor der Freigabe für den Betrieb.

| Weg | Geeignet, wenn | Zuständigkeit |
| --- | --- | --- |
| A · Desk mit neuer Zammad-Instanz | Ein neues Ticketsystem zusammen mit Desk bereitgestellt werden soll. | Das betreibende Team verwaltet beide Dienste, ihre E-Mail-Anbindung und die Sicherungen. |
| B · Desk mit bestehender Zammad-Instanz | Tickets, Gruppen und E-Mail-Kanäle bereits in Zammad eingerichtet sind. | Das Desk-Team betreibt Desk. Das Zammad-Team betreut Instanz, Ticketgruppe und Dienstkonto. |
| C · Desk ohne Zammad | Das Team Vorgänge per Link und Notiz dokumentiert oder ein anderes Kommunikationssystem nutzt. | Das Desk-Team betreibt Desk und PostgreSQL. |

## Voraussetzungen für alle Wege

1. Einen Desk-Stand festlegen und dessen Commit oder Release für spätere Updates dokumentieren. Für Desk eine eigene PostgreSQL-Datenbank bereitstellen. Die lokale Compose-Datei verwendet PostgreSQL 17. [Compose-Datei](../compose.yaml)
2. Desk mit dem [Dockerfile](../Dockerfile) bauen oder den Build und Start auf dem Server ausführen. `DATABASE_URL` für die Desk-Datenbank und `DESK_ORIGIN` auf die tatsächlich verwendete HTTPS-Adresse setzen. Zugangsdaten über die Laufzeitkonfiguration bereitstellen.
3. Vor dem Dienststart die Migration anwenden und das erste Admin-Konto anlegen. Für eine Probeinstallation eine eigene Instanz und eine Demo-Datenbank mit dem Suffix `_demo` verwenden. [Lokaler Einstieg](../README.md) · [Betrieb](desk.md#betrieb) · [Demo-Daten](entwicklung.md#befehle-und-screenshot-workflow)

## A · Neue Zammad-Instanz einbinden

Für diesen Weg ist ein separat aktualisierbarer Zammad-Compose-Stack als optionale Abhängigkeit vorgesehen. Eine gemeinsame Installationsanleitung kann beide Dienste einrichten. Zammad behält seine eigene Datenbank, Daten-Volumes und Sicherungen. Die Desk-Compose-Datei enthält derzeit die lokale PostgreSQL-Datenbank. [Offizielle Docker-Installation von Zammad](https://docs.zammad.org/en/latest/install/docker-compose.html)

1. Einen konkreten Stand des offiziellen Compose-Stacks und der Zammad-Images auswählen. Die Ressourcen anhand der Zammad-Vorgaben prüfen und eine eigene HTTPS-Basisadresse mit vertrauenswürdigem Zertifikat vorsehen. Für den Reverse Proxy das unterstützte HTTPS-Szenario des Stacks wählen. [Zammad-Compose-Szenarien](https://docs.zammad.org/en/latest/install/docker-compose/docker-compose-scenarios.html)
2. In Zammad eine Gruppe für Desk und einen eigenen Agentenzugang dafür einrichten. Das Team konfiguriert in Zammad auch den E-Mail-Kanal, sofern es Antworten per E-Mail versenden will. Den Kanal in der Testumgebung an ein isoliertes Testpostfach anbinden.
3. Desk wie in Weg B konfigurieren und dessen Test mit einem vorbereiteten Ticket durchführen. Zusätzlich aus Desk ein zweites Testticket anlegen und prüfen, ob es in der richtigen Gruppe mit der erwarteten internen Notiz erscheint.

## B · Bestehende Zammad-Instanz anbinden

1. Mit dem Zammad-Team eine Testgruppe, ein vorhandenes Testticket und ein Dienstkonto abstimmen. Der Agentenzugang des Kontos braucht die für die vorgesehenen Aktionen notwendigen Rechte in der jeweiligen Ticketgruppe. Lesezugriff für vorhandene Tickets und Verlauf zuerst prüfen. Ticketanlage und Antworten anschließend getrennt prüfen, wenn sie benötigt werden. [Zammad-Tickets](https://docs.zammad.org/en/latest/api/ticket/) · [Zammad-Nachrichten](https://docs.zammad.org/en/latest/api/ticket/articles.html)
2. In Desk `ZAMMAD_URL` auf die HTTPS-Basisadresse ohne API-Pfad setzen. Die Adresse muss vom Desk-Prozess erreichbar sein. `ZAMMAD_TOKEN` enthält das Zugriffstoken des Agentenkontos. Mit `ZAMMAD_GROUP` die Zielgruppe für **neu angelegte** Tickets setzen. Bei vorhandenen Tickets gelten Rechte und Gruppe in Zammad. Anschließend Desk mit der neuen Konfiguration starten. [Token-Authentifizierung in Zammad](https://docs.zammad.org/en/latest/api/intro.html)
3. Im Musterprojekt unter **Kommunikation** das Testticket anhand seiner ID verknüpfen. Ticketnummer und Artikel mit dem Zammad-Verlauf vergleichen. Wenn E-Mail-Versand zum vorgesehenen Betrieb gehört, in der isolierten Umgebung eine Antwort an das Testpostfach schicken und Artikel, zugestellte Nachricht und Desk-Sendestatus prüfen. Bei unklarem Ergebnis zuerst den Sendeversuch und das Ticket prüfen. [Zammad in Desk](desk.md#zammad)

## C · Ohne Zammad betreiben

`ZAMMAD_URL` und `ZAMMAD_TOKEN` bleiben ungesetzt. Nach dem Start in **Kommunikation** einen Vorgangslink und eine kurze Notiz im Musterprojekt speichern. Nach dem Neuladen müssen beide Angaben sichtbar sein. Der Desk-Projektablauf einschließlich Planung und Lager läuft eigenständig. [Auftragsablauf in Desk](desk.md#ein-auftrag)

### Eigenständiger Start mit Docker Compose

Vorausgesetzt sind Docker Engine ab Version 28, das Compose-Plugin ab Version 2.20, eine Shell mit OpenSSL und ein Reverse Proxy auf dem Compose-Host. Das Beispiel verwendet PostgreSQL 17 und baut Desk mit der im Dockerfile festgelegten Bun-Version aus dem ausgecheckten Stand. PostgreSQL ist nur im Compose-Netz erreichbar. [Docker-Portfreigaben](https://docs.docker.com/engine/network/port-publishing/) · [Compose für den Betrieb](../compose.selfhost.yaml) · [Dockerfile](../Dockerfile)

Kopiere die [Vorlage](../.env.selfhost.example) bei der Erstinstallation nach `.env.selfhost`. `umask 077` beschränkt den Zugriff auf die neu angelegte Datei. Übernimm ein mit `openssl rand -hex 32` erzeugtes Datenbankpasswort in `DESK_DB_PASSWORD`. Das Hex-Format lässt sich direkt in der Datenbank-URL verwenden.

```sh
umask 077
cp -i .env.selfhost.example .env.selfhost
openssl rand -hex 32
```

Trage als `DESK_ORIGIN` die öffentliche HTTPS-Adresse ohne Pfad ein. Leite im Reverse Proxy diese Adresse per HTTP an `127.0.0.1:3000` weiter oder verwende den in `DESK_PORT` gewählten Port. Der Proxy terminiert TLS und reicht den öffentlichen Host und das ursprüngliche HTTPS-Protokoll weiter. Die Adresse im Browser muss mit `DESK_ORIGIN` übereinstimmen.

Führe die folgenden Befehle im Repository in einer Bash aus. Nach dem Datenbankstart wendet der erste einmalige Desk-Container die Migration an. Der zweite legt das erste Administrationskonto an. Ersetze die Beispieladresse und verwende ein eigenes starkes Passwort, das bei der Eingabe nicht angezeigt wird. Der Block bricht bei einem Fehler vor dem Dienststart ab. Die Passwortvariable des Administrationskontos endet mit der Subshell.

```bash
(
  set -e
  docker compose --env-file .env.selfhost -f compose.selfhost.yaml -p desk-selfhost build desk
  docker compose --env-file .env.selfhost -f compose.selfhost.yaml -p desk-selfhost up -d --wait db
  docker compose --env-file .env.selfhost -f compose.selfhost.yaml -p desk-selfhost run --rm desk bun scripts/migrate.ts
  read -rsp 'Passwort für das Desk-Administrationskonto: ' DESK_ADMIN_PASSWORD
  printf '\n'
  export DESK_ADMIN_PASSWORD
  docker compose --env-file .env.selfhost -f compose.selfhost.yaml -p desk-selfhost run --rm -e DESK_ADMIN_PASSWORD desk bun scripts/admin.ts admin@example.test 'Desk Administration'
  unset DESK_ADMIN_PASSWORD
  docker compose --env-file .env.selfhost -f compose.selfhost.yaml -p desk-selfhost up -d --wait --wait-timeout 60 desk
)
```

Der Startbefehl wartet bis zu 60 Sekunden auf die Bereitschaft von Desk. Die Prüfung im Container ruft `/api/v1/ready` auf. Sie verlangt eine erreichbare Desk-Datenbank mit den vom Build erwarteten Migrationen. Wenn der Startbefehl fehlschlägt, zeigen `docker compose --env-file .env.selfhost -f compose.selfhost.yaml -p desk-selfhost ps` und die Dienstlogs den Betriebszustand. [Desk-Bereitschaft](desk.md#betrieb)

Melde dich danach über die HTTPS-Adresse an. **Einstellungen** zeigt Haben und Zammad als nicht eingerichtet. Für einen späteren Start desselben Versionsstands genügt derselbe letzte Startbefehl. Verwende dafür denselben Compose-Projektnamen und dasselbe Datenbankvolume. Das Volume enthält Konten und Projekte und muss bei Unterbrechungen erhalten bleiben. Beim Wechsel des Desk-Stands Datenbank und Konfiguration zuerst sichern, die Migration mit dem neuen Image ausführen und dann den Dienst aktualisieren.

## Updates und Rückkehr zum letzten funktionierenden Stand

| Weg | Vor dem Update | Rückkehr bei Problemen |
| --- | --- | --- |
| A | Desk-Datenbank und Zammad getrennt sichern, Konfigurationen und beide Versionen festhalten. Änderungen zuerst in einer Kopie prüfen und die Hinweise zum gewählten Zammad-Release lesen. | Für den betroffenen Dienst den vorherigen Anwendungsstand und die dazu passende Sicherung in einer getrennten Umgebung wiederherstellen. Bei gemeinsamem Datenstand zusätzlich Ticketverknüpfungen und noch offene Sendeversuche abgleichen. |
| B | Desk-Datenbank und Laufzeitkonfiguration sichern. Die Wiederherstellung in einer getrennten Instanz proben, dort das Desk-Update mit Migration anwenden und das Testticket prüfen. Änderungen an Zammad mit dessen Betriebsteam abstimmen. | Bei einem fehlgeschlagenen Desk-Upgrade mit Migration den vorherigen Desk-Anwendungsstand mit der passenden Vorab-Sicherung und Konfiguration in einer getrennten Umgebung wiederherstellen. Bei einer reinen Fehlkonfiguration der Anbindung die vorherigen Einstellungen zurückspielen oder die Verbindung vorübergehend deaktivieren. Eine Wiederherstellung von Zammad führt sein Betriebsteam durch. |
| C | Desk-Datenbank sichern und Migration in einer Wiederherstellung testen. | Den vorherigen Desk-Stand mit passender Konfiguration und Vorab-Sicherung wiederherstellen und den Ablauf mit Vorgangslink und Notiz prüfen. |

Bei einem Wechsel auf eine andere Zammad-Instanz die gespeicherten Ticket-IDs vor erneuter Nutzung prüfen. Gleiche Nummern können dort andere Tickets bezeichnen. Vor der Rückkehr nach einer Datenwiederherstellung klären, welche Vorgänge seit der Sicherung hinzugekommen sind und welche Nachrichten Zammad bereits übernommen hat. [Zammad aktualisieren](https://docs.zammad.org/en/latest/install/update.html) · [Zammad sichern und wiederherstellen](https://docs.zammad.org/en/latest/appendix/backup-and-restore/docker-compose.html)

## Abnahme und Folgearbeiten

- **A:** In einer isolierten Umgebung den gewählten Zammad-Stack, dessen Wiederherstellung und die vollständige Ticketprobe abnehmen. Erst danach festlegen, welche Version und welcher Aufbau unterstützt werden. Daraus folgen Aufgaben für eine optionale Installationsvorlage und ihren Updatepfad.
- **B:** Die Verknüpfung und der Abruf eines vorhandenen Tickets sind gegen ein simuliertes API-Gegenüber geprüft. Die Abnahme an einem tatsächlich bereitgestellten Zammad benötigt eine Testgruppe und ein Testpostfach sowie abgestimmte Rechte. Daraus folgen eine Kompatibilitätsprüfung und eine dokumentierte Konfiguration.
- **C:** Anmeldung, deaktivierte Integrationen sowie Vorgangslink und Kommunikationsnotiz bei einer eigenständigen Installation und nach dem Neustart prüfen.
