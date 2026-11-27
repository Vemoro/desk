import { beforeAll, expect, test } from 'bun:test';

const database=process.env.DATABASE_URL;
if(!database || !new URL(database).pathname.endsWith('_test')) {
  throw new Error('Tests benötigen eine isolierte DATABASE_URL mit Endung _test.');
}

const { handle }=await import('../src/server/api');
const { createAccount,createToken }=await import('../src/server/auth');
const { saveCore }=await import('../src/server/core');
const { db,rows }=await import('../src/server/db');
const { kanbanMoveResponse,kanbanTaskResponse }=await import('../src/server/contracts');
const { fixture }=await import('./fixture');

type Card = {id:string;project_id:string;name:string;status:string;kanban_position:number};

let writeToken:string;
let readToken:string;
beforeAll(async()=>{
  const actor=(await createAccount({
    name:'Muster Kanban',email:`kanban-${crypto.randomUUID()}@example.test`,password:'muster-test-passwort',role:'admin',
  }))!;
  writeToken=(await createToken(actor,{label:'Muster Kanban schreiben',scope:'write'})).token;
  readToken=(await createToken(actor,{label:'Muster Kanban lesen',scope:'read'})).token;
});

function request(path:string,method='GET',body?:unknown,token=writeToken) {
  return handle(new Request(`http://desk.local/api/v1${path}`,{
    method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body),
  }));
}

async function createTask(projectId:string,name:string,status='todo') {
  const response=await request('/tasks','POST',{project_id:projectId,name,status});
  expect(response.status).toBe(201);
  const card=await response.json() as Card;
  expect(card).not.toHaveProperty('kanban_position');
  return card;
}

async function column(projectId:string,status:string) {
  const response=await request('/tasks/kanban');
  expect(response.status).toBe(200);
  const tasks=await response.json() as Card[];
  const cards=tasks.filter(task=>task.project_id===projectId && task.status===status);
  for(const card of cards) expect(Number.isSafeInteger(card.kanban_position)).toBe(true);
  expect(new Set(cards.map(card=>card.kanban_position)).size).toBe(cards.length);
  return cards.sort((left,right)=>left.kanban_position-right.kanban_position).map(card=>card.id);
}

test('Die Migration übernimmt die bisher sichtbare Reihenfolge aus dem Altbestand',async()=>{
  await db.begin(async transaction=>{
    const schema=`kanban_upgrade_${crypto.randomUUID().replaceAll('-','')}`;
    await transaction.unsafe(`CREATE SCHEMA ${schema}`);
    await transaction.unsafe("SELECT set_config('search_path',$1,true)",[schema]);
    await transaction.unsafe(await Bun.file(new URL('../migrations/001_core.sql',import.meta.url)).text()).simple();
    await transaction.unsafe(`INSERT INTO contacts (id,name) VALUES ('10000000-0000-4000-8000-000000000001','Musterkontakt');
      INSERT INTO projects (id,name,contact_id) VALUES
      ('20000000-0000-4000-8000-000000000001','Musterauftrag A','10000000-0000-4000-8000-000000000001'),
      ('20000000-0000-4000-8000-000000000002','Musterauftrag B','10000000-0000-4000-8000-000000000001');
      INSERT INTO tasks (id,project_id,name,status,due) VALUES
      ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Zulu','todo','2030-01-02'),
      ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Alpha','todo',NULL),
      ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Alpha','todo',NULL),
      ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','Prüfen','review',NULL),
      ('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','Zweiter Auftrag','todo',NULL);
    `).simple();
    await transaction.unsafe(await Bun.file(new URL('../migrations/010_kanban_order.sql',import.meta.url)).text()).simple();
    const migrated=await rows<{name:string;due:string|null;kanban_position:number}>(transaction,
      'SELECT t.name,t.due::text,p.position AS kanban_position FROM tasks t JOIN kanban_positions p ON p.task_id=t.id ORDER BY t.id');
    expect(migrated).toEqual([
      {name:'Alpha',due:null,kanban_position:1},
      {name:'Alpha',due:null,kanban_position:2},
      {name:'Zulu',due:'2030-01-02',kanban_position:3},
      {name:'Prüfen',due:null,kanban_position:1},
      {name:'Zweiter Auftrag',due:null,kanban_position:1},
    ]);
    await transaction.unsafe(`DROP SCHEMA ${schema} CASCADE`);
  });
});

test('Kanban-Positionen bleiben getrennt von der bisherigen Aufgabenliste',async()=>{
  const {project}=await fixture(saveCore,'Muster Kanban-Reihenfolge');
  const earlier=await createTask(project,'Zulu');
  const later=await createTask(project,'Alpha');
  const review=await createTask(project,'Geprüft','review');
  expect((await request(`/tasks/${earlier.id}`,'PATCH',{due:'2030-01-02'})).status).toBe(200);

  const missingProject=await request('/tasks','POST',{project_id:crypto.randomUUID(),name:'Ohne Projekt'});
  expect(missingProject.status).toBe(409);
  expect(await missingProject.json()).toEqual({error:'Unzulässige Zuordnung oder ungültiger Wert.'});

  const legacy=await request('/tasks');
  expect(legacy.status).toBe(200);
  const oldItems=(await legacy.json() as Card[]).filter(task=>task.project_id===project);
  expect(oldItems.map(task=>task.name)).toEqual(['Alpha','Geprüft','Zulu']);
  for(const card of oldItems) expect(card).not.toHaveProperty('kanban_position');
  expect(await column(project,'todo')).toEqual([earlier.id,later.id]);
  const snapshot=await request('/tasks/kanban');
  expect(kanbanTaskResponse.array().safeParse(await snapshot.json()).success).toBe(true);

  const moved=await request(`/projects/${project}/kanban/${later.id}`,'PATCH',{
    status:'todo',before_task_id:earlier.id,
  });
  expect(moved.status).toBe(200);
  expect(kanbanMoveResponse.parse(await moved.json())).toEqual({id:later.id,status:'todo',kanban_position:1});
  expect(await column(project,'todo')).toEqual([later.id,earlier.id]);

  const renamed=await request(`/tasks/${later.id}`,'PATCH',{name:'Zuletzt',status:'todo'});
  expect(renamed.status).toBe(200);
  expect(await renamed.json()).not.toHaveProperty('kanban_position');
  expect(await column(project,'todo')).toEqual([later.id,earlier.id]);

  expect((await request(`/tasks/${later.id}`,'PATCH',{status:'review'})).status).toBe(200);
  expect(await column(project,'todo')).toEqual([earlier.id]);
  expect(await column(project,'review')).toEqual([review.id,later.id]);
});

test('Gleichzeitige Neuanlagen und Verschiebungen lassen keine Karten aus',async()=>{
  const {project}=await fixture(saveCore,'Muster Kanban gleichzeitig');
  const {project:other}=await fixture(saveCore,'Muster Kanban zweites Projekt');
  const anchor=await createTask(project,'Zielkarte','doing');
  const foreign=await createTask(other,'Karte des zweiten Projekts','doing');
  const card=await createTask(project,'Vorbereitung');
  const move=(before_task_id:string,token=writeToken)=>request(`/projects/${project}/kanban/${card.id}`,'PATCH',{
    status:'doing',before_task_id,
  },token);

  expect((await move(anchor.id,readToken)).status).toBe(403);
  expect((await move(foreign.id)).status).toBe(409);
  expect(await column(project,'todo')).toEqual([card.id]);
  expect(await column(project,'doing')).toEqual([anchor.id]);

  const [moved,created]=await Promise.all([move(anchor.id),createTask(project,'Nachbereitung','doing')]);
  expect(moved.status).toBe(200);
  expect(await column(project,'todo')).toEqual([]);
  expect(await column(project,'doing')).toEqual([card.id,anchor.id,created.id]);
  expect(await column(other,'doing')).toEqual([foreign.id]);
});

test('Ein Statuswechsel im älteren Stand übernimmt keine fremde Spaltenposition',async()=>{
  const {project}=await fixture(saveCore,'Muster Kanban Wiederanlauf');
  const previous=await createTask(project,'Alter Vorgang');
  const target=await createTask(project,'Bereits in Arbeit','doing');
  const [legacy]=await rows<Record<string,unknown>>(db,"UPDATE tasks SET status='doing' WHERE id=$1 RETURNING *",[previous.id]);
  expect(legacy).not.toHaveProperty('kanban_position');

  const response=await request('/tasks/kanban');
  const cards=await response.json() as (Omit<Card,'kanban_position'>&{kanban_position:number|null})[];
  expect(cards.find(card=>card.id===previous.id)?.kanban_position).toBeNull();
  const appended=await createTask(project,'Neuer Vorgang','doing');
  expect(await column(project,'doing')).toEqual([target.id,previous.id,appended.id]);

  await db.unsafe("UPDATE tasks SET status='todo' WHERE id=$1",[previous.id]);
  await db.unsafe("UPDATE tasks SET status='doing' WHERE id=$1",[previous.id]);
  const returned=await request('/tasks/kanban');
  const restarted=await returned.json() as (Omit<Card,'kanban_position'>&{kanban_position:number|null})[];
  expect(restarted.find(card=>card.id===previous.id)?.kanban_position).toBeNull();
});

test('Die Kanban-Liste liefert auch über einer Standardseite einen vollständigen Stand',async()=>{
  const {project}=await fixture(saveCore,'Muster großes Kanban');
  await db.unsafe(`WITH inserted AS (
    INSERT INTO tasks (project_id,name) SELECT $1,'Karte '||lpad(row::text,3,'0') FROM generate_series(1,201) row
    RETURNING id,name
  ) INSERT INTO kanban_positions (task_id,position)
    SELECT id,row_number() OVER(ORDER BY name)::integer FROM inserted`,[project]);
  const initial=await column(project,'todo');
  expect(initial).toHaveLength(201);
  const moved=await request(`/projects/${project}/kanban/${initial[200]}`,'PATCH',{
    status:'todo',before_task_id:initial[0],
  });
  expect(moved.status).toBe(200);
  expect(await column(project,'todo')).toEqual([initial[200],...initial.slice(0,200)]);
});
