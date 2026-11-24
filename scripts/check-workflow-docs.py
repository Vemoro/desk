"""Verify local links and skill entrypoints in Desk's governance documentation."""

import re
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
LINK = re.compile(
    r"""\[[^\]\n]+\]\((<[^>\n]+>|[^\s()]+)(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'))?[ \t]*\)"""
)
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")


def markdown_text(content):
    fence = ""
    lines = []
    for line in content.splitlines():
        marker = FENCE.match(line)
        if not fence:
            if marker:
                fence = marker.group(1)
            else:
                lines.append(line)
        elif marker and marker.group(1).startswith(fence) and not marker.group(2).strip():
            fence = ""
    return "\n".join(lines)


def anchors(content):
    headings = re.findall(r"^#{1,6} (.+)$", markdown_text(content), flags=re.MULTILINE)
    return {re.sub(r"[^\w -]", "", heading.lower()).replace(" ", "-") for heading in headings}


def check():
    sources = [
        ROOT / name
        for name in (
            "AGENTS.md",
            "CLAUDE.md",
            "CONTRIBUTING.md",
            "DESIGN.md",
            "docs/entwicklung.md",
            "docs/roadmap.md",
            "docs/haben-uebernahme.md",
            "docs/neubewertung.md",
            ".github/pull_request_template.md",
        )
    ]
    skills = sorted((ROOT / ".agents/skills").glob("*/SKILL.md"))
    agents = markdown_text(sources[0].read_text(encoding="utf-8"))
    for skill in skills:
        name = skill.parent.name
        metadata = skill.read_text(encoding="utf-8").split("---", 2)
        if (
            len(metadata) != 3
            or metadata[0] != ""
            or not re.search(rf"^name:\s*{re.escape(name)}\s*$", metadata[1], flags=re.MULTILINE)
            or not re.search(r"^description: [^\n]+$", metadata[1], flags=re.MULTILINE)
        ):
            raise SystemExit(f"Ungültige Skill-Metadaten: {skill.relative_to(ROOT)}")
        if skill.relative_to(ROOT).as_posix() not in LINK.findall(agents):
            raise SystemExit(f"Link in AGENTS.md fehlt: {skill.relative_to(ROOT)}")

    for source in [*sources, *skills]:
        for value in LINK.findall(markdown_text(source.read_text(encoding="utf-8"))):
            link = urlsplit(value.removeprefix("<").removesuffix(">"))
            if link.scheme or link.netloc:
                continue
            target = (source.parent / unquote(link.path)).resolve() if link.path else source
            if not target.is_relative_to(ROOT) or not target.exists():
                raise SystemExit(f"Pfad in {source.relative_to(ROOT)} fehlt: {value}")
            if link.fragment and target.suffix == ".md":
                if unquote(link.fragment) not in anchors(target.read_text(encoding="utf-8")):
                    raise SystemExit(f"Anker in {source.relative_to(ROOT)} fehlt: {value}")

    print(f"Lokale Verweise in {len(sources)} Grundlagendateien und {len(skills)} Skills geprüft.")


if __name__ == "__main__":
    check()
