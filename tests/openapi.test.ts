import { expect, test } from 'bun:test';
import { Validator } from '@seriousme/openapi-schema-validator';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { handle } from '../src/server/api';

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
  const paginated=new Set(['contacts','projects','tasks','lines','locations','items','reservations','movements','costs']);
  for(const [path,value] of byPath){
    const operation=/^\/paths\/~1([^/]+)\/(?:get|post|patch|delete)\/parameters$/.exec(path);
    if(!operation) continue;
    const parameters=(value as {in:string}[]).filter(parameter=>parameter.in==='query');
    if(path.endsWith('/get/parameters') && paginated.delete(operation[1])){
      const operationPath=path.slice(0,-'/parameters'.length);
      expect(byPath.get(operationPath+'/description')).toMatch(/Reihenfolge.*Änderungen zwischen Seiten/);
      expect(parameters).toEqual([
        expect.objectContaining({name:'limit',schema:{type:'integer',minimum:1,maximum:200,default:100}}),
        expect.objectContaining({name:'offset',schema:{type:'integer',minimum:0,maximum:1_000_000,default:0}}),
      ]);
    }else{
      expect(parameters).toEqual([]);
    }
  }
  expect(paginated.size).toBe(0);
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
