import { expect, test } from 'bun:test';
import { configuredOrigin } from '../src/server/origin';

test('Desk normalisiert öffentliche HTTPS-Adressen und erlaubt lokale Testadressen',()=>{
  const previous=process.env.DESK_ORIGIN;
  try {
    delete process.env.DESK_ORIGIN;
    expect(configuredOrigin()).toBeUndefined();
    for(const [value,origin] of [
      ['https://desk.example.test','https://desk.example.test'],
      ['HTTPS://Desk.example.test:443/','https://desk.example.test'],
      ['https://desk.example.test:8443/','https://desk.example.test:8443'],
      ['http://localhost:4173/','http://localhost:4173'],
      ['http://127.0.0.1:4173','http://127.0.0.1:4173'],
      ['http://[::1]:4173','http://[::1]:4173'],
    ]){
      process.env.DESK_ORIGIN=value;
      expect(configuredOrigin()).toBe(origin);
    }
  } finally {
    if(previous===undefined) delete process.env.DESK_ORIGIN; else process.env.DESK_ORIGIN=previous;
  }
});

test('Desk lehnt ungültige öffentliche Adressen ohne Wiedergabe der Eingabe ab',()=>{
  const previous=process.env.DESK_ORIGIN;
  try {
    for(const value of [
      '', 'desk.example.test', 'https://[muster', 'http://desk.example.test',
      'https://muster:passwort@desk.example.test', 'https://@desk.example.test', 'https://desk.example.test/projekte',
      'https://desk.example.test/./', 'https://desk.example.test/?', 'https://desk.example.test/#',
      'https://desk.example.test/?token=muster', 'https://desk.example.test/#muster',
      'https://desk.example.test\u001b', 'https://desk.example.test/\u001f',
      'https://desk.example.test\\', 'https://desk.example.test\n', 'https:///desk.example.test',
    ]){
      process.env.DESK_ORIGIN=value;
      expect(configuredOrigin).toThrow(new Error('DESK_ORIGIN muss eine HTTPS-Basisadresse ohne Pfad, Zugangsdaten, Query oder Fragment sein. HTTP ist nur über Loopback zulässig.'));
    }
  } finally {
    if(previous===undefined) delete process.env.DESK_ORIGIN; else process.env.DESK_ORIGIN=previous;
  }
});
