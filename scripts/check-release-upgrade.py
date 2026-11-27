"""Verify released migration files and upgrade a populated CI database."""

import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent.parent
SQL_CLIENT = """
import { SQL } from 'bun';
const db = new SQL(process.env.DATABASE_URL);
try {
  console.log(JSON.stringify(await db.unsafe(await Bun.stdin.text()).simple()));
} finally {
  await db.close();
}
"""
SEED = """
WITH contact AS (
  INSERT INTO contacts (name) VALUES ('Muster Auftragsservice') RETURNING id
), project AS (
  INSERT INTO projects (name,contact_id) SELECT 'Musterinstallation',id FROM contact RETURNING id
), actor AS (
  INSERT INTO users (email,name,password_hash,role)
  VALUES ('upgrade@example.test','Musterprüfung','unused','member') RETURNING id
), item AS (
  INSERT INTO items (name,code,kind) VALUES ('Montagematerial','UPGRADE-01','consumable') RETURNING id
), location AS (
  INSERT INTO locations (name) VALUES ('Musterlager') RETURNING id
)
INSERT INTO movements (item_id,location_id,project_id,actor_id,action,quantity)
SELECT item.id,location.id,project.id,actor.id,'receive',7 FROM item,location,project,actor;
"""
SNAPSHOT = """
SELECT c.id AS contact_id,c.name AS contact,p.id AS project_id,p.name AS project,
       m.id AS movement_id,m.item_id,m.location_id,m.actor_id,m.action,m.quantity,
       (SELECT sum(CASE WHEN action IN ('receive','return','correct_consume')
                        THEN quantity ELSE -quantity END)
        FROM movements WHERE item_id=m.item_id AND location_id=m.location_id)::int AS physical
FROM movements m JOIN projects p ON p.id=m.project_id JOIN contacts c ON c.id=p.contact_id
JOIN items i ON i.id=m.item_id WHERE i.code='UPGRADE-01'
ORDER BY m.id;
"""
ROLLBACK_MARKER = "absichtlicher_desk_upgrade_fehler"


def git(*arguments):
    return subprocess.check_output(("git", "--no-replace-objects", *arguments), cwd=ROOT)


def released_base(metadata):
    releases = [entry for page in metadata for entry in page
                if not entry["draft"] and entry["published_at"]]
    if not releases:
        raise ValueError("Im offiziellen Desk-Repository fehlt ein veröffentlichter Release.")
    tag = max(releases, key=lambda entry: entry["published_at"])["tag_name"]
    try:
        commit = git("rev-parse", "--verify", f"refs/tags/{tag}^{{commit}}").decode().strip()
    except subprocess.CalledProcessError as error:
        raise ValueError(f"Der veröffentlichte Release-Tag {tag} fehlt im Checkout.") from error
    print(f"Veröffentlichte Vergleichsbasis: {tag} ({commit})", flush=True)
    return commit


def migrations(commit):
    entries = {}
    for entry in git("ls-tree", "-rz", commit, "--", "migrations/").split(b"\0"):
        if not entry:
            continue
        metadata, path = entry.split(b"\t", 1)
        name = path.decode("utf-8")
        if not name.endswith(".sql"):
            continue
        mode, _, blob = metadata.split()
        if name.count("/") != 1 or mode not in (b"100644", b"100755"):
            raise ValueError(f"Keine reguläre SQL-Datei im Migrationsverzeichnis: {name}")
        entries[name] = blob
    return entries


def runner_order(name):
    return name.encode("utf-16-be")


def require_history(released, candidate):
    if not released:
        raise ValueError("Die veröffentlichte Vergleichsbasis enthält keine SQL-Migrationen.")
    errors = []
    for path, object_id in released.items():
        if candidate.get(path) != object_id:
            errors.append(f"Veröffentlichte Migration fehlt oder wurde geändert: {path}")
    last = max(released, key=runner_order)
    for path in candidate.keys() - released.keys():
        if runner_order(path) <= runner_order(last):
            errors.append(f"Neue Migration muss hinter {last} stehen: {path}")
    if errors:
        raise ValueError("\n".join(sorted(errors)))


def verify_history_guard(released):
    path = next(iter(released))
    altered = released | {path: b"modified"}
    for variant in (altered, {name: blob for name, blob in released.items() if name != path}):
        try:
            require_history(released, variant)
        except ValueError as error:
            if path in str(error):
                continue
            raise
        raise ValueError("Die Historienprüfung hat eine manipulierte Migration akzeptiert.")


def database_env():
    url = urlsplit(os.environ.get("DATABASE_URL", ""))
    if (url.hostname not in {"127.0.0.1", "::1", "localhost"}
            or not url.path.endswith("_upgrade_test") or url.query or url.fragment):
        raise ValueError("Die Upgrade-Prüfung braucht eine lokale, leere _upgrade_test-Datenbank.")
    return os.environ | {
        "HABEN_URL": "", "HABEN_TOKEN": "", "ZAMMAD_URL": "", "ZAMMAD_TOKEN": "",
    }


def sql(statement, env):
    result = subprocess.check_output(("bun", "--no-env-file", "-e", SQL_CLIENT), input=statement,
                                     encoding="utf-8", cwd=ROOT, env=env)
    return json.loads(result)


def migrate(directory, env, fail=False):
    return subprocess.run(("bun", "--no-env-file", "scripts/migrate.ts"),
                          cwd=directory, env=env, check=not fail,
                          capture_output=fail, encoding="utf-8")


def ledger(env):
    return sql("SELECT name, applied_at FROM desk_migrations ORDER BY name", env)


def verify_upgrade(release, candidate, env, temp):
    if sql("SELECT count(*)::int AS tables FROM pg_tables WHERE schemaname='public'", env)[0]["tables"]:
        raise ValueError("Die Upgrade-Testdatenbank enthält bereits Tabellen.")
    checkout = temp / "published"
    git("worktree", "add", "--detach", str(checkout), release)
    try:
        migrate(checkout, env)
    finally:
        git("worktree", "remove", str(checkout))
    sql(SEED, env)
    before = sql(SNAPSHOT, env)
    if len(before) != 1 or before[0]["quantity"] != 7 or before[0]["physical"] != 7:
        raise ValueError("Der projektbezogene Lagerbestand der Vergleichsbasis fehlt.")
    migrate(ROOT, env)
    expected = {Path(path).name for path in candidate}
    applied = ledger(env)
    if {row["name"] for row in applied} != expected or sql(SNAPSHOT, env) != before:
        raise ValueError("Migrationseinträge oder Beispieldaten stimmen nach dem Upgrade nicht.")
    check_ready(env, temp)
    migrate(ROOT, env)
    if ledger(env) != applied or sql(SNAPSHOT, env) != before:
        raise ValueError("Ein zweiter Migrationslauf hat Daten oder Protokoll verändert.")
    verify_rollback(env, temp, applied, before)


def check_ready(env, temp):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    origin = f"http://127.0.0.1:{port}"
    server_env = env | {"DESK_ORIGIN": origin, "NITRO_HOST": "127.0.0.1", "NITRO_PORT": str(port)}
    with (temp / "server.log").open("w+", encoding="utf-8") as log:
        server = subprocess.Popen(("bun", "--no-env-file", ".output/server/index.mjs"),
                                  cwd=ROOT, env=server_env, stdout=log, stderr=subprocess.STDOUT)
        try:
            for _ in range(30):
                if server.poll() is not None:
                    break
                try:
                    with urlopen(origin + "/api/v1/ready", timeout=2) as response:
                        if json.load(response) == {"ready": True}:
                            return
                except URLError:
                    time.sleep(0.5)
            log.seek(0)
            raise ValueError("Desk ist nach dem Upgrade nicht bereit.\n" + log.read())
        finally:
            if server.poll() is None:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()


def verify_rollback(env, temp, applied, before):
    probe = temp / "rollback"
    for name in ("migrations", "src/server"):
        shutil.copytree(ROOT / name, probe / name)
    (probe / "scripts").mkdir()
    shutil.copy2(ROOT / "scripts/migrate.ts", probe / "scripts/migrate.ts")
    last = max((row["name"] for row in applied), key=runner_order)
    prefix = last.removesuffix(".sql")
    (probe / "migrations" / f"{prefix}_probe_a.sql").write_text(
        "CREATE TABLE desk_upgrade_probe_a (id integer);", encoding="utf-8")
    (probe / "migrations" / f"{prefix}_probe_b.sql").write_text(
        f"CREATE TABLE desk_upgrade_probe_b (id integer); SELECT '{ROLLBACK_MARKER}'::integer;",
        encoding="utf-8")
    result = migrate(probe, env, fail=True)
    if result.returncode == 0 or ROLLBACK_MARKER not in result.stderr:
        raise ValueError("Die absichtlich fehlerhafte Migration scheiterte nicht am vorgesehenen Schritt.")
    probe_tables = sql("SELECT tablename FROM pg_tables WHERE schemaname='public' "
                       "AND tablename IN ('desk_upgrade_probe_a','desk_upgrade_probe_b')", env)
    if probe_tables or ledger(env) != applied or sql(SNAPSHOT, env) != before:
        raise ValueError("Der fehlgeschlagene Upgrade-Lauf hat Schema, Protokoll oder Daten verändert.")


def main():
    metadata = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    release = released_base(metadata)
    released = migrations(release)
    candidate = migrations("HEAD")
    require_history(released, candidate)
    verify_history_guard(released)
    with TemporaryDirectory(prefix="desk-upgrade-") as temporary:
        verify_upgrade(release, candidate, database_env(), Path(temporary))
    print("Migrationshistorie, Upgrade, Wiederholung und Rollback erfolgreich geprüft.")


if __name__ == "__main__":
    try:
        main()
    except (IndexError, OSError, subprocess.SubprocessError, ValueError) as error:
        sys.exit(f"Release-Upgrade fehlgeschlagen: {error}")
