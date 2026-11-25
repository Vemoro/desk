# Kontaktabgleich zwischen Desk und Haben

Der erste Desk-Kern kann aktive Kontakte aus Haben importieren und einzelne verknüpfte Kontakte in beide Richtungen abgleichen. Jeder Import und jeder Abgleich wird in Desk bewusst ausgelöst. Desk läuft auch mit eigenen, unverknüpften Kontakten. Hintergrundabgleich, automatische Dublettenbereinigung und die Übernahme von Löschungen oder Archivierungen sind spätere Erweiterungen.

## Schnittstelle und Rechte

Die vorgesehene Instanz lieferte am 25. November 2026 unter `/api/v1/openapi.json` Haben REST-API `1.0.0` aus. Der Abruf der Beschreibung gelang ohne Token. Eine Anfrage an die Kontaktliste ohne Token lieferte HTTP 401. Die API-Version bezeichnet die Schnittstelle. Die Anwendungsversion und die Rechte eines konkreten Tokens sind damit nicht festgestellt. Lese- und Schreibfälle wurden mit einem simulierten Haben-Dienst geprüft. Die Abnahme mit Testkontakten an der vorgesehenen Haben-Instanz wird über Issue #204 geführt. [OpenAPI der vorgesehenen Instanz](https://haben.app/api.html) · [Issue #204](https://github.com/Vemoro/desk/issues/204)

| Aufgabe in Desk | Haben-Route unter `/api/v1` | Recht |
| --- | --- | --- |
| Aktive Kontakte importieren | `GET /kontakte` | `kontakte:lesen` |
| Einen verknüpften Kontakt lesen oder seine Daten übernehmen | `GET /kontakte/{id}` | `kontakte:lesen` |
| Neuen Haben-Kontakt aus Desk anlegen | `POST /kontakte` | `kontakte:schreiben` |
| Haben-Kontakt mit Desk-Daten aktualisieren | `PATCH /kontakte/{id}` | `kontakte:schreiben` |

`kontakte:schreiben` enthält das Leserecht. Für reinen Import und Übernahmen nach Desk reicht das Leserecht. Wenn Desk eine Änderung an Haben senden soll, braucht das Token Schreibrecht. Lege ein eigenes Token für Desk an und konfiguriere es über `HABEN_TOKEN`. Setze `HABEN_URL` auf die HTTPS-Basisadresse der vorgesehenen Instanz, etwa `https://haben.example.test`. Desk ergänzt den Pfad `/api/v1`. Das Haben-Token ist Teil der Serverkonfiguration. [Haben-API und Tokenrechte](https://haben.app/api.html)

## Identität und Felder

Desk speichert am Kontakt die UUID des zugehörigen Haben-Kontakts. Eine UUID kann in einer Desk-Instanz nur einem Desk-Kontakt zugeordnet sein. Desk koordiniert Einzelabgleich und Import anhand dieser UUID. Namen und E-Mail-Adressen dienen der Dublettenprüfung beim Import. Das Team bestätigt die Zuordnung zu einem vorhandenen Haben-Kontakt über dessen UUID. Desk erwartet in Detail- und Änderungsantworten dieselbe UUID und alle gemeinsamen Felder. Eine vorhandene Verknüpfung lässt sich über den Abgleich nicht auf einen anderen Kontakt umbiegen. Bei einem Wechsel auf eine andere Haben-Instanz prüfe die gespeicherten Zuordnungen vor dem Abgleich, denn die IDs beziehen sich auf die bisherige Instanz.

| Desk | Haben | Zuständigkeit |
| --- | --- | --- |
| Name | `name` | Gemeinsames Feld, in Desk 1 bis 160 Zeichen |
| E-Mail | `email` | Gemeinsames Feld, eine Adresse bis 254 Zeichen oder leer |
| Telefon | `telefon` | Gemeinsames Feld, in Desk bis 250 Zeichen oder leer |
| Notiz, Projekte und Zuordnungen | | Desk |
| Kontakt-, Kunden- und Lieferantennummern, Anschrift, Steuer- und Bankdaten, Status, Ansprechpartner | | Haben |

Die API von Haben kann mehrere E-Mail-Adressen für einen Kontakt zurückgeben. Desk überspringt solche Kontakte beim Sammelimport und bricht einen Einzelabgleich mit einem Hinweis auf die Feldgrenzen ab. Dasselbe gilt für andere Angaben, die nicht in die Desk-Kontaktfelder passen. So bleiben die vollständigen Werte in Haben erhalten. Desk sendet nur die drei gemeinsamen Felder. [Kontaktfelder in Haben](https://haben.app/kontakte.html) · [Haben-OpenAPI](https://haben.app/api.html)

## Erstabgleich und Änderungen

- **Import.** Wähle in Desk unter **Kontakte** die Aktion **Aus Haben importieren**. Desk liest die Haben-Liste seitenweise. Es überspringt archivierte und inkompatible Kontakte sowie UUIDs, die bereits zugeordnet sind. Gibt es einen unverknüpften Desk-Kontakt mit demselben Namen oder derselben nicht leeren E-Mail-Adresse, legt der Import keinen zweiten Kontakt an. Groß- und Kleinschreibung sind dabei unerheblich. Verknüpfe den vorhandenen Kontakt anschließend einzeln per UUID.
- **Vorhandenen Haben-Kontakt verbinden.** Öffne den Kontakt in Haben unter **Verkauf → Kontakte**. Die UUID ist der letzte Abschnitt der Browseradresse `/kontakte/<UUID>`. Öffne in Desk den entsprechenden Kontakt, trage sie unter **Haben-Kontakt** in **Vorhandene Haben-Kontakt-ID** ein und wähle **Abgleichen**. Stimmen die gemeinsamen Felder überein, speichert Desk die Verknüpfung. Bei unterschiedlichen Werten zeigt es beide Stände zur Auswahl. Wählst du **Desk übernehmen**, speichert Desk die bestätigte ID vor der ersten Änderung in Haben. [Kontaktliste im Haben-Quellstand](https://github.com/Speicherstadt/haben/blob/0613ebf0efc7ca4d9bdd0aa359a1581dd4a4764b/apps/web/src/routes/_app/kontakte/index.tsx)
- **Neuen Haben-Kontakt anlegen.** Suche zuerst in Haben nach einem vorhandenen Kontakt. Existiert keiner, starte **Abgleichen** mit leerem ID-Feld. Desk übernimmt die von Haben bestätigte UUID. Wenn es bereits einen Kontakt gibt, verwende dessen ID.
- **Verknüpften Kontakt abgleichen.** Desk vergleicht die drei Felder auf beiden Seiten mit dem zuletzt bestätigten gemeinsamen Stand. Hat nur eine Seite Änderungen, übernimmt Desk deren Stand. Haben beide Seiten unterschiedliche Änderungen, wählt das Team **Desk übernehmen** oder **Haben übernehmen**. Die Auswahl gilt für die drei gemeinsamen Felder zusammen. Gleiche Werte benötigen keine Änderung in Haben.
- **Archivierte oder fehlende Haben-Kontakte.** Desk behält den lokalen Kontakt und seine Zuordnungen. Ein archivierter Kontakt wird beim Einzelabgleich abgewiesen. Wenn Haben einen verknüpften Kontakt nicht mehr findet, zeigt Desk den Fehler zur bestehenden Zuordnung.

## Nach Fehlern wiederholen

| Fall | Vorgehen |
| --- | --- |
| Der Import bricht nach Seite eins ab | Import erneut starten. Bereits übernommene UUIDs bleiben einmalig. |
| Haben lehnt die Anlage mit einem dokumentierten Validierungs- oder Berechtigungsfehler ab | Ursache beheben und den Export erneut auslösen. Desk gibt ihn nach einer eindeutigen Ablehnung wieder frei. |
| Die Antwort auf eine Anlage geht verloren oder Desk wird währenddessen beendet | Desk speichert vor dem Senden, dass eine Anlage aussteht. Prüfe Haben und verknüpfe die vorhandene UUID. Wenn keine Anlage feststellbar ist, lege den Kontakt nach der Prüfung bewusst in Haben an und verknüpfe ihn danach. |
| Die Antwort auf eine Änderung geht verloren, auch bei der Erstverknüpfung | **Abgleichen** erneut starten. Desk liest den aktuellen Stand anhand der gespeicherten UUID ein. Ist die Änderung dort angekommen, genügt der gelesene Stand. Bei abweichenden Änderungen gelten die Konfliktregeln. |

Der veröffentlichte Haben-Vertrag für Kontakte beschreibt weder einen Idempotenzschlüssel für die Anlage noch eine Versionsbedingung für Änderungen. Desk wiederholt unklare Anlagen daher nicht automatisch. Bei einem Einzelabgleich zwischen Abfrage und Änderung in Haben bleibt ein paralleler Zugriff auf denselben Kontakt außerhalb von Desk möglich. Führe konkurrierende Änderungen nach Möglichkeit nacheinander aus. [Haben-OpenAPI](https://haben.app/api.html) · [Haben-Routen im Quellstand](https://github.com/Speicherstadt/haben/blob/0613ebf0efc7ca4d9bdd0aa359a1581dd4a4764b/apps/web/src/server/modules/api/routes.ts)
