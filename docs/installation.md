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
3. Vor dem Dienststart die Migration für den gewählten Installationsweg anwenden und das erste Admin-Konto mit der passenden CLI anlegen. Für eine Probeinstallation eine eigene Instanz und eine Demo-Datenbank mit dem Suffix `_demo` verwenden. [Lokaler Einstieg](../README.md) · [Betrieb](desk.md#betrieb) · [Admin-CLI](desk.md#update-auf-better-auth) · [Demo-Daten](entwicklung.md#befehle-und-screenshot-workflow)

## A · Neue Zammad-Instanz einbinden

Für diesen Weg ist ein separat aktualisierbarer Zammad-Compose-Stack als optionale Abhängigkeit vorgesehen. Eine gemeinsame Installationsanleitung kann beide Dienste einrichten. Zammad behält seine eigene Datenbank, Daten-Volumes und Sicherungen. Die Desk-Compose-Datei enthält derzeit die lokale PostgreSQL-Datenbank. [Offizielle Docker-Installation von Zammad](https://docs.zammad.org/en/latest/install/docker-compose.html)

1. Einen konkreten Stand des offiziellen Compose-Stacks und der Zammad-Images auswählen. Die Ressourcen anhand der Zammad-Vorgaben prüfen und eine eigene HTTPS-Basisadresse mit vertrauenswürdigem Zertifikat vorsehen. Für den Reverse Proxy das unterstützte HTTPS-Szenario des Stacks wählen. [Zammad-Compose-Szenarien](https://docs.zammad.org/en/latest/install/docker-compose/docker-compose-scenarios.html)
2. In Zammad eine Gruppe für Desk und einen eigenen Agentenzugang dafür einrichten. Für Antworten per E-Mail den Kanal einrichten und in der Ticketgruppe die passende Absenderadresse wählen. In der Testumgebung ein isoliertes Postfach verwenden. [Zammad-Gruppeneinstellungen](https://admin-docs.zammad.org/en/latest/manage/groups/settings.html)
3. Desk wie in Weg B konfigurieren und dessen Test mit einem vorbereiteten Ticket durchführen. In einem zweiten Musterprojekt ohne Ticketverknüpfung aus Desk ein neues Testticket anlegen. Prüfen, ob es in der richtigen Gruppe mit der erwarteten internen Notiz erscheint.

## B · Bestehende Zammad-Instanz anbinden

1. Mit dem Zammad-Team eine Testgruppe, ein vorhandenes Testticket und ein Agentenkonto mit Token und Berechtigung `ticket.agent` abstimmen. In der jeweiligen Gruppe braucht das Konto `read` für Ticket und Verlauf, `create` für die Anlage und `change` für Antworten. Lesezugriff zuerst prüfen. Anlage und Antworten anschließend testen, wenn sie benötigt werden. Für E-Mail-Antworten die Absenderadresse der Ticketgruppe prüfen. [Ticket-Berechtigungen](https://github.com/zammad/zammad/blob/stable/app/policies/ticket_policy.rb) · [Artikel-Berechtigungen](https://github.com/zammad/zammad/blob/stable/app/policies/ticket/article_policy.rb) · [Zammad-Gruppeneinstellungen](https://admin-docs.zammad.org/en/latest/manage/groups/settings.html)
2. In Zammad den Zugriff per API-Token aktivieren. In Desk für `ZAMMAD_URL` die vom Desk-Prozess erreichbare HTTPS-Basisadresse verwenden, etwa `https://zammad.example.test`. Desk erwartet die Basisadresse ohne Pfad, Abfrageparameter, Fragment oder Zugangsdaten. `ZAMMAD_TOKEN` enthält das Zugriffstoken des Agentenkontos. Mit `ZAMMAD_GROUP` die Zielgruppe für **neu angelegte** Tickets setzen. Bei vorhandenen Tickets gelten Rechte und Gruppe in Zammad. Anschließend Desk mit der neuen Konfiguration starten. [API-Zugriffstoken in Zammad](https://admin-docs.zammad.org/en/latest/system/api.html#token-access)
3. Im Musterprojekt unter **Kommunikation** das Testticket anhand seiner ID verknüpfen. Ticketnummer und Artikel mit dem Zammad-Verlauf vergleichen. Wenn E-Mail-Versand zum vorgesehenen Betrieb gehört, in der isolierten Umgebung eine Antwort an das Testpostfach schicken und Artikel, zugestellte Nachricht und Desk-Sendestatus prüfen. Bei unklarem Ergebnis zuerst den Sendeversuch und das Ticket prüfen. [Zammad in Desk](desk.md#zammad)

## C · Ohne Zammad betreiben

`ZAMMAD_URL` und `ZAMMAD_TOKEN` bleiben ungesetzt. Nach dem Start in **Kommunikation** einen Vorgangslink und eine kurze Notiz im Musterprojekt speichern. Nach dem Neuladen müssen beide Angaben sichtbar sein. Der Desk-Projektablauf einschließlich Planung und Lager läuft eigenständig. [Auftragsablauf in Desk](desk.md#ein-auftrag)

## Updates und Rückkehr zum letzten funktionierenden Stand

| Weg | Vor dem Update | Rückkehr bei Problemen |
| --- | --- | --- |
| A | Desk-Datenbank und Zammad getrennt sichern, Konfigurationen und beide Versionen festhalten. Änderungen zuerst in einer Kopie prüfen und die Hinweise zum gewählten Zammad-Release lesen. | Für den betroffenen Dienst den vorherigen Anwendungsstand und die dazu passende Sicherung in einer getrennten Umgebung wiederherstellen. Bei gemeinsamem Datenstand zusätzlich Ticketverknüpfungen und noch offene Sendeversuche abgleichen. |
| B | Desk-Datenbank und Laufzeitkonfiguration sichern. Die Wiederherstellung in einer getrennten Instanz proben, dort das Desk-Update mit Migration anwenden und das Testticket prüfen. Änderungen an Zammad mit dessen Betriebsteam abstimmen. | Bei einem fehlgeschlagenen Desk-Upgrade mit Migration den vorherigen Desk-Anwendungsstand mit der passenden Vorab-Sicherung und Konfiguration in einer getrennten Umgebung wiederherstellen. Bei einer reinen Fehlkonfiguration der Anbindung die vorherigen Einstellungen zurückspielen oder die Verbindung vorübergehend deaktivieren. Eine Wiederherstellung von Zammad führt sein Betriebsteam durch. |
| C | Desk-Datenbank sichern und Migration in einer Wiederherstellung testen. | Den vorherigen Desk-Stand mit passender Konfiguration und Vorab-Sicherung wiederherstellen und den Ablauf mit Vorgangslink und Notiz prüfen. |

Bei einem Wechsel auf eine andere Zammad-Instanz die gespeicherten Ticket-IDs vor erneuter Nutzung prüfen. Dieselbe ID kann dort zu einem anderen Ticket gehören. Vor der Rückkehr nach einer Datenwiederherstellung klären, welche Vorgänge seit der Sicherung hinzugekommen sind und welche Nachrichten Zammad bereits übernommen hat. [Zammad aktualisieren](https://docs.zammad.org/en/latest/install/update.html) · [Zammad sichern und wiederherstellen](https://docs.zammad.org/en/latest/appendix/backup-and-restore/docker-compose.html)

Vor der Freigabe einer wiederhergestellten Desk-Datenbank alle vorhandenen Desk-Sitzungstabellen gemäß der Betriebsdoku leeren. Das Team meldet sich danach neu an. [Sitzungen nach der Wiederherstellung](desk.md#update-auf-better-auth)

## Abnahme und Folgearbeiten

- **A.** Die lokale API-Simulation bestätigte die Ticketanlage mit Testgruppe und interner Notiz. In einer isolierten Umgebung den gewählten Zammad-Stack, dessen Wiederherstellung und die vollständige Ticketprobe abnehmen. Danach die unterstützte Version, den Aufbau und den Updatepfad der optionalen Installation festlegen.
- **B.** Die Verknüpfung und der Abruf eines vorhandenen Tickets samt Artikel wurden lokal simuliert. Die Abnahme an der vorgesehenen Zammad-Version benötigt eine Testgruppe und ein Testpostfach sowie abgestimmte Rechte. Die echte Zustellung bleibt Teil der [Release-Abnahme](release-abnahme.md).
- **C.** Vorgangslink und Kommunikationsnotiz blieben in einer isolierten Desk-Demo nach dem Speichern und Neuladen erhalten. Die eigene Compose-Installation für diesen Weg wird separat umgesetzt. [Issue #200](https://github.com/Vemoro/desk/issues/200)
