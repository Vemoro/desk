"""Save the tracked source of a Desk candidate and its checksum."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile


REPOSITORY = Path(__file__).resolve().parent.parent


def git(*arguments: str) -> bytes:
    return subprocess.check_output(("git", *arguments), cwd=REPOSITORY)


def package(commit: str, output: Path) -> tuple[Path, str]:
    if not re.fullmatch("[0-9a-f]{40}", commit):
        raise ValueError("Gib einen vollständigen Git-Commit mit 40 Hex-Zeichen an.")
    if git("cat-file", "-t", commit).strip() != b"commit":
        raise ValueError("Das angegebene Git-Objekt ist kein Commit.")

    metadata = json.loads(git("show", f"{commit}:package.json"))
    version = metadata.get("deskVersion") if isinstance(metadata, dict) else None
    if not isinstance(version, str) or not re.fullmatch(r"[0-9]+(?:\.[0-9]+){3}", version):
        raise ValueError("Im Commit fehlt eine gültige vierteilige deskVersion in package.json.")

    package_name = f"desk-{version}-{commit}"
    prefix = f"desk-{commit}/"
    output.mkdir(parents=True, exist_ok=True)
    destination = output / package_name
    if destination.exists():
        raise FileExistsError(f"Das Paket existiert bereits: {destination}")

    with tempfile.TemporaryDirectory(dir=output) as temporary:
        staging = Path(temporary) / package_name
        staging.mkdir()
        archive = staging / f"{package_name}.tar.gz"
        git("archive", "--format=tar.gz", f"--prefix={prefix}", f"--output={archive.resolve()}", commit)

        expected = set(git("ls-tree", "-rz", "--name-only", commit).decode().split("\0"))
        expected.discard("")
        with tarfile.open(archive, "r:gz") as contents:
            archived = [member.name for member in contents if not member.isdir()]
        if len(archived) != len(expected) or set(archived) != {prefix + name for name in expected}:
            raise ValueError("Die Dateiliste im Archiv weicht vom Git-Commit ab.")

        with archive.open("rb") as stream:
            checksum = hashlib.file_digest(stream, "sha256").hexdigest()
        (staging / "SHA256SUMS").write_text(f"{checksum}  {archive.name}\n", encoding="ascii", newline="\n")
        staging.rename(destination)
    return destination, checksum


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("commit", help="Vollständige Git-Commit-ID")
    parser.add_argument("output", type=Path, help="Verzeichnis für das geprüfte Quellpaket")
    args = parser.parse_args()
    try:
        destination, checksum = package(args.commit, args.output)
    except (OSError, ValueError, subprocess.CalledProcessError, tarfile.TarError) as error:
        parser.exit(1, f"Quellpaket konnte nicht erstellt werden: {error}\n")
    print(f"{destination}\nSHA-256: {checksum}")


if __name__ == "__main__":
    main()
