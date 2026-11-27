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
    return subprocess.check_output(("git", "--no-replace-objects", *arguments), cwd=REPOSITORY)


def verify(archive: Path, commit: str, prefix: str) -> None:
    expected: dict[str, tuple[str, str]] = {}
    for entry in git("ls-tree", "-rz", commit).rstrip(b"\0").split(b"\0"):
        metadata, path = entry.split(b"\t", 1)
        mode, kind, object_id = metadata.decode("ascii").split()
        if kind != "blob":
            raise ValueError(f"Der Git-Pfad {path!r} benötigt ein separates Quellpaket.")
        expected[prefix + path.decode("utf-8", "surrogateescape")] = (mode, object_id)

    with tarfile.open(archive, "r:gz") as contents:
        for member in contents:
            if member.isdir():
                continue
            original = expected.pop(member.name, None)
            if original is None:
                raise ValueError(f"Unerwarteter Pfad im Archiv: {member.name}")
            mode, object_id = original
            if mode == "120000" and member.issym():
                data = member.linkname.encode("utf-8", "surrogateescape")
            elif mode != "120000" and member.isfile():
                with contents.extractfile(member) as stream:
                    data = stream.read()
            else:
                raise ValueError(f"Falscher Dateityp im Archiv: {member.name}")
            # Match the Git blob ID, independently of checkout line endings and archive attributes.
            blob = hashlib.sha1(f"blob {len(data)}\0".encode("ascii"), usedforsecurity=False)
            blob.update(data)
            if blob.hexdigest() != object_id:
                raise ValueError(f"Der Dateiinhalt weicht vom Git-Commit ab: {member.name}")
    if expected:
        raise ValueError(f"Im Archiv fehlt ein Pfad aus dem Git-Commit: {next(iter(expected))}")


def package(commit: str, output: Path) -> tuple[Path, str]:
    if not re.fullmatch("[0-9a-fA-F]{40}", commit):
        raise ValueError("Gib einen vollständigen Git-Commit mit 40 Hex-Zeichen an.")
    commit = commit.lower()
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
        git("-c", "core.autocrlf=false", "-c", "core.eol=lf", "-c", "tar.umask=0002", "archive", "--format=tar.gz",
            f"--prefix={prefix}", f"--output={archive.resolve()}", commit)
        verify(archive, commit, prefix)

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
