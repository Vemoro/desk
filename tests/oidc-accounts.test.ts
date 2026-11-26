import { expect, test } from 'bun:test';
import { createAccount, createToken } from '../src/server/auth';
import { handle } from '../src/server/api';
import { db } from '../src/server/db';
import { required } from '../src/server/errors';
import { bindOidcAccount, getOidcProfile, removeOidcAccount } from '../src/server/oidc-accounts';

const database = process.env.DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test')) throw new Error('Isolierte Testdatenbank erforderlich.');

const origin = process.env.DESK_ORIGIN ?? 'http://127.0.0.1';
const issuer = 'https://id.example.test/realms/muster';
const password = 'muster-test-passwort';

function createPerson(role: 'admin' | 'member' = 'member') {
  return createAccount({ email: `${crypto.randomUUID()}@example.test`, name: 'Musterperson', role, password });
}

async function login(email: string) {
  const response = await handle(new Request(`${origin}/api/v1/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }));
  expect(response.status).toBe(200);
  return required(response.headers.getSetCookie().find(value => /^(?:__Secure-)?desk-auth\.session_token=/.test(value))).split(';')[0];
}

function profileStatus(headers: HeadersInit) {
  return handle(new Request(`${origin}/api/v1/me`, { headers })).then(response => response.status);
}

test('OIDC-Zuordnung ist wiederholbar und dieselbe Identität kann nur ein Konto erhalten', async () => {
  const first = required(await createPerson());
  const second = required(await createPerson());
  const subject = crypto.randomUUID();
  try {
    const outcomes = await Promise.allSettled([first, second].map(user => bindOidcAccount(user.email, issuer, subject)));
    expect(outcomes.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const owner = outcomes[0].status === 'fulfilled' ? first : second;
    expect(await bindOidcAccount(owner.email, issuer, subject)).toBe(false);
    expect(await getOidcProfile(issuer, subject)).toEqual({ email: owner.email, name: owner.name });
    expect(await getOidcProfile(issuer + '/zweiter', subject)).toBeUndefined();
    await expect(bindOidcAccount(owner.email, issuer, 'anderes-subject')).rejects.toThrow('bereits eine Zuordnung');
  } finally {
    await db.unsafe('DELETE FROM users WHERE id = ANY($1::uuid[])', [[first.id, second.id]]);
  }
});

test('OIDC-Entkopplung beendet beide Browser-Sitzungen und erhält lokale Anmeldung und API-Token', async () => {
  const user = required(await createPerson('admin'));
  const subject = crypto.randomUUID();
  try {
    expect(await bindOidcAccount(user.email, issuer, subject)).toBe(true);
    const first = { Cookie: await login(user.email) };
    const second = { Cookie: await login(user.email) };
    const token = await createToken(user, { label: 'Testzugriff', scope: 'read' });
    const bearer = { Authorization: `Bearer ${token.token}` };
    expect(await profileStatus(first)).toBe(200);
    expect(await profileStatus(second)).toBe(200);
    expect(await removeOidcAccount(user.email)).toBe(true);
    expect(await profileStatus(first)).toBe(401);
    expect(await profileStatus(second)).toBe(401);
    expect(await getOidcProfile(issuer, subject)).toBeUndefined();
    expect(await profileStatus(bearer)).toBe(200);
    const local = { Cookie: await login(user.email) };
    expect(await removeOidcAccount(user.email)).toBe(false);
    expect(await profileStatus(local)).toBe(200);
  } finally {
    await db.unsafe('DELETE FROM api_tokens WHERE user_id = $1', [user.id]);
    await db.unsafe('DELETE FROM users WHERE id = $1', [user.id]);
  }
});
