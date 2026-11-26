---
name: desk-doku-pruefen
description: Prüft Desk-Dokumentation und Skills unabhängig gegen den beschriebenen Stand, tatsächliche Befehle, Quellen und vorhandene Regeln.
---

# Desk-Doku unabhängig prüfen

Nutze Basis, Head, Diff und Auftrag aus dem [Review-Rahmen](../../../docs/entwicklung.md#änderungen-prüfen).

1. Gleiche Aussagen zu Bedienung, Schnittstellen und Betrieb mit dem Code oder der Primärquelle ab. Teste geänderte Befehle und Beispiele auf der angegebenen Zielbasis. Notiere, welche noch offenen Vorarbeiten ein Beispiel voraussetzt.
2. Prüfe interne Links, Anker und Quellenlinks. Dokumentation erklärt Nutzenden und Beitragenden, was sie tun müssen. Ein Skill verweist auf die maßgebliche Regel und beschreibt den agentischen Ablauf.
3. Prüfe bei Skills, ob Name, Beschreibung und verlinkte Ressourcen zum tatsächlichen Ablauf passen. Teste risikoreiche oder wiederkehrende Schritte an einem zulässigen Beispiel. Halte fehlende Voraussetzungen fest.
4. Melde konkrete Befunde mit Stelle und Beleg und unterscheide sie von Textvorschlägen. Nenne auch bei fehlenden Befunden Head und tatsächlich geprüfte Teile. Bei Code und Markdown ergänzt ein getrenntes [Code-Review](../desk-tdd-review/SKILL.md) den Doku-Abgleich.
5. Veröffentliche das Ergebnis als eigenen [Prüfkommentar im PR](../../../docs/entwicklung.md#prüfnachweise-im-pull-request), auch ohne Befund.
