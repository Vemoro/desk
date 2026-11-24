import { expect, test } from 'bun:test';
import { Validator } from '@seriousme/openapi-schema-validator';
import { handle } from '../src/server/api';

async function servedSpecification(): Promise<Record<string,unknown> & {info:{title?:string}}> {
  const response=await handle(new Request('http://desk.local/api/v1/openapi.json'));
  expect(response.status).toBe(200);
  return response.json();
}

test('Der ausgelieferte API-Vertrag entspricht dem Schema seiner OpenAPI-Version',async()=>{
  const specification=await servedSpecification();
  const result=await new Validator({allErrors:true}).validate(specification);
  if(!result.valid) {
    throw new Error(`Ungültige OpenAPI-Beschreibung: ${JSON.stringify(result.errors,null,2)}`);
  }
});

test('Die OpenAPI-Prüfung meldet den Pfad eines fehlenden Pflichtelements',async()=>{
  const invalid=structuredClone(await servedSpecification());
  delete invalid.info.title;
  const result=await new Validator().validate(invalid);
  expect(result.valid).toBe(false);
  expect(result.errors).toEqual(expect.arrayContaining([
    expect.objectContaining({instancePath:'/info',keyword:'required',params:{missingProperty:'title'}}),
  ]));
});
