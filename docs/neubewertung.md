# Bestehende Desk-Issues und PRs neu bewerten

Die Neubewertung beginnt nach dem Merge der Arbeitsgrundlage auf `main`. Halte den exakten neuen Regel-Commit, den Erfassungszeitpunkt und den Stand der [Roadmap](https://github.com/orgs/Vemoro/projects/2) fest. Die bisherigen Bewertungen, CI-Läufe und Screenshots dienen als Belege. Sie werden gegen die neue Grundlage und den jeweiligen Stand abgeglichen.

## Bestand vollständig erfassen

Erfasse die durch die bisherige Desk-Arbeit angelegten Issues und PRs einschließlich Entwürfen und geschlossenen Einträgen. Autor, KI-Kennzeichnung, verknüpfte Aufgaben und die dokumentierte Arbeitshistorie helfen bei der Zuordnung. Bei unklarer Herkunft führe den Eintrag mit dieser Unsicherheit auf. Bewahre je Eintrag Nummer, Link, Status, Zuordnung und optional die Board-Karte auf. Geschlossene oder gemergte Einträge bekommen bei Bedarf eine Folgeaufgabe.

Lies Issues, PRs und Board getrennt aus. Suche Repo-Objekte mit dem GitHub-Werkzeug oder den paginierten Endpunkten `repos/Vemoro/desk/issues` und `repos/Vemoro/desk/pulls` mit `state=all`. Der Issues-Endpunkt liefert Pull Requests mit, die du über das Feld `pull_request` herausfilterst. Prüfe, ob alle Seiten erfasst sind. Vergleiche die getrennten Nummernlisten mit den Board-Karten, denn auch Einträge ohne Karte gehören zum Bestand.

## Issues zuerst prüfen

Lies das Issue und die sachlich relevanten Kommentare. Prüfe am angegebenen Stand, ob der Bedarf noch besteht, der Umfang in den allgemeinen Desk-Kern passt und die Akzeptanz prüfbar ist. Suche nach Dubletten, überholten Vorarbeiten, vorhandener Umsetzung und externen Abhängigkeiten. Lass die aktuelle Bewertung von einem frischen Agenten prüfen.

Halte pro Issue ein Ergebnis mit Beleg fest. Mögliche Ergebnisse sind weiterplanen, präzisieren, mit einer vorhandenen Aufgabe zusammenführen, zurückstellen, externe Änderung abwarten oder Maintainer-Entscheidung. Übertrage den vereinbarten Status entsprechend der [Roadmap](roadmap.md#board-zustände).

## PRs gegen den wirksamen Stand prüfen

Erfasse zu jedem PR mindestens die Zielbasis, den Head-Commit, abhängige PRs sowie aktuelle Review-, CI- und Bildbelege. Prüfe zuerst den Kern und die Grundlagen, danach ihre Nachfolger in der tatsächlichen Reihenfolge der Branches. Bei mehreren Zielen halte Überschneidungen und die getestete Kombination fest. Nutze für die gemeinsame Prüfung isolierte Arbeitsstände.

Gleiche Auftrag und Umfang mit dem Issue ab und prüfe die tatsächlichen Änderungen. Verifiziere die Checks für den aktuellen Stand. Bei UI-Änderungen kontrolliere die Vorher-Nachher-Bilder und die Zugänglichkeit ihrer Links. Fordere fehlende Belege gezielt an oder ergänze sie im vereinbarten Auftrag. Lass neue fachliche Bewertungen unabhängig prüfen. Halte pro PR fest, ob er prüfbereit ist, Nachweise oder Änderungen benötigt, von einer Vorarbeit abhängt, durch die neue Arbeitsgrundlage ersetzt wird oder eine Maintainer-Entscheidung braucht. Dokumentiere Abweichungen und Abhängigkeiten mit Beleg und nächstem Schritt.

Die Übersicht ist die Grundlage für den Checkup nach der Neubewertung. Freigabe, Zusammenführung und Release folgen den [Entwicklungsregeln](entwicklung.md#änderungen-prüfen).
