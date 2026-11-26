import { withAccountAccess } from './accounts';
import { db, first } from './db';
import { DeskError, required } from './errors';

export const oidcProviderId = 'desk-oidc';

export function oidcAccountKey(issuer: string, subject: string) {
  return JSON.stringify([issuer, subject]);
}

export function getOidcProfile(issuer: string, subject: string) {
  return first<{ email: string; name: string }>(db, `
    SELECT u.email, u.name FROM auth_accounts a JOIN users u ON u.id = a."userId"
    WHERE a."providerId" = $1 AND a."accountId" = $2 AND NOT u.blocked
  `, [oidcProviderId, oidcAccountKey(issuer, subject)]);
}

export function bindOidcAccount(email: string, issuer: string, subject: string) {
  return withAccountAccess('exclusive', async transaction => {
    const user = required(await first<{ id: string; blocked: boolean }>(transaction,
      'SELECT id, blocked FROM users WHERE email = $1', [email.toLowerCase()]), 'Teamkonto nicht gefunden.');
    if (user.blocked) throw new DeskError(409, 'Das Desk-Konto ist gesperrt.');
    const target = oidcAccountKey(issuer, subject);
    const existing = await first<{ userId: string; accountId: string }>(transaction, `
      SELECT "userId", "accountId" FROM auth_accounts
      WHERE "providerId" = $1 AND ("userId" = $2 OR "accountId" = $3)
    `, [oidcProviderId, user.id, target]);
    if (existing) {
      if (existing.userId === user.id && existing.accountId === target) return false;
      throw new DeskError(409, 'Für dieses Desk-Konto oder diese OIDC-Identität besteht bereits eine Zuordnung.');
    }
    await transaction.unsafe('INSERT INTO auth_accounts ("providerId", "userId", "accountId") VALUES ($1,$2,$3)',
      [oidcProviderId, user.id, target]);
    return true;
  });
}

export function removeOidcAccount(email: string) {
  return withAccountAccess('exclusive', async transaction => {
    const user = required(await first<{ id: string }>(transaction,
      'SELECT id FROM users WHERE email = $1', [email.toLowerCase()]), 'Teamkonto nicht gefunden.');
    const removed = await transaction.unsafe('DELETE FROM auth_accounts WHERE "providerId" = $1 AND "userId" = $2 RETURNING id',
      [oidcProviderId, user.id]);
    if (!removed.length) return false;
    await transaction.unsafe('DELETE FROM auth_sessions WHERE "userId" = $1', [user.id]);
    return true;
  });
}
