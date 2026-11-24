# Desk verwenden und betreiben

## Ein Auftrag

1. Einen Kontakt und ein Projekt anlegen. Aufgaben im Kanban verteilen und den Projektstatus auf Planung setzen.
2. Personal und Inventar vormerken. Geplante Einkaufskosten und Verkaufspositionen erfassen. Die Verkaufspositionen können als CSV exportiert werden.
3. Eine Angebotsreferenz ergänzen. Bei eingerichteter Haben-Verbindung die ID des vorhandenen Angebots eintragen und abgleichen. Desk zeigt den Status des Angebots an und kann die Bestätigung übernehmen. Ohne Haben wird der Projektstatus von Hand gesetzt.
4. Nach der Bestätigung Ressourcen fest reservieren. Zeitliche Überschneidungen bei Personal und Geräten sowie Mengenüberschreitungen werden abgelehnt. Eine Freigabe entfernt die Reservierung. Bereits ausgegebene Geräte bleiben bis zur Rückgabe sichtbar.
5. Im Projektlager Wareneingang erfassen. Bei einer festen Reservierung kann das Team Geräte ausgeben und später zurücknehmen oder Verbrauchsmaterial ausbuchen. Die Bestandsübersicht zeigt beim Gerät die aktuell geltenden festen Vormerkungen. Die Ressourcenplanung berücksichtigt bei neuen Reservierungen das gewählte Zeitfenster. Unter **Offene Ausgaben** kannst du nach Projekt und Lagerort filtern. Nach einer Teilrückgabe steht dort die verbleibende Menge. Die Tabelle **Lagerbewegungen** zeigt den Lagerort jeder Buchung.
6. Ist-Kosten importieren oder per Belegreferenz zuordnen. Im Controlling stehen Netto-Plan- und Ist-Kosten nebeneinander. Die in Haben oder einem anderen System erstellte Rechnung im Projekt referenzieren, dann den Projektstatus auf Abgerechnet setzen.

Unter **Lagerbewegungen** lassen sich Bewegungsart und Projekt gemeinsam filtern. **Ohne Projektbezug** findet zum Beispiel Wareneingänge ohne Zuordnung.

## Haben

`HABEN_URL` und `HABEN_TOKEN` auf dem Desk-Server setzen. Angebote benötigen Leserechte für Angebote. Ein Kontaktabgleich benötigt passend zum gewählten Vorgang Lese- oder Schreibrechte für Kontakte. Gemeinsam gepflegt werden Name, E-Mail und Telefon. Der Import legt neue Kontakte an, deren Namen und E-Mail-Adresse keinem unverknüpften Desk-Kontakt entsprechen. Bestehende Verknüpfungen werden einzeln abgeglichen. Bei abweichenden Änderungen auf beiden Seiten bleibt die Wahl beim Team.

Desk legt Angebote in der ersten Version über die manuelle Übergabe an Haben an. Der Abgleich verwendet die unterstützte Lese-API. Bei Belegkosten unterstützt Desk die Einzelzuordnung oder einen vorbereiteten CSV-Export. Pro Zeile sind `reference`, `name` und der Nettobetrag in `amount` erforderlich. `cost_center` ist optional. Verwende eine stabile Referenz je Belegzeile. Der Import erkennt die Kombination aus Quelle und Referenz wieder und zeigt fehlende Projektzuordnungen unter Ist-Kosten.

## Zammad

`ZAMMAD_URL`, `ZAMMAD_TOKEN` und die Ticketgruppe `ZAMMAD_GROUP` setzen. Der Zammad-Zugang benötigt für die Gruppe die passenden Agentenrechte. Desk verwendet das Ticket für den Nachrichtenverlauf und die Übergabe ausgehender Antworten. Der Versand bleibt in Zammad nachvollziehbar. PDF-Anhänge sind bis 5 MB möglich. Wenn das Ergebnis einer Sendung unklar ist, zuerst den gespeicherten Sendeversuch prüfen. Eine erneute Sendung ist eine ausdrückliche Aktion und sucht zuvor nach der Desk-Referenz im Ticket. Ohne Zammad sind Kommunikationslink und Notiz im Projekt verfügbar.

## Betrieb

- Für die Produktion `bun run build` ausführen, die Migrationen mit `bun run migrate` anwenden und `bun run start` starten. Alternativ mit dem Dockerfile bauen und den Container neben einer bereitgestellten PostgreSQL-Instanz betreiben.
- `DESK_ORIGIN` auf die externe HTTPS-Adresse setzen. Den Dienst hinter einem HTTPS-Reverse-Proxy betreiben. Für eine Demo eine separate Datenbank mit dem Suffix `_demo` verwenden.
- Teamkonten und widerrufbare API-Tokens stehen in den Einstellungen. Der API-Vertrag ist unter `/api/v1/openapi.json` verfügbar. Schreibende Tickets, Kontakte und andere Vorgänge laufen über die jeweils eingerichteten Serverzugänge.
- PostgreSQL sichern. Vor einem Update die Wiederherstellung in einer getrennten Instanz prüfen. Für Desktop und Smartphone dieselbe HTTPS-Adresse verwenden.

## Ansichten

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="screenshots/controlling-dunkel.png">
  <img src="screenshots/controlling-hell.png" alt="Controlling mit geplanten Einkaufskosten, Ist-Kosten und der Abweichung">
</picture>

[Projektlager auf dem Smartphone, hell](screenshots/projektlager-hell-handy.png) · [Projektlager auf dem Smartphone, dunkel](screenshots/projektlager-dunkel-handy.png)
