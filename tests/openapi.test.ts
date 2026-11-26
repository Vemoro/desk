import { expect, test } from 'bun:test';
import { Validator } from '@seriousme/openapi-schema-validator';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { z } from 'zod';
import { handle } from '../src/server/api';
import { createAccount,createToken } from '../src/server/auth';
import { saveCore } from '../src/server/core';
import { db } from '../src/server/db';

function* entries(value:unknown,path=''): Generator<[string,unknown]> {
  yield [path,value];
  if(!value || typeof value!=='object') return;
  for(const [key,child] of Object.entries(value)) {
    yield* entries(child,`${path}/${key.replaceAll('~','~0').replaceAll('/','~1')}`);
  }
}

async function specificationErrors(specification:Record<string,unknown>) {
  const byPath=new Map(entries(specification));
  const errors:string[]=[];
  for(const [path,value] of byPath) {
    if(!path.endsWith('/$ref') || typeof value!=='string') continue;
    try {
      if(value.startsWith('#') && byPath.has(decodeURIComponent(value.slice(1)))) continue;
    } catch {}
    errors.push(`${path}: Ungültige Referenz ${value}`);
  }
  if(errors.length) return errors;

  const result=await new Validator({allErrors:true}).validate(specification);
  if(!result.valid) {
    if(!Array.isArray(result.errors)) return [`/: ${result.errors}`];
    return result.errors.map(error=>`${error.instancePath||'/'}: ${error.message}`);
  }

  // Das OpenAPI-Dokumentschema prüft keine Schlüsselwörter der eingebetteten JSON-Schemata.
  const schemas=new Ajv2020({allErrors:true});
  for(const [path,schema] of byPath) {
    if(!/\/(?:content\/[^/]+|parameters\/\d+)\/schema$|^\/components\/schemas\/[^/]+$/.test(path)) continue;
    if(!schemas.validateSchema(schema as object|boolean)) {
      for(const error of schemas.errors ?? []) errors.push(`${path}${error.instancePath}: ${error.message}`);
    }
  }
  return errors;
}

async function servedSpecification(): Promise<Record<string,unknown> & {info:{title?:string}}> {
  const response=await handle(new Request('http://desk.local/api/v1/openapi.json'));
  expect(response.status).toBe(200);
  return response.json();
}

test('Der ausgelieferte API-Vertrag entspricht dem Schema seiner OpenAPI-Version',async()=>{
  expect(await specificationErrors(await servedSpecification())).toEqual([]);
});

test('Der API-Vertrag beschreibt Seitennavigation nur für paginierte Listen',async()=>{
  const byPath=new Map(entries(await servedSpecification()));
  const paginated=new Set(['contacts','projects','projects~1{id}~1history','tasks','lines','locations','items','reservations','planning~1reservations','movements','costs']);
  for(const [path,value] of byPath){
    const operation=/^\/paths\/~1([^/]+)\/(?:get|post|patch|delete)\/parameters$/.exec(path);
    if(!operation) continue;
    const parameters=(value as {in:string;name:string}[]).filter(parameter=>parameter.in==='query');
    if(path.endsWith('/get/parameters') && paginated.delete(operation[1])){
      const operationPath=path.slice(0,-'/parameters'.length);
      expect(byPath.get(operationPath+'/description')).toMatch(/Reihenfolge.*Änderungen zwischen Seiten/);
      const interval=operation[1]==='planning~1reservations' ? ['from','to'].map(name=>
        expect.objectContaining({name,required:true,schema:expect.objectContaining({type:'string',format:'date-time'})})) : [];
      const taskOptions=operation[1]==='tasks' ? [expect.objectContaining({
        name:'include_kanban_position',required:false,schema:expect.objectContaining({const:'true'}),
      })] : [];
      expect(parameters).toEqual([
        ...interval,
        ...taskOptions,
        expect.objectContaining({name:'limit',schema:{type:'integer',minimum:1,maximum:200,default:100}}),
        expect.objectContaining({name:'offset',schema:{type:'integer',minimum:0,maximum:1_000_000,default:0}}),
      ]);
    }else{
      expect(parameters.filter(parameter=>parameter.name==='limit' || parameter.name==='offset')).toEqual([]);
    }
  }
  expect(paginated.size).toBe(0);
});

test('OpenAPI beschreibt den Anhangsdownload mit drei numerischen Kennungen und Binärantwort',async()=>{
  const byPath=new Map(entries(await servedSpecification()));
  const operation='/paths/~1projects~1{id}~1zammad~1attachment/get';
  const parameters=(byPath.get(operation+'/parameters') as {in:string}[]).filter(parameter=>parameter.in==='query');
  expect(parameters).toEqual(['ticket','article','attachment'].map(name=>expect.objectContaining({
    name,required:true,schema:expect.objectContaining({type:'integer',exclusiveMinimum:0}),
  })));
  expect(byPath.get(operation+'/responses/200/content/application~1octet-stream/schema')).toEqual({type:'string',format:'binary'});
});

test('Der API-Vertrag unterscheidet Sitzungen, Token und die Administrationsrolle',async()=>{
  const byPath=new Map(entries(await servedSpecification()));
  expect(byPath.get('/components/securitySchemes/session')).toMatchObject({type:'apiKey',in:'cookie',name:'desk-auth.session_token'});
  expect(byPath.get('/components/securitySchemes/secureSession')).toMatchObject({type:'apiKey',in:'cookie',name:'__Secure-desk-auth.session_token'});
  expect(byPath.get('/components/securitySchemes/token')).toMatchObject({
    type:'http',scheme:'bearer',description:expect.stringMatching(/Lese-Token.*Schreib-Token/),
  });
  expect(byPath.get('/paths/~1ready/get')).toMatchObject({security:[]});
  const adminOperations=new Set([
    '/paths/~1users/post','/paths/~1users~1{id}~1access/patch','/paths/~1tokens/get','/paths/~1tokens/post','/paths/~1tokens~1{id}/delete',
    '/paths/~1integrations~1zammad~1check/post',
  ]);
  const sessions=[{secureSession:[]},{session:[]}];
  const passwordPath='/paths/~1me~1password/patch';
  expect(byPath.get(passwordPath)).toMatchObject({
    security:sessions,description:expect.stringContaining('nur das eigene Konto'),
  });
  for(const [path,operation] of byPath){
    if(!/^\/paths\/[^/]+\/(?:get|post|patch|delete)$/.test(path) || path==='/paths/~1ready/get' || path===passwordPath) continue;
    if(adminOperations.delete(path)){
      expect(operation).toMatchObject({security:sessions,description:expect.stringContaining('Rolle Administration')});
    }else{
      expect(operation).toMatchObject({security:[...sessions,{token:[]}]});
    }
  }
  expect(adminOperations.size).toBe(0);
});

test('OpenAPI veröffentlicht die gültigen Jahres-, Offset- und Präzisionsgrenzen der Wochenplanung',async()=>{
  const byPath=new Map(entries(await servedSpecification()));
  const parameters=byPath.get('/paths/~1planning~1reservations/get/parameters') as {name:string; schema:object}[];
  const ajv=new Ajv2020({formats:{'date-time':true}});
  for (const name of ['from','to']) {
    const valid=ajv.compile(parameters.find(parameter=>parameter.name===name)!.schema);
    expect(valid('0001-01-01T00:00:00Z')).toBe(true);
    expect(valid('9999-12-31T23:59:59.123456+15:59')).toBe(true);
    expect(valid('0000-01-01T00:00:00Z')).toBe(false);
    expect(valid('2028-05-21T23:00:00.1234567Z')).toBe(false);
    expect(valid('2028-05-21T23:00:00+16:00')).toBe(false);
  }
});

test('Projektliste und Projektdetail entsprechen den ausgelieferten JSON-Schemata',async()=>{
  const database=process.env.DATABASE_URL;
  if(!database || !new URL(database).pathname.endsWith('_test')) throw new Error('Isolierte Testdatenbank erforderlich.');
  const byPath=new Map(entries(await servedSpecification()));
  const schemas=new Ajv2020({allErrors:true,formats:{
    uuid:(value:string)=>z.uuid().safeParse(value).success,
    'date-time':(value:string)=>z.iso.datetime().safeParse(value).success,
    uri:(value:string)=>URL.canParse(value),
  }});
  const responseSuffix='/get/responses/200/content/application~1json/schema';
  const listSchema=byPath.get('/paths/~1projects'+responseSuffix) as object;
  const detailSchema=byPath.get('/paths/~1projects~1{id}'+responseSuffix) as object;
  const validateList=schemas.compile(listSchema);
  const validateDetail=schemas.compile(detailSchema);
  const actor=await createAccount({email:crypto.randomUUID()+'@example.test',name:'Muster OpenAPI',role:'admin',password:'muster-test-passwort'});
  if(!actor) throw new Error('Testkonto konnte nicht angelegt werden.');
  const token=await createToken(actor,{label:'Projektantworten',scope:'read'});
  const contact=await saveCore('contacts',{name:'Muster Auftragsservice'}) as {id:string};
  async function read(path:string) {
    const response=await handle(new Request('http://desk.local/api/v1'+path,{headers:{Authorization:`Bearer ${token.token}`}}));
    expect(response.status).toBe(200);
    return response.json();
  }
  try {
    const first=await saveCore('projects',{name:'Musterauftrag ohne Angebot',contact_id:contact.id}) as {id:string};
    const second=await saveCore('projects',{name:'Büroinstallation',contact_id:contact.id,due:'2032-05-17'}) as {id:string};
    const offerId=crypto.randomUUID();
    const linkedOffer={status:'offen',url:`https://haben.example.test/angebote/${offerId}`,invoiceLink:null,fetchedAt:'2032-04-01T08:00:00.000Z'};
    await db.unsafe('UPDATE projects SET haben_offer_id=$1,haben_offer=($2::text)::jsonb,zammad_ticket_id=42,stage=$3 WHERE id=$4',
      [offerId,JSON.stringify(linkedOffer),'offered',second.id]);
    const plain=await read('/projects/'+first.id);
    const linked=await read('/projects/'+second.id);
    expect(plain).toMatchObject({due:null,haben_offer_id:null,haben_offer:null,zammad_ticket_id:null});
    expect(linked).toMatchObject({due:'2032-05-17T00:00:00.000Z',haben_offer_id:offerId,haben_offer:linkedOffer,zammad_ticket_id:42,stage:'offered'});
    expect(validateDetail(plain)).toBeTrue();
    expect(validateDetail(linked)).toBeTrue();
    const missingField={...plain};
    delete missingField.haben_offer;
    expect(validateDetail(missingField)).toBeFalse();
    const list=await read('/projects?limit=200');
    expect(list).toEqual(expect.arrayContaining([plain,linked]));
    expect(validateList(list)).toBeTrue();
    const empty=await read('/projects?offset=1000000');
    expect(empty).toEqual([]);
    expect(validateList(empty)).toBeTrue();
  } finally {
    await db.unsafe('DELETE FROM projects WHERE contact_id=$1',[contact.id]);
    await db.unsafe('DELETE FROM contacts WHERE id=$1',[contact.id]);
    await db.unsafe('DELETE FROM api_tokens WHERE id=$1',[token.id]);
    await db.unsafe('DELETE FROM users WHERE id=$1',[actor.id]);
  }
});

test('Die OpenAPI-Prüfung meldet den Pfad eines fehlenden Pflichtelements',async()=>{
  const invalid=structuredClone(await servedSpecification());
  delete invalid.info.title;
  expect(await specificationErrors(invalid)).toEqual(expect.arrayContaining([
    expect.stringMatching(/^\/info: .*title/),
  ]));
});

test('Die OpenAPI-Prüfung meldet den Pfad eines ungültigen JSON-Schema-Schlüsselworts',async()=>{
  const invalid=structuredClone(await servedSpecification());
  const ticket='/paths/~1projects~1{id}~1zammad~1link/post/requestBody/content/application~1json/schema/properties/id';
  const schema=new Map(entries(invalid)).get(ticket) as Record<string,unknown>;
  schema.exclusiveMinimum=true;
  expect(await specificationErrors(invalid)).toEqual(expect.arrayContaining([
    expect.stringContaining(ticket+'/exclusiveMinimum:'),
  ]));
});

test('Die OpenAPI-Prüfung meldet den Quellpfad einer nicht auflösbaren Referenz',async()=>{
  const invalid=structuredClone(await servedSpecification());
  const path='/paths/~1contacts/post/responses';
  const responses=new Map(entries(invalid)).get(path) as Record<string,unknown>;
  responses['201']={$ref:'#/components/responses/Missing'};
  expect(await specificationErrors(invalid)).toEqual([
    path+"/201/$ref: Ungültige Referenz #/components/responses/Missing",
  ]);
});
