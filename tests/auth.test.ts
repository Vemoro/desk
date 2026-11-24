import { expect, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';

const database = process.env.DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test')) throw new Error('Tests benötigen eine isolierte DATABASE_URL mit Endung _test.');

const { db, first } = await import('../src/server/db');
const { createAccount } = await import('../src/server/accounts');
const { handle } = await import('../src/server/api');
const origin = process.env.DESK_ORIGIN ?? 'http://127.0.0.1:4182';

function request(path:string, method='GET', input?:unknown, headers:Record<string,string>={}) {
  return handle(new Request(`${origin}/api/v1/${path}`, {method,headers:{Origin:origin,...headers,
    ...(input===undefined ? {} : {'Content-Type':'application/json'}),
  },body:input===undefined ? undefined : JSON.stringify(input)}));
}

test('Migration erhält Altbestand und widerruft alte Sitzungen',async()=>{
  await db.begin(async(transaction)=>{
    const schema = 'upgrade_' + randomUUID().replaceAll('-','');
    await transaction.unsafe(`CREATE SCHEMA ${schema}`);
    await transaction.unsafe("SELECT set_config('search_path',$1,true)",[schema]);
    await transaction.unsafe(await Bun.file(new URL('../migrations/001_core.sql',import.meta.url)).text()).simple();
    const legacy = (await first<{id:string}>(transaction,
      "INSERT INTO users(email,name,password_hash,role) VALUES ('alt@example.test','Altbestand',$1,'admin') RETURNING id",
      [await Bun.password.hash('altes-muster-passwort')]))!;
    const contact = (await first<{id:string}>(transaction,"INSERT INTO contacts(name) VALUES ('Muster Auftragsservice') RETURNING id"))!;
    const project = (await first<{id:string}>(transaction,"INSERT INTO projects(name,contact_id) VALUES ('Büroinstallation',$1) RETURNING id",[contact.id]))!;
    await transaction.unsafe("INSERT INTO tasks (project_id,name,assignee_id) VALUES ($1,'Montage',$2)",[project.id,legacy.id]);
    await transaction.unsafe("INSERT INTO sessions VALUES ('alte-sitzung',$1,now() + interval '12 hours')",[legacy.id]);
    await transaction.unsafe("INSERT INTO api_tokens(hash,user_id,label,scope) VALUES ('alter-token',$1,'Altbestand','write')",[legacy.id]);

    await transaction.unsafe(await Bun.file(new URL('../migrations/002_better_auth.sql',import.meta.url)).text()).simple();
    const migrated = await first<{password:string}>(transaction,`SELECT a.password FROM auth_accounts a JOIN users u ON u.id=a."userId"
      JOIN tasks t ON t.assignee_id=u.id JOIN api_tokens k ON k.user_id=u.id
      WHERE u.id=$1 AND u.role='admin' AND a."providerId"='credential' AND a."accountId"=u.id::text
        AND a.password=u.password_hash AND t.project_id=$2 AND k.hash='alter-token'`,[legacy.id,project.id]);
    expect(migrated).toBeDefined();
    expect(await Bun.password.verify('altes-muster-passwort',migrated!.password)).toBe(true);
    expect(await first(transaction,"SELECT hash FROM sessions WHERE hash='alte-sitzung'")).toBeUndefined();

    // The previous version still inserts users with the original SQL after an application rollback.
    const createdAfterRollback = (await first<{id:string}>(transaction,
      "INSERT INTO users(email,name,password_hash,role) VALUES ('neu@example.test','Nach Rückweg','hash','member') RETURNING id"))!;
    expect(await first(transaction,'SELECT password FROM auth_accounts WHERE "userId"=$1',[createdAfterRollback.id])).toEqual({password:'hash'});
    await transaction.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  });
});

test('Desk-Anmeldung erhält Passwortgrenze, Rollen, Token und feste Sitzungsdauer',async()=>{
  const email = `${randomUUID()}@example.test`;
  const password = 'alt'.repeat(67).slice(0,200);
  const member = (await createAccount({email,password,name:'Muster Mitarbeit',role:'member'}))!;
  const token = `desk_${randomUUID()}`;
  await db.unsafe("INSERT INTO api_tokens(hash,user_id,label,scope) VALUES ($1,$2,'Alter Lesezugang','read')",
    [createHash('sha256').update(token).digest('hex'),member.id]);

  expect((await request('me')).status).toBe(401);
  expect((await request('sign-up/email','POST',{email,password})).status).toBe(401);
  expect((await request('login','POST',{email,password:'falsch'})).status).toBe(401);
  expect((await request('login','POST',{email,password},{Origin:'https://fremd.example.test',Authorization:`Bearer ${token}`})).status).toBe(403);

  async function login() {
    const response = await request('login','POST',{email:email.toUpperCase(),password});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ok:true});
    const cookie = response.headers.getSetCookie().find(value=>value.includes('session_token='));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=43200');
    return cookie!.split(';')[0];
  }

  const session = {Cookie:await login()};
  const response = await request('me','GET',undefined,session);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({id:member.id,role:'member'});
  expect((await request('sign-up/email','POST',{email,password},session)).status).toBe(404);
  expect((await request('users','POST',{email,password,name:'Beispiel',role:'admin'},session)).status).toBe(403);
  expect((await request('me','GET',undefined,{Authorization:`Bearer ${token}`})).status).toBe(200);
  expect((await request('users','POST',{}, {Authorization:`Bearer ${token}`})).status).toBe(403);

  const expires = (await first<{expires:Date}>(db,'SELECT "expiresAt" AS expires FROM auth_sessions WHERE "userId"=$1',[member.id]))!.expires;
  expect(expires.getTime()-Date.now()).toBeGreaterThan(43_180_000);
  const nearExpiry = new Date(Date.now()+60_000);
  await db.unsafe('UPDATE auth_sessions SET "expiresAt"=$2 WHERE "userId"=$1',[member.id,nearExpiry]);
  expect((await request('me','GET',undefined,session)).status).toBe(200);
  expect(await first(db,'SELECT "expiresAt" AS expires FROM auth_sessions WHERE "userId"=$1',[member.id])).toEqual({expires:nearExpiry});
  await db.unsafe('UPDATE auth_sessions SET "expiresAt"=now() WHERE "userId"=$1',[member.id]);
  expect((await request('me','GET',undefined,session)).status).toBe(401);

  const nextSession = {Cookie:await login()};
  const currentSession = (await first<{id:string}>(db,'SELECT id FROM auth_sessions WHERE "userId"=$1',[member.id]))!;
  const triggerName = 'reject_logout_' + randomUUID().replaceAll('-','');
  await db.unsafe(`CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.id::text = TG_ARGV[0] THEN RAISE EXCEPTION 'simulierter Sitzungsfehler'; END IF;
      RETURN OLD;
    END;
    $$`).simple();
  try {
    await db.unsafe(`CREATE TRIGGER ${triggerName} BEFORE DELETE ON auth_sessions
      FOR EACH ROW EXECUTE FUNCTION ${triggerName}('${currentSession.id}')`);
    const failedLogout = await request('logout','POST',undefined,nextSession);
    expect(failedLogout.status).toBe(500);
    expect(failedLogout.headers.getSetCookie()).toHaveLength(0);
  } finally {
    await db.unsafe(`DROP FUNCTION ${triggerName}() CASCADE`);
  }
  expect((await request('logout','POST',undefined,nextSession)).status).toBe(200);
  expect((await request('me','GET',undefined,nextSession)).status).toBe(401);
});

test('Die bisherige Begrenzung blockiert den neunten Fehlversuch',async()=>{
  const email = `${randomUUID()}@example.test`;
  for(let attempt=0;attempt<8;attempt++) {
    expect((await request('login','POST',{email,password:'falsch'})).status).toBe(401);
  }
  expect((await request('login','POST',{email,password:'falsch'})).status).toBe(429);
});


test('Eine neue Passkey-Anfrage räumt nur abgelaufene Challenges auf',async()=>{
  const { handlePasskey }=await import('../src/server/passkeys');
  const expired=randomUUID();
  const valid=randomUUID();
  await db.unsafe(`INSERT INTO auth_verifications (identifier,value,"expiresAt") VALUES
    ($1,'expired',now()-interval '1 minute'),($2,'valid',now()+interval '5 minutes')`,[expired,valid]);
  try {
    const response=await handlePasskey(new Request(`${origin}/api/auth/passkey/generate-authenticate-options`));
    expect(response.status).toBe(200);
    expect((await response.json()).userVerification).toBe('required');
    expect(await first(db,'SELECT id FROM auth_verifications WHERE identifier=$1',[expired])).toBeUndefined();
    expect(await first(db,'SELECT id FROM auth_verifications WHERE identifier=$1',[valid])).toBeDefined();
  } finally {
    await db.unsafe('DELETE FROM auth_verifications WHERE identifier IN ($1,$2)',[expired,valid]);
  }
});
