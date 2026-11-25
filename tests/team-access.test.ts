import { expect, test } from 'bun:test';
import { password as bunPassword } from 'bun';
import { handle } from '../src/server/api';
import { createAccount, createToken } from '../src/server/auth';
import { required } from '../src/server/errors';
import { db, first } from '../src/server/db';

const database = process.env.DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test')) throw new Error('Isolierte Testdatenbank erforderlich.');

const origin = process.env.DESK_ORIGIN ?? 'http://127.0.0.1';
const password = 'muster-test-passwort';
const request = (path: string, options?: RequestInit) => handle(new Request(`${origin}/api/v1${path}`, options));
const jsonHeaders = { Origin: origin, 'Content-Type': 'application/json' };
const login = (email: string) => request('/login', {
  method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email, password }),
});
const status = async (headers: HeadersInit) => (await request('/me', { headers })).status;

function sessionCookie(response: Response) {
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().find(value => /^(?:__Secure-)?desk-auth\.session_token=/.test(value));
  if (!cookie) throw new Error('Desk-Sitzungscookie fehlt.');
  return { Cookie: cookie.split(';')[0] };
}

async function createPerson(role: 'admin' | 'member' = 'admin') {
  const email = `${crypto.randomUUID()}@example.test`;
  return required(await createAccount({ email, name: 'Musterperson', role, password }));
}

async function removePeople(...ids: string[]) {
  await db.unsafe('DELETE FROM api_tokens WHERE user_id=ANY($1::uuid[])', [ids]);
  await db.unsafe('DELETE FROM users WHERE id=ANY($1::uuid[])', [ids]);
}

function write(path: string, method: 'POST' | 'PATCH', body: object, headers: Record<string,string>) {
  return request(path, { method, headers: { ...jsonHeaders, ...headers }, body: JSON.stringify(body) });
}

function setBlocked(id: string, blocked: boolean, headers: Record<string,string>) {
  return write(`/users/${id}/access`, 'PATCH', { blocked }, headers);
}

test('Passwortwechsel betrifft nur das eigene Konto und nimmt keine API-Tokens an', async () => {
  const administrator = await createPerson();
  const member = await createPerson('member');
  try {
    const adminSession = sessionCookie(await login(administrator.email));
    const otherAdminSession = sessionCookie(await login(administrator.email));
    const memberSession = sessionCookie(await login(member.email));
    const token = await createToken(administrator,{label:'Schreibtest',scope:'write'});
    const bearer = {Authorization:`Bearer ${token.token}`};
    const change = {currentPassword:password,newPassword:crypto.randomUUID(),revokeOtherSessions:true};
    expect((await write('/me/password','PATCH',change,{})).status).toBe(401);
    expect((await write('/me/password','PATCH',change,{...adminSession,...bearer})).status).toBe(403);
    expect((await write('/me/password','PATCH',change,{...adminSession,Origin:'https://elsewhere.example.test'})).status).toBe(403);
    expect((await write('/me/password','PATCH',{...change,newPassword:'zu-kurz'},adminSession)).status).toBe(400);
    expect((await write('/me/password','PATCH',{...change,userId:member.id},adminSession)).status).toBe(400);
    const repeated = await write('/me/password','PATCH',{...change,newPassword:password},adminSession);
    expect(repeated.status).toBe(400);
    expect(await repeated.json()).toEqual({error:'Wähle ein anderes neues Passwort.'});
    expect(await status(otherAdminSession)).toBe(200);
    expect((await write('/me/password','PATCH',change,adminSession)).status).toBe(200);
    expect(await status(otherAdminSession)).toBe(401);
    expect((await login(member.email)).status).toBe(200);
    expect(await status(memberSession)).toBe(200);
    expect(await status(bearer)).toBe(200);
    const legacy = required(await first<{ password_hash:string }>(
      db,'SELECT password_hash FROM users WHERE id=$1',[administrator.id]));
    expect(await bunPassword.verify(change.newPassword,legacy.password_hash)).toBe(true);
    expect(await bunPassword.verify(password,legacy.password_hash)).toBe(false);
  } finally {
    await removePeople(administrator.id,member.id);
  }
});

test('Zwei gleichzeitige Passwortwechsel können dasselbe aktuelle Passwort nur einmal verwenden', async () => {
  const member = await createPerson('member');
  try {
    const firstSession = sessionCookie(await login(member.email));
    const secondSession = sessionCookie(await login(member.email));
    const responses = await Promise.all([firstSession,secondSession].map(headers=>
      write('/me/password','PATCH',{currentPassword:password,newPassword:crypto.randomUUID()},headers)));
    expect(responses.map(response=>response.status).sort()).toEqual([200,400]);
    expect(await status(firstSession)).toBe(200);
    expect(await status(secondSession)).toBe(200);
  } finally {
    await removePeople(member.id);
  }
});

test('Ein anders dargestelltes Passwort mit denselben UTF-8-Bytes gilt als bisheriges Passwort', async () => {
  const email = `${crypto.randomUUID()}@example.test`;
  const currentPassword = password + '\uFFFD';
  const person = required(await createAccount({email,name:'Musterperson',role:'member',password:currentPassword}));
  const signIn = () => write('/login','POST',{email,password:currentPassword},{});
  try {
    const current = sessionCookie(await signIn());
    const other = sessionCookie(await signIn());
    const result = await write('/me/password','PATCH',{
      currentPassword,newPassword:password + '\uD800',revokeOtherSessions:true,
    },current);
    expect(result.status).toBe(400);
    expect(await status(other)).toBe(200);
    expect((await signIn()).status).toBe(200);
  } finally {
    await removePeople(person.id);
  }
});

test('Kontosperre widerruft Sitzungen und API-Tokens auch über eine spätere Freigabe hinaus', async () => {
  const administrator = await createPerson();
  const target = await createPerson();
  const member = await createPerson('member');
  try {
    const admin = sessionCookie(await login(administrator.email));
    const targetSession = sessionCookie(await login(target.email));
    const memberSession = sessionCookie(await login(member.email));
    const read = await createToken(target, { label: 'Lesetest', scope: 'read' });
    const write = await createToken(target, { label: 'Schreibtest', scope: 'write' });
    const targetCredentials = [
      targetSession,
      { Authorization: `Bearer ${read.token}` },
      { Authorization: `Bearer ${write.token}` },
    ];
    for (const headers of targetCredentials) expect(await status(headers)).toBe(200);
    for (const headers of [memberSession, ...targetCredentials.slice(1)]) {
      expect((await setBlocked(target.id, true, headers)).status).toBe(403);
    }
    expect((await setBlocked(target.id, true, admin)).status).toBe(200);
    expect((await login(target.email)).status).toBe(401);
    await expect(createToken(target,{label:'Gesperrtes Konto',scope:'write'})).rejects.toMatchObject({status:401});
    for (const headers of targetCredentials) expect(await status(headers)).toBe(401);
    expect(await status(admin)).toBe(200);
    expect((await setBlocked(target.id, false, admin)).status).toBe(200);
    for (const headers of targetCredentials) expect(await status(headers)).toBe(401);
    expect(await status(sessionCookie(await login(target.email)))).toBe(200);
  } finally {
    await removePeople(administrator.id, target.id, member.id);
  }
});

test('Gesperrte Personen bleiben in bisherigen Aufgaben und Reservierungen erhalten', async () => {
  const administrator = await createPerson();
  const member = await createPerson('member');
  const contact = required(await first<{id:string}>(db,"INSERT INTO contacts(name) VALUES ('Muster Auftragsservice') RETURNING id"));
  try {
    const [project] = await db.unsafe<{id:string}[]>(
      "INSERT INTO projects(contact_id,name,stage) VALUES ($1,'Musteraufbau','confirmed') RETURNING id",[contact.id]);
    const headers = sessionCookie(await login(administrator.email));
    const assignment = { project_id:project.id, assignee_id:member.id, name:'Montage' };
    const assignmentResponse = await write('/tasks','POST',assignment,headers);
    expect(assignmentResponse.status).toBe(201);
    const task = await assignmentResponse.json();
    const period = { project_id:project.id, user_id:member.id, quantity:1 };
    const reserve = async (day: string) => {
      const response = await write('/reservations','POST',{
        ...period, starts_at:`${day}T08:00:00Z`, ends_at:`${day}T10:00:00Z`,
      },headers);
      expect(response.status).toBe(201);
      return response.json();
    };
    const kept = await reserve('2032-06-02');
    const released = await reserve('2032-06-03');
    expect((await setBlocked(member.id,true,headers)).status).toBe(200);
    expect((await request('/users',{headers})).status).toBe(200);
    expect(await (await request('/users',{headers})).json()).toEqual(expect.arrayContaining([
      expect.objectContaining({id:member.id,name:member.name,blocked:true}),
    ]));
    expect((await write('/tasks','POST',assignment,headers)).status).toBe(409);
    const changed = await write(`/tasks/${task.id}`,'PATCH',{name:'Überarbeitete Montage',assignee_id:member.id},headers);
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({assignee_id:member.id,name:'Überarbeitete Montage'});
    const withoutAssignee = await write('/tasks','POST',{project_id:project.id,name:'Logistik'},headers);
    expect(withoutAssignee.status).toBe(201);
    expect((await write(`/tasks/${(await withoutAssignee.json()).id}`,'PATCH',{assignee_id:member.id},headers)).status).toBe(409);
    expect((await write('/reservations','POST',{
      ...period,starts_at:'2032-06-04T08:00:00Z',ends_at:'2032-06-04T10:00:00Z',
    },headers)).status).toBe(409);
    expect((await write(`/reservations/${kept.id}`,'PATCH',{status:'firm'},headers)).status).toBe(409);
    const usable = await write(`/reservations/${released.id}`,'PATCH',{status:'released'},headers);
    expect(usable.status).toBe(200);
    expect(await usable.json()).toMatchObject({user_id:member.id,status:'released'});
    expect((await setBlocked(member.id,false,headers)).status).toBe(200);
    expect((await write(`/reservations/${kept.id}`,'PATCH',{status:'firm'},headers)).status).toBe(200);
  } finally {
    await db.unsafe('DELETE FROM reservations WHERE project_id IN (SELECT id FROM projects WHERE contact_id=$1)',[contact.id]);
    await db.unsafe('DELETE FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE contact_id=$1)',[contact.id]);
    await db.unsafe('DELETE FROM projects WHERE contact_id=$1',[contact.id]);
    await db.unsafe('DELETE FROM contacts WHERE id=$1',[contact.id]);
    await removePeople(administrator.id, member.id);
  }
});

async function waitForLock(key: number, mode: string, count: number) {
  for (let attempt=0; attempt<100; attempt++) {
    const waiting = await first<{ count: number }>(db,`SELECT count(*)::integer AS count FROM pg_locks
      WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
        AND classid=0 AND objid=$1 AND objsubid=1 AND mode=$2 AND NOT granted`, [key,mode]);
    if (waiting?.count === count) return;
    await Bun.sleep(20);
  }
  throw new Error(`Datenbank-Sperre ${key} wartet nicht wie erwartet.`);
}

test('Die Sperre widerruft parallel ausgestellte Sitzungen und Schreib-Tokens', async () => {
  const administrator = await createPerson();
  const target = await createPerson();
  const trigger = `team_access_${crypto.randomUUID().replaceAll('-','')}`;
  const hold = 61375;
  const pending: Promise<Response>[] = [];
  try {
    const admin = sessionCookie(await login(administrator.email));
    const targetSession = sessionCookie(await login(target.email));
    await db.unsafe(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF COALESCE(to_jsonb(NEW)->>'userId', to_jsonb(NEW)->>'user_id')=TG_ARGV[0] THEN
          PERFORM pg_advisory_xact_lock_shared(${hold});
        END IF;
        RETURN NEW;
      END;
      $$`).simple();
    for (const table of ['auth_sessions','api_tokens']) {
      await db.unsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON ${table}
        FOR EACH ROW EXECUTE FUNCTION ${trigger}('${target.id}')`).simple();
    }
    await db.begin(async transaction=>{
      await transaction.unsafe('SELECT pg_advisory_xact_lock($1)',[hold]);
      pending.push(login(target.email),write('/tokens','POST',{ label:'Team-Zugriff', scope:'write' },targetSession));
      await waitForLock(hold,'ShareLock',2);
      pending.push(setBlocked(target.id,true,admin));
      await waitForLock(61275,'ExclusiveLock',1);
    });
    const [issuedSession,issuedToken,suspension] = await Promise.all(pending);
    const cookie = sessionCookie(issuedSession);
    expect(issuedToken.status).toBe(201);
    const token = { Authorization:`Bearer ${(await issuedToken.json()).token}` };
    expect(suspension.status).toBe(200);
    expect((await setBlocked(target.id,false,admin)).status).toBe(200);
    expect(await status(cookie)).toBe(401);
    expect(await status(token)).toBe(401);
    expect((await write('/tokens','POST',{label:'Veraltete Sitzung',scope:'write'},targetSession)).status).toBe(401);
  } finally {
    await Promise.allSettled(pending);
    await db.unsafe(`DROP FUNCTION IF EXISTS ${trigger}() CASCADE`);
    await removePeople(administrator.id, target.id);
  }
}, 15_000);

test('Zwei gleichzeitige Sperrversuche lassen mindestens eine Administration aktiv', async () => {
  const [one,two] = [await createPerson(),await createPerson()];
  const others = await db.unsafe<{ id:string }[]>(
    "UPDATE users SET blocked=true WHERE role='admin' AND NOT blocked AND id NOT IN ($1,$2) RETURNING id",[one.id,two.id]);
  try {
    const firstSession = sessionCookie(await login(one.email));
    const secondSession = sessionCookie(await login(two.email));
    const outcomes = await Promise.all([
      setBlocked(two.id,true,firstSession),
      setBlocked(one.id,true,secondSession),
    ]);
    expect(outcomes.map(response=>response.status).sort()).toEqual([200,401]);
    expect([await status(firstSession),await status(secondSession)].sort()).toEqual([200,401]);
    const active = await first<{id:string}>(db,"SELECT id FROM users WHERE role='admin' AND NOT blocked");
    const surviving = active?.id === one.id ? firstSession : secondSession;
    expect((await setBlocked(active!.id,true,surviving)).status).toBe(409);
  } finally {
    await db.unsafe('UPDATE users SET blocked=false WHERE id=ANY($1::uuid[])',[others.map(row=>row.id)]);
    await removePeople(one.id,two.id);
  }
});
