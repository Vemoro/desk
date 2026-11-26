import { expect, test } from 'bun:test';
import { inspectFields } from '../scripts/check-fields';

const filename='src/ui/probe.tsx';

test('Ein Feld erhält seine Attribute aus dem Field-Callback',()=>{
  expect(inspectFields(filename,'<Field label="Name">{attrs=><input {...attrs}/>}</Field>')).toEqual([]);
  expect(inspectFields(filename,'<Field label="Name">{attrs=>{const common={...attrs,name:"name"};return <input {...common}/>}}</Field>')).toEqual([]);
  expect(inspectFields(filename,'<Field label="Name">{attrs=><input {...{name:"name"}}/>}</Field>')).toHaveLength(1);
  expect(inspectFields(filename,'<input type="checkbox"/>')).toHaveLength(1);
  expect(inspectFields('src/ui/account-password.tsx','<input type="checkbox" name="neu"/>')).toHaveLength(1);
});
