import { db } from '../src/server/db';
import { DeskError } from '../src/server/errors';
import { bindOidcAccount, removeOidcAccount } from '../src/server/oidc-accounts';
import { configuredOidc } from '../src/server/oidc-discovery';

try {
  const [command, email, subject, ...extra] = process.argv.slice(2);
  if (!email || extra.length || (command === 'bind' ? !subject : command !== 'remove' || subject !== undefined)) {
    throw new DeskError(400, 'Aufruf: bun scripts/oidc.ts bind <Desk-E-Mail> <Subject> oder bun scripts/oidc.ts remove <Desk-E-Mail>');
  }
  if (command === 'bind') {
    const config = configuredOidc();
    if (!config) throw new DeskError(400, 'Für die Zuordnung muss OIDC in Desk konfiguriert sein.');
    if (!/^[\x20-\x7e]{1,255}$/.test(subject)) {
      throw new DeskError(400, 'Das Subject muss zwischen 1 und 255 druckbare ASCII-Zeichen enthalten.');
    }
    const changed = await bindOidcAccount(email, config.issuer, subject);
    console.log(changed ? 'OIDC-Zuordnung gespeichert.' : 'OIDC-Zuordnung besteht bereits.');
  } else {
    const changed = await removeOidcAccount(email);
    console.log(changed ? 'OIDC-Zuordnung entfernt und Desk-Browsersitzungen widerrufen.' : 'Keine OIDC-Zuordnung vorhanden.');
  }
} catch (error) {
  console.error(error instanceof DeskError ? error.message : 'Die OIDC-Zuordnung konnte nicht geändert werden.');
  process.exitCode = 1;
} finally {
  await db.close();
}
