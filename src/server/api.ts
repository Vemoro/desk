import { z } from 'zod';
import { databaseReady, db, first, rows, type Query } from './db';
import { DeskError, required } from './errors';
import { accountInput, authenticate, createAccount, createToken, login, loginInput, logout, protectOrigin, requireAdmin, tokenInput, type Actor } from './auth';
import { accountAccessInput, changeAccountAccess, withAccountAccess } from './accounts';
import { schemas, id, projectResponse, projectStage, reservationInput, reservationStatus, movementInput, movementCorrection, costBatch, costAssignment, habenOfferInput, habenContactInput, zammadLinkInput, zammadCreateInput, zammadMessage } from './contracts';
import { assignCost, changeStage, controlling, getCore, getProject, importCosts, listCore, listCosts, saveCore, type Collection } from './core';
import { correctMovement, createMovement, createReservation, listMovements, listReservations, listStock, setReservation } from './stock';
import { pullContacts, syncContact, syncOffer } from './haben';
import { checkZammadConnection, conversations, linkTicket, reviewOutgoing, send, unlinkTicket } from './zammad';
import { integrationStatus } from './remote';
import { readJson } from './request-body';

type Context = { actor: Actor; path: string[]; limit: number; offset: number; requestKey?:string; query: Query };
type Operation = {
  method: string;
  path: string;
  summary: string;
  run: (context: Context, input: unknown) => Promise<unknown>;
  input?: z.ZodType;
  response?: z.ZodType;
  keyed?: boolean;
  adminSession?: boolean;
  accountAccess?: 'shared' | 'exclusive';
  pageOrder?: string;
};
const operations: Operation[] = [];
const requestKeyHeader='Idempotency-Key';
const requestKeySchema=z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional();

function get(path: string, summary: string, run: (context: Context) => Promise<unknown>, options: Pick<Operation,'adminSession'|'pageOrder'|'response'> = {}) {
  operations.push({ method: 'GET', path, summary, run, ...options });
}

function action<T>(method: 'POST'|'PATCH', path: string, summary: string, input: z.ZodType<T>, run: (context: Context, input: T) => Promise<unknown>, options: Pick<Operation,'keyed'|'adminSession'|'accountAccess'> = {}) {
  operations.push({ method,path,summary,input,...options,run:(context,value)=>run(context,input.parse(value)) });
}

for (const name of Object.keys(schemas) as Collection[]) {
  const schema = schemas[name];
  const path = `/${name}`;
  get(path,'Einträge auflisten',({limit,offset})=>listCore(name,limit,offset),
    {pageOrder:name==='lines' ? 'Art, Name, ID' : 'Name, ID',response:name==='projects' ? z.array(projectResponse) : undefined});
  get(`${path}/{id}`,'Eintrag lesen',({path})=>getCore(name,path[1]),
    {response:name==='projects' ? projectResponse : undefined});
  action('POST',path,'Eintrag anlegen',schema,(context,input)=>saveCore(name,input));
  action('PATCH',`${path}/{id}`,'Eintrag ändern',schema.partial(),({path},input)=>saveCore(name,input,path[1]));
}
operations.push({ method:'DELETE', path:'/lines/{id}', summary:'Kalkulationsposition entfernen', async run({ path }) {
  return required(await first(db,'DELETE FROM lines WHERE id=$1 RETURNING id',[path[1]]));
}});
get('/me','Aktuelles Konto',async ({actor})=>actor);
get('/integrations','Konfigurierte Integrationen',async()=>integrationStatus());
action('POST','/integrations/zammad/check','Zammad-Verbindung mit einem bestehenden Ticket prüfen (Administratorsitzung)',
  zammadLinkInput,({actor},input)=>{
    requireAdmin(actor);
    return checkZammadConnection(input.id);
  },{adminSession:true});
get('/users','Team auflisten',()=>rows(db,'SELECT id,name,role,blocked FROM users ORDER BY name,id'));
action('POST','/users','Teamkonto anlegen',accountInput,({actor},input)=>{
  requireAdmin(actor);
  return createAccount(input);
},{adminSession:true});
action('PATCH','/users/{id}/access','Teamkonto sperren oder freigeben',accountAccessInput,({actor,path,query},input)=>{
  requireAdmin(actor);
  return changeAccountAccess(query,path[1],input.blocked);
},{adminSession:true,accountAccess:'exclusive'});
get('/tokens','API-Tokens auflisten',({actor})=>{
  requireAdmin(actor);
  return rows(db,'SELECT id,label,scope,created_at FROM api_tokens ORDER BY created_at DESC');
},{adminSession:true});
action('POST','/tokens','API-Token erzeugen',tokenInput,({actor,query},input)=>createToken(actor,input,query),
  {adminSession:true,accountAccess:'shared'});
operations.push({ method:'DELETE', path:'/tokens/{id}', summary:'API-Token widerrufen', adminSession:true, async run({ actor,path }) {
  requireAdmin(actor);
  return required(await first(db,'DELETE FROM api_tokens WHERE id=$1 RETURNING id',[path[1]]));
}});
action('PATCH','/projects/{id}/stage','Projektstatus ändern',projectStage,({path},input)=>changeStage(path[1],input.stage));
get('/projects/{id}/controlling','Plan- und Ist-Kosten',({path})=>controlling(path[1]));
get('/projects/{id}/offer-positions','Verkaufspositionen für das Angebot',async ({path})=>{
  await getProject(path[1]);
  return rows(db,"SELECT name,quantity,unit_cents FROM lines WHERE project_id=$1 AND kind='sell' ORDER BY id",[path[1]]);
});
get('/reservations','Reservierungen auflisten',({limit,offset})=>listReservations(limit,offset),
  {pageOrder:'Startzeit, bei gleichem Start Personal vor Geräten und Material, ID'});
action('POST','/reservations','Ressource vormerken',reservationInput,({actor,requestKey},input)=>
  createReservation(input,requestKey ? {actorId:actor.id,key:requestKey} : undefined),{keyed:true});
action('PATCH','/reservations/{id}','Reservierung festlegen oder freigeben',reservationStatus,({path},input)=>setReservation(path[1],input.status));
get('/stock','Lagerbestand je Lagerort',()=>listStock());
get('/movements','Lagerbewegungen',({limit,offset})=>listMovements(limit,offset),{pageOrder:'Zeitpunkt absteigend, ID'});
action('POST','/movements','Lagerbewegung erfassen',movementInput,({actor,requestKey},input)=>createMovement(input,actor.id,requestKey),{keyed:true});
action('POST','/movements/{id}/corrections','Wareneingang oder Verbrauch korrigieren',movementCorrection,({path,actor,requestKey},input)=>
  correctMovement(path[1],input,actor.id,requestKey),{keyed:true});
get('/costs','Ist-Kosten und offene Zuordnungen',({limit,offset})=>listCosts(limit,offset),
  {pageOrder:'Nicht zugeordnete Kosten zuerst, Name, ID'});
action('POST','/costs','Ist-Kosten übernehmen',costBatch,(context,input)=>importCosts(input.entries));
action('PATCH','/costs/{id}','Ist-Kosten einem Projekt zuordnen',costAssignment,({path},input)=>assignCost(path[1],input.project_id));
action('POST','/haben/contacts/import','Neue Haben-Kontakte importieren',z.strictObject({}),()=>pullContacts());
action('POST','/contacts/{id}/haben','Kontakt mit Haben abgleichen',habenContactInput,({path},input)=>syncContact(path[1],input));
action('POST','/projects/{id}/haben-offer','Haben-Angebot verknüpfen oder aktualisieren',habenOfferInput.partial(),({path},input)=>syncOffer(path[1],input.id));
get('/projects/{id}/zammad','Ticket, Verlauf und Desk-Sendeversuche',({path})=>conversations(path[1]));
action('POST','/projects/{id}/zammad/link','Zammad-Ticket verknüpfen',zammadLinkInput,({path},input)=>linkTicket(path[1],input.id));
action('POST','/projects/{id}/zammad/unlink','Zammad-Ticketverknüpfung lösen',zammadLinkInput,({path},input)=>unlinkTicket(path[1],input.id));
action('POST','/projects/{id}/zammad/tickets','Zammad-Ticket anlegen',zammadCreateInput,({path},input)=>linkTicket(path[1],input));
action('POST','/projects/{id}/zammad/messages','Zammad-Antwort senden',zammadMessage,({path},input)=>send(path[1],input));
action('POST','/projects/{id}/zammad/outgoing/{messageId}','Sendeversuch prüfen oder ausdrücklich erneut senden',
  z.strictObject({ retry:z.boolean() }),({path},input)=>reviewOutgoing(path[1],path[4],input.retry));

const limitBounds = {minimum:1,maximum:200,default:100};
const offsetBounds = {minimum:0,maximum:1_000_000,default:0};
const pageSchema = z.object({
  limit:z.coerce.number().int().min(limitBounds.minimum).max(limitBounds.maximum).default(limitBounds.default),
  offset:z.coerce.number().int().min(offsetBounds.minimum).max(offsetBounds.maximum).default(offsetBounds.default),
});
const headers = { 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff' };
const json = (value: unknown, status = 200, extra: Record<string,string> = {}) =>
  Response.json(value,{ status,headers:{ ...headers,...extra } });

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
    if (request.method === 'GET' && url.pathname === '/api/v1/ready') {
      const ready = await databaseReady();
      return json({ready},ready?200:503);
    }
    protectOrigin(request);
    if (request.method === 'POST' && ['/api/v1/login','/api/v1/logout'].includes(url.pathname)) {
      const cookies = url.pathname === '/api/v1/login'
        ? await login(loginInput.parse(await readJson(request)),request)
        : await logout(request);
      const response = json({ok:true});
      for (const cookie of cookies.getSetCookie()) response.headers.append('Set-Cookie',cookie);
      return response;
    }
    const route = operations.find((operation)=>operation.method === request.method && match(operation.path,path));
    async function dispatch(query: Query, body?: () => unknown) {
      const actor = await authenticate(request,query);
      if (!route) throw new DeskError(404,'API-Endpunkt nicht gefunden.');
      const pagination = pageSchema.parse(Object.fromEntries(url.searchParams));
      const requestKey=route.keyed ? requestKeySchema.parse(request.headers.get(requestKeyHeader) ?? undefined) : undefined;
      const input=route.input ? (body ? body() : await readJson(request)) : undefined;
      const result = await route.run({actor,path,...pagination,requestKey,query},input);
      return json(result,route.method === 'POST' ? 201 : 200);
    }
    if (!route?.accountAccess) return await dispatch(db);
    // Read the body before taking the lock, but report authentication errors first.
    const body = await readJson(request).then(value=>()=>value, error=>()=>{throw error;});
    return await withAccountAccess(route.accountAccess, query=>dispatch(query,body));
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
  const paths: Record<string,Record<string,unknown>> = {
    '/ready':{get:{summary:'Bereitschaft des Dienstes',security:[],
      responses:{200:{description:'Bereit'},503:{description:'Nicht bereit'}}}},
  };
  const sessions=[{secureSession:[]},{session:[]}];
  for (const op of operations) {
    const pathParameters = [...op.path.matchAll(/\{(\w+)\}/g)]
      .map(([,name])=>({name,in:'path',required:true,schema:{type:'string',format:'uuid'}}));
    const pageParameters = op.pageOrder ? [
      {name:'limit',in:'query',description:'Höchstzahl der Einträge pro Seite.',schema:{type:'integer',...limitBounds}},
      {name:'offset',in:'query',description:'Anzahl der zu überspringenden Einträge.',schema:{type:'integer',...offsetBounds}},
    ] : [];
    (paths[op.path] ??= {})[op.method.toLowerCase()] = {
      summary:op.summary,
      security:op.adminSession ? sessions : [...sessions,{token:[]}],
      ...(op.adminSession ? {description:'Diese Aktion erfordert eine Sitzung mit der Rolle Administration.'} : {}),
      ...(op.pageOrder ? {description:`Reihenfolge (${op.pageOrder}). Eine Seite mit weniger Einträgen als limit oder eine leere Seite beendet die Abfrage. Liegt der nächste offset über der Obergrenze, endet der Abruf möglicherweise vor dem Listenende. Änderungen zwischen Seiten können Einträge verschieben.`} : {}),
      parameters:[
        ...pathParameters,
        ...pageParameters,
        ...(op.keyed ? [{name:requestKeyHeader,in:'header',required:false,schema:z.toJSONSchema(requestKeySchema.unwrap()),
          description:'Für Wiederholungen derselben Eingabe beibehalten. Ein Schlüssel gilt pro Konto und Endpunkt. Desk liefert die ursprüngliche Antwort, bei geänderter Eingabe HTTP 409.'}] : []),
      ],
      ...(op.input ? { requestBody:{ required:true,content:{'application/json':{schema:z.toJSONSchema(op.input,{target:'draft-2020-12',io:'input'})}} } } : {}),
      responses:{ [op.method === 'POST' ? '201' : '200']:{
        description:'Erfolg',
        ...(op.response ? {content:{'application/json':{schema:z.toJSONSchema(op.response,{target:'draft-2020-12',io:'output'})}}} : {}),
      }, 400:{description:'Ungültige Eingabe'},
        401:{description:'Anmeldung erforderlich'},403:{description:'Zugriff verweigert'},409:{description:'Konflikt'} },
    };
  }
  return { openapi:'3.1.0',info:{title:'Desk API',version:'1.0.0'},servers:[{url:'/api/v1'}],paths,
    components:{securitySchemes:{token:{type:'http',scheme:'bearer',
      description:'Ein Lese-Token erlaubt Lesezugriffe. Schreibzugriffe erfordern ein Schreib-Token.'},
      session:{type:'apiKey',in:'cookie',name:'desk-auth.session_token'},
      secureSession:{type:'apiKey',in:'cookie',name:'__Secure-desk-auth.session_token'},
    }} };
}
