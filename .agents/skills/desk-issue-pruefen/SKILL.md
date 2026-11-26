---
name: desk-issue-pruefen
description: Prüft die aktuelle Fassung eines Desk-Issues unabhängig auf Problem, Nutzen, Lösungswahl, Auswirkungen und prüfbare Akzeptanz, bevor die Aufgabe geplant oder wiederaufgenommen wird.
---

# Desk-Issue unabhängig prüfen

Verwende die [Entwicklungsregeln](../../../docs/entwicklung.md#issue-review-vor-der-planung) und die [Roadmap](../../../docs/roadmap.md). Wenn du den Text mitgeschrieben hast, übernimmt eine frische Session die Prüfung. Der Auftrag enthält Titel, Text, Zielbasis, Quellen und explizite Vorgaben des Maintainers. Entstehungsverlauf und Selbstbewertung gehören nicht in den Prüfauftrag.

1. **Problem und Nutzen.** Benenne, wer in welchem Ablauf an welcher Hürde scheitert und was sich dadurch verzögert, verloren geht oder unsicher bleibt. Prüfe, ob der Nutzen zum Produktumfang passt. Ein Fehler braucht einen belegten Ist-Stand und einen nachvollziehbaren Sollzustand.
2. **Stand und Überschneidungen.** Prüfe die Aussagen selbst auf der angegebenen Basis. Suche nach bestehenden Lösungen, verwandten Issues, offenen Abhängigkeiten und bereits gemergten PRs. Stimmen Quellen oder Schnittstellen nicht zur Zielversion, nenne die belegte Abweichung.
3. **Lösungswahl.** Prüfe, ob der Eingriff die Ursache trifft und vorhandene Desk-Wege nutzt. Vergleiche ihn mit der nächstliegenden sinnvollen Alternative, etwa einem vorhandenen Ablauf oder einer Änderung näher an der Ursache. Erkläre die Folgen der Alternativen für die Betroffenen. Bei eindeutigen kleinen Fehlern reicht eine knappe Begründung für den Ansatz. Offene Produktentscheidungen gehen an den Maintainer.
4. **Grenzen und Folgen.** Prüfe relevante Abhängigkeiten und Auswirkungen auf vorhandene Daten, Berechtigungen, Browserbedienung oder angebundene Systeme. Wähle nach dem Umfang des Issues. Halte fest, was bewusst später behandelt wird.
5. **Abnahme.** Prüfe, ob der Normalablauf und die einschlägigen Fehler- und Randfälle mit beobachtbaren Ergebnissen beschrieben sind. Nenne bei fehlendem Nachweis einen konkreten Abnahmefall mit synthetischen Daten. Bei UI-Änderungen berücksichtige betroffene Größen, Themes und Bedienwege.

Melde die geprüfte Fassung und Basis, je Befund die betreffende Stelle, den Beleg und was für die Planung fehlt. Kennzeichne Vorschläge und offene Entscheidungen gesondert. Schließe mit **Bereit für Geplant**, **Überarbeiten** oder **Entscheidung erforderlich**. Fehlt eine belastbare Grundlage für Nutzen, Ansatz oder Abnahme, kann die Aufgabe erst nach der Klärung nach „Geplant“. Lass die überarbeitete Fassung nach wesentlichen Änderungen erneut unabhängig prüfen.
