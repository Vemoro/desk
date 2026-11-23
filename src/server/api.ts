import { z } from 'zod';
import { db, first, rows } from './db';
import { DeskError, required } from './errors';
import { accountInput, authenticate, createAccount, createToken, login, loginInput, logout, protectOrigin, requireAdmin, sessionCookie, tokenInput, type Actor } from './auth';
import { schemas, id, projectStage, reservationInput, reservationStatus, movementInput, costBatch, costAssignment, habenOfferInput, habenContactInput, zammadLinkInput, zammadCreateInput, zammadMessage } from './contracts';
import { assignCost, changeStage, controlling, getCore, getProject, importCosts, listCore, listCosts, saveCore, type Collection } from './core';
import { createMovement, createReservation, listMovements, listReservations, listStock, setReservation } from './stock';
import { pullContacts, syncContact, syncOffer } from './haben';
import { conversations, linkTicket, reviewOutgoing, send } from './zammad';
import { integrationStatus } from './remote';

type Context = { actor: Actor; path: string[]; limit: number; offset: number };
type Operation = { method: string; path: string; summary: string; run: (context: Context, input: unknown) => Promise<unknown>; input?: z.ZodType };
const operations: Operation[] = [];

function get(path: string, summary: string, run: (context: Context) => Promise<unknown>) {
  operations.push({ method: 'GET', path, summary, run });
}

function action<T>(method: 'POST'|'PATCH', path: string, summary: string, input: z.ZodType<T>, run: (context: Context, input: T) => Promise<unknown>) {
  operations.push({ method,path,summary,input,run:(context,value)=>run(context,input.parse(value)) });
}

for (const name of Object.keys(schemas) as Collection[]) {
  const schema = schemas[name];
  const path = `/${name}`;
  get(path,'Einträge auflisten',({limit,offset})=>listCore(name,limit,offset));
  get(`${path}/{id}`,'Eintrag lesen',({path})=>getCore(name,path[1]));
  action('POST',path,'Eintrag anlegen',schema,(context,input)=>saveCore(name,input));
  action('PATCH',`${path}/{id}`,'Eintrag ändern',schema.partial(),({path},input)=>saveCore(name,input,path[1]));
}
get('/me','Aktuelles Konto',async ({actor})=>actor);
get('/integrations','Konfigurierte Integrationen',async()=>integrationStatus());
get('/users','Team auflisten',()=>rows(db,'SELECT id,name,role FROM users ORDER BY name,id'));
action('POST','/users','Teamkonto anlegen',accountInput,({actor},input)=>{
  requireAdmin(actor);
  return createAccount(input);
});
get('/tokens','API-Tokens auflisten',({actor})=>{
  requireAdmin(actor);
  return rows(db,'SELECT id,label,scope,created_at FROM api_tokens ORDER BY created_at DESC');
});
action('POST','/tokens','API-Token erzeugen',tokenInput,({actor},input)=>createToken(actor,input));
operations.push({ method:'DELETE', path:'/tokens/{id}', summary:'API-Token widerrufen', async run({ actor,path }) {
  requireAdmin(actor);
  return required(await first(db,'DELETE FROM api_tokens WHERE id=$1 RETURNING id',[path[1]]));
}});
action('PATCH','/projects/{id}/stage','Projektstatus ändern',projectStage,({path},input)=>changeStage(path[1],input.stage));
get('/projects/{id}/controlling','Plan- und Ist-Kosten',({path})=>controlling(path[1]));
get('/projects/{id}/offer-positions','Verkaufspositionen für das Angebot',async ({path})=>{
  await getProject(path[1]);
  return rows(db,"SELECT name,quantity,unit_cents FROM lines WHERE project_id=$1 AND kind='sell' ORDER BY id",[path[1]]);
});
get('/reservations','Reservierungen auflisten',({limit,offset})=>listReservations(limit,offset));
action('POST','/reservations','Ressource vormerken',reservationInput,(context,input)=>createReservation(input));
action('PATCH','/reservations/{id}','Reservierung festlegen oder freigeben',reservationStatus,({path},input)=>setReservation(path[1],input.status));
get('/stock','Lagerbestand je Lagerort',()=>listStock());
get('/movements','Lagerbewegungen',({limit,offset})=>listMovements(limit,offset));
action('POST','/movements','Lagerbewegung erfassen',movementInput,({actor},input)=>createMovement(input,actor.id));
get('/costs','Ist-Kosten und offene Zuordnungen',({limit,offset})=>listCosts(limit,offset));
action('POST','/costs','Ist-Kosten übernehmen',costBatch,(context,input)=>importCosts(input.entries));
action('PATCH','/costs/{id}','Ist-Kosten einem Projekt zuordnen',costAssignment,({path},input)=>assignCost(path[1],input.project_id));
action('POST','/haben/contacts/import','Neue Haben-Kontakte importieren',z.strictObject({}),()=>pullContacts());
action('POST','/contacts/{id}/haben','Kontakt mit Haben abgleichen',habenContactInput,({path},input)=>syncContact(path[1],input));
action('POST','/projects/{id}/haben-offer','Haben-Angebot verknüpfen oder aktualisieren',habenOfferInput.partial(),({path},input)=>syncOffer(path[1],input.id));
get('/projects/{id}/zammad','Ticket, Verlauf und Desk-Sendeversuche',({path})=>conversations(path[1]));
action('POST','/projects/{id}/zammad/link','Zammad-Ticket verknüpfen',zammadLinkInput,({path},input)=>linkTicket(path[1],input.id));
action('POST','/projects/{id}/zammad/tickets','Zammad-Ticket anlegen',zammadCreateInput,({path},input)=>linkTicket(path[1],input));
action('POST','/projects/{id}/zammad/messages','Zammad-Antwort senden',zammadMessage,({path},input)=>send(path[1],input));
action('POST','/projects/{id}/zammad/outgoing/{messageId}','Sendeversuch prüfen oder ausdrücklich erneut senden',
  z.strictObject({ retry:z.boolean() }),({path},input)=>reviewOutgoing(path[1],path[4],input.retry));

const pageSchema = z.object({ limit:z.coerce.number().int().min(1).max(200).default(100), offset:z.coerce.number().int().min(0).max(1_000_000).default(0) });
const headers = { 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff' };
const json = (value: unknown, status = 200, extra: Record<string,string> = {}) =>
  Response.json(value,{ status,headers:{ ...headers,...extra } });

async function readJson(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new DeskError(415,'JSON ist erforderlich.');
  const reader = request.body?.getReader();
  if (!reader) throw new DeskError(400,'JSON fehlt.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > 7_200_000) {
      await reader.cancel();
      throw new DeskError(413,'Die Anfrage ist zu groß.');
    }
    chunks.push(next.value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new DeskError(400,'Ungültiges JSON.'); }
}

function match(template: string, path: string[]) {
  const parts = template.slice(1).split('/');
  return parts.length === path.length && parts.every((part,index)=>
    part.startsWith('{') ? id.safeParse(path[index]).success : part === path[index]);
}

export async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname.slice('/api/v1/'.length).split('/');
    if (request.method === 'GET' && url.pathname === '/api/v1/openapi.json') return json(openApi());
    protectOrigin(request);
    if (request.method === 'POST' && url.pathname === '/api/v1/login') {
      const value = await login(loginInput.parse(await readJson(request)),url.hostname);
      return json({ ok:true },200,{ 'Set-Cookie':sessionCookie(request,value,43_200) });
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/logout') {
      await logout(request);
      return json({ok:true},200,{ 'Set-Cookie':sessionCookie(request,'',0) });
    }
    const actor = await authenticate(request);
    const route = operations.find((operation)=>operation.method === request.method && match(operation.path,path));
    if (!route) throw new DeskError(404,'API-Endpunkt nicht gefunden.');
    const pagination = pageSchema.parse(Object.fromEntries(url.searchParams));
    const result = await route.run({actor,path,...pagination},route.input ? await readJson(request) : undefined);
    return json(result,route.method === 'POST' ? 201 : 200);
  } catch (error) {
    if (error instanceof DeskError) return json({ error:error.message },error.status);
    if (error instanceof z.ZodError) return json({ error:error.issues.map((issue)=>`${issue.path.join('.') || 'Eingabe'}: ${issue.message}`).join('; ') },400);
    const databaseError = error as { errno?:string; code?:string };
    const sqlState = databaseError.errno ?? databaseError.code;
    if (sqlState === '23505') return json({error:'Dieser Wert oder diese Zuordnung ist bereits vorhanden.'},409);
    if (sqlState === '23503' || sqlState === '23514') return json({error:'Unzulässige Zuordnung oder ungültiger Wert.'},409);
    console.error('Desk API:', error instanceof Error ? error.name : 'Unbekannter Fehler', databaseError.code ?? '');
    return json({error:'Interner Fehler.'},500);
  }
}

function openApi() {
  const paths: Record<string,Record<string,unknown>> = {};
  for (const op of operations) {
    (paths[op.path] ??= {})[op.method.toLowerCase()] = {
      summary:op.summary,
      security:[{token:[]}],
      parameters:[...op.path.matchAll(/\{(\w+)\}/g)].map(([,name])=>({name,in:'path',required:true,schema:{type:'string',format:'uuid'}})),
      ...(op.input ? { requestBody:{ required:true,content:{'application/json':{schema:z.toJSONSchema(op.input,{target:'openapi-3.0',io:'input'})}} } } : {}),
      responses:{ [op.method === 'POST' ? '201' : '200']:{description:'Erfolg'}, 400:{description:'Ungültige Eingabe'},
        401:{description:'Anmeldung erforderlich'},403:{description:'Zugriff verweigert'},409:{description:'Konflikt'} },
    };
  }
  return { openapi:'3.1.0',info:{title:'Desk API',version:'1.0.0'},servers:[{url:'/api/v1'}],paths,
    components:{securitySchemes:{token:{type:'http',scheme:'bearer'}}} };
}
