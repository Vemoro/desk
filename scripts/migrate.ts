import { db } from '../src/server/db';
import { migrationFiles, migrationsDirectory } from '../src/server/migration-files';

try {
  await db.begin(async (transaction) => {
    await transaction.unsafe('SELECT pg_advisory_xact_lock(61273)');
    await transaction.unsafe('CREATE TABLE IF NOT EXISTS desk_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const file of await migrationFiles()) {
      const applied = await transaction.unsafe('SELECT name FROM desk_migrations WHERE name = $1', [file]);
      if (applied.length) continue;
      // simple() sends the migration as a script, including statements with embedded semicolons.
      await transaction.unsafe(await Bun.file(new URL(file, migrationsDirectory)).text()).simple();
      await transaction.unsafe('INSERT INTO desk_migrations(name) VALUES ($1)', [file]);
      console.log(file);
    }
  });
} finally {
  await db.close();
}
