import { expect, test } from 'bun:test';
import { parseCostCsv } from '../src/ui/cost-csv';

test('CSV liest BOM, CRLF, mehrzeilige Felder und doppelte Anführungszeichen',()=>{
  const csv='\uFEFF\r\nreference;name;amount;cost_center\r\n'
    +'B-1;"Aufbau ""Nord"";\r\nMaterial";4,05; K-01 \r\nB-2;Fahrt;2,50;\r\n';
  const rows=parseCostCsv(csv);
  expect(rows.map((row)=>row.line)).toEqual([3,5]);
  expect(rows[0].entry).toEqual({
    source:'haben-export',reference:'B-1',name:'Aufbau "Nord";\nMaterial',cents:405,cost_center:'K-01',
  });
  expect(rows[1].entry?.cents).toBe(250);
});

test('CSV meldet fehlerhafte Felder pro Zeile und lehnt doppelte Referenzen beidseitig ab',()=>{
  const rows=parseCostCsv('reference,name,amount\n B-1,Erster,4\nB-1,Zweiter,5\nB-2,,3\nB-3,Transport,1000000.01\nB-4,"Nicht geschlossen,3');
  expect(rows.map((row)=>row.line)).toEqual([2,3,4,5,6]);
  expect(rows[0].problems).toContain('reference: Doppelte Belegreferenz.');
  expect(rows[1].problems).toContain('reference: Doppelte Belegreferenz.');
  expect(rows[2].problems).toContain('name: Zwischen 1 und 160 Zeichen eingeben.');
  expect(rows[3].problems).toContain('amount: Betrag liegt außerhalb des zulässigen Bereichs.');
  expect(rows[4].problems).toContain('name: Nicht geschlossenes Anführungszeichen.');
  expect(rows.every((row)=>!row.entry)).toBe(true);
});

test('CSV blockiert ungültige oder mehrdeutige Kopfzeilen',()=>{
  expect(()=>parseCostCsv('name,amount\nFahrt,3')).toThrow('CSV-Kopfzeile');
  expect(()=>parseCostCsv('reference,name,amount,reference\nB-1,Fahrt,3,B-2')).toThrow('CSV-Kopfzeile');
});

test('Eine Referenz bleibt auch bei einem kaputten zweiten CSV-Datensatz doppelt',()=>{
  const rows=parseCostCsv('reference;name;amount\nB-1;Erster;1\nB-1;Defektes"Feld;2');
  expect(rows[0].problems).toContain('reference: Doppelte Belegreferenz.');
  expect(rows[1].problems).toContain('name: Ungültige Anführungszeichen.');
  expect(rows[1].problems).toContain('reference: Doppelte Belegreferenz.');
  expect(rows.every((row)=>!row.entry)).toBe(true);
});

test('CSV weist ungültige Zeichen dem jeweiligen Textfeld zu',()=>{
  const rows=parseCostCsv('reference;name;amount;cost_center\nB-1;Gültig;1;\nB-\0;Fahrt;2;\nB-2;Aus\0lage;2;\nB-3;Fahrt;2;K-\uD800');
  expect(rows[0].entry?.reference).toBe('B-1');
  expect(rows.slice(1).map(row=>row.problems)).toEqual([
    ['reference: Ungültige Zeichen.'],['name: Ungültige Zeichen.'],['cost_center: Ungültige Zeichen.'],
  ]);
  expect(rows.slice(1).every(row=>!row.entry)).toBe(true);
});
